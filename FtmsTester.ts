// FtmsTester.ts - FTMS testing functionality for IsYafit app
import { Device } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { FTMSManager } from './FtmsManager';
import { 
    RANGE_CHAR_UUIDS, 
    TestResults, 
    RangeInfo, 
    initTestResults, 
    updateDataField,
    trackResistanceChange,
    parseRangeCharacteristic,
    finalizeTestReport
} from './FtmsTestReport';

export class FTMSTester {
    private ftmsManager: FTMSManager;
    private testResults: TestResults;
    private isTestRunning: boolean = false;
    private startTime: number = 0;
    private testDuration: number = 30000; // Default test duration in ms
    private lastResistanceLevel?: number;
    private onProgressUpdate?: (progress: number, message: string) => void;
    private onTestComplete?: (results: TestResults) => void;
    private testTimeoutId?: NodeJS.Timeout;
    private resistanceTracking = {
        commandPending: false,
        lastCommandType: '',
        commandSentTime: 0,
        expectedResistance: undefined as number | undefined,
        resistanceChangeNotedForLastCmd: false // Added
    };

    constructor(ftmsManager: FTMSManager) {
        this.ftmsManager = ftmsManager;
        this.testResults = initTestResults();
    }

    // Main testing flow
    async runDeviceTest(
        device: Device, 
        duration: number = 30000,
        onProgressUpdate?: (progress: number, message: string) => void,
        onTestComplete?: (results: TestResults) => void
    ): Promise<TestResults> {
        if (this.isTestRunning) {
            throw new Error("테스트가 이미 실행 중입니다.");
        }

        this.testResults = initTestResults();
        this.isTestRunning = true;
        this.startTime = Date.now();
        this.testDuration = duration;
        this.onProgressUpdate = onProgressUpdate;
        this.onTestComplete = onTestComplete;
        
        // Update device info
        this.testResults.deviceInfo = {
            name: device.name || 'Unknown Device',
            address: device.id,
            services: []
        };
        this.testResults.connection.timestamp = this.startTime;
        
        try {
            // Step 1: Connect to device and discover services
            this.updateProgress(5, "기기에 연결 중...");
            await this.connectToDevice(device);
            this.testResults.connection.status = true;
            this.updateProgress(10, "서비스 확인 중...");
            await this.identifyProtocols();
            
            // Step 2: Read supported ranges if FTMS protocol is available
            if (this.testResults.supportedProtocols.includes("FTMS")) {
                this.updateProgress(20, "지원 범위 확인 중...");
                await this.readSupportRanges();
                
                // Step 3: Subscribe to notifications and monitor data fields
                this.updateProgress(30, "데이터 필드 모니터링 설정 중...");
                await this.monitorBikeData();
                
                // Step 4: Test control points
                this.updateProgress(40, "제어 기능 테스트 중...");
                await this.testControlPoints();
                
                // Step 5: Let the test run for the remaining duration to collect data
                const elapsed = Date.now() - this.startTime;
                const remainingTime = Math.max(0, this.testDuration - elapsed);
                
                if (remainingTime > 0) {
                    this.updateProgress(50, "데이터 수집 중...");
                    await this.runDataCollection(remainingTime);
                }
                
                // Finalize the test
                this.updateProgress(90, "호환성 분석 중...");
                this.testResults = finalizeTestReport(this.testResults);
                
                // Complete
                this.updateProgress(100, "테스트 완료");
                if (this.onTestComplete) {
                    this.onTestComplete(this.testResults);
                }
                
            } else if (this.testResults.supportedProtocols.includes("CSC")) {
                // Limited CSC protocol testing
                this.updateProgress(30, "CSC 데이터 모니터링 중...");
                await this.monitorCscData();
                
                // Let it run for a while to collect data
                const elapsed = Date.now() - this.startTime;
                const remainingTime = Math.max(0, this.testDuration - elapsed);
                
                if (remainingTime > 0) {
                    await new Promise(resolve => setTimeout(resolve, remainingTime));
                }
                
                // Finalize CSC test
                this.testResults = finalizeTestReport(this.testResults);
                this.updateProgress(100, "CSC 테스트 완료 (제한된 기능)");
                if (this.onTestComplete) {
                    this.onTestComplete(this.testResults);
                }
            } else {
                // No supported protocols
                this.testResults.reasons.push("지원되는 프로토콜(FTMS, CSC)을 찾을 수 없습니다.");
                this.testResults = finalizeTestReport(this.testResults);
                this.updateProgress(100, "호환 불가능한 프로토콜");
                if (this.onTestComplete) {
                    this.onTestComplete(this.testResults);
                }
            }
            
        } catch (error) {
            console.error("Device test error:", error);
            this.testResults.issuesFound.push(`테스트 오류: ${error instanceof Error ? error.message : String(error)}`);
            this.testResults = finalizeTestReport(this.testResults);
            if (this.onTestComplete) {
                this.onTestComplete(this.testResults);
            }
        } finally {
            this.isTestRunning = false;
            if (this.testTimeoutId) {
                clearTimeout(this.testTimeoutId);
            }
        }
        
        return this.testResults;
    }

    // Stop an ongoing test
    stopTest(): void {
        if (!this.isTestRunning) return;
        
        if (this.testTimeoutId) {
            clearTimeout(this.testTimeoutId);
        }
        
        this.isTestRunning = false;
        this.testResults = finalizeTestReport(this.testResults);
        
        if (this.onTestComplete) {
            this.onTestComplete(this.testResults);
        }
    }

    private async connectToDevice(device: Device): Promise<void> {
        try {
            await this.ftmsManager.connectToDevice(device.id);
            
            // Get the list of services
            const connectedDevice = this.ftmsManager.getConnectedDevice();
            if (!connectedDevice) {
                throw new Error("기기 연결 실패");
            }
            
            // Update test results
            this.testResults.deviceInfo.name = connectedDevice.name || device.name || 'Unknown Device';
            this.testResults.deviceInfo.address = connectedDevice.id;
            
        } catch (error) {
            this.testResults.connection.status = false;
            this.testResults.issuesFound.push(`연결 오류: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    private async identifyProtocols(): Promise<void> {
        try {
            // Read device services and identify supported protocols
            const device = this.ftmsManager.getConnectedDevice();
            if (!device) {
                throw new Error("기기가 연결되지 않았습니다.");
            }
            
            // Get all services
            await device.discoverAllServicesAndCharacteristics();
            const services = await device.services();
            
            const serviceUUIDs = services.map(s => s.uuid.toLowerCase());
            this.testResults.deviceInfo.services = serviceUUIDs;
            
            const supportedProtocols = [];
            
            // FTMS
            if (serviceUUIDs.includes("00001826-0000-1000-8000-00805f9b34fb")) {
                supportedProtocols.push("FTMS");
            }
            
            // CSC (Cycling Speed and Cadence)
            if (serviceUUIDs.includes("00001816-0000-1000-8000-00805f9b34fb")) {
                supportedProtocols.push("CSC");
            }
            
            // Custom protocols can be added here if needed
            
            this.testResults.supportedProtocols = supportedProtocols;
            
            // Set primary protocol
            if (supportedProtocols.includes("FTMS")) {
                this.testResults.deviceInfo.protocol = "FTMS (표준)";
            } else if (supportedProtocols.includes("CSC")) {
                this.testResults.deviceInfo.protocol = "CSC (표준)";
            } else if (supportedProtocols.length > 0) {
                this.testResults.deviceInfo.protocol = `${supportedProtocols[0]} (커스텀)`;
            } else {
                this.testResults.deviceInfo.protocol = "알 수 없음";
                this.testResults.issuesFound.push("지원되는 프로토콜을 식별할 수 없습니다.");
            }
            
            // Read FTMS features if available
            if (supportedProtocols.includes("FTMS")) {
                await this.readFtmsFeatures();
            }
            
        } catch (error) {
            this.testResults.issuesFound.push(`프로토콜 식별 오류: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    
    private async readFtmsFeatures(): Promise<void> {
        try {
            // Use the FTMSManager to read features
            const featureBits = await this.ftmsManager.readFTMSFeatures();
            
            // Map feature bits to feature names
            const featuresMap: { [key: number]: string } = {
                0x0001: "average_speed",
                0x0002: "cadence",
                0x0004: "total_distance",
                0x0008: "inclination",
                0x0010: "elevation_gain",
                0x0020: "pace",
                0x0040: "step_count",
                0x0080: "resistance_level",
                0x0100: "stride_count",
                0x0200: "expended_energy",
                0x0400: "heart_rate",
                0x0800: "metabolic_equivalent",
                0x1000: "elapsed_time",
                0x2000: "remaining_time",
                0x4000: "power_measurement",
                0x8000: "force_on_belt"
            };
            
            const features: { [key: string]: boolean } = {};
            
            for (const [bit, featureName] of Object.entries(featuresMap)) {
                const bitValue = parseInt(bit);
                if (featureBits & bitValue) {
                    features[featureName] = true;
                }
            }
            
            this.testResults.features = features;
            
        } catch (error) {
            this.testResults.issuesFound.push(`FTMS 기능 읽기 오류: ${error instanceof Error ? error.message : String(error)}`);
            // Don't throw here to allow the test to continue
        }
    }

    private async readSupportRanges(): Promise<void> {
        try {
            if (!this.testResults.supportRanges) {
                this.testResults.supportRanges = {};
            }
            
            const device = this.ftmsManager.getConnectedDevice();
            if (!device) {
                throw new Error("기기가 연결되지 않았습니다.");
            }
            
            // Read Speed Range
            try {
                const speedChar = await device.readCharacteristicForService(
                    "00001826-0000-1000-8000-00805f9b34fb",
                    RANGE_CHAR_UUIDS.SPEED_RANGE
                );
                
                if (speedChar.value) {
                    const buffer = Buffer.from(speedChar.value, 'base64');
                    const range = parseRangeCharacteristic(buffer);
                    
                    // Speed is in units of 0.01 km/h
                    this.testResults.supportRanges.speed = {
                        min: range.min / 100,
                        max: range.max / 100,
                        increment: range.increment / 100
                    };
                }
            } catch (e) {
                console.log("Speed range not available:", e);
            }
            
            // Read Incline Range
            try {
                const inclineChar = await device.readCharacteristicForService(
                    "00001826-0000-1000-8000-00805f9b34fb",
                    RANGE_CHAR_UUIDS.INCLINE_RANGE
                );
                
                if (inclineChar.value) {
                    const buffer = Buffer.from(inclineChar.value, 'base64');
                    const range = parseRangeCharacteristic(buffer);
                    
                    // Incline is in units of 0.1 %
                    this.testResults.supportRanges.incline = {
                        min: range.min / 10,
                        max: range.max / 10,
                        increment: range.increment / 10
                    };
                }
            } catch (e) {
                console.log("Incline range not available:", e);
            }
            
            // Read Resistance Range
            try {
                const resistanceChar = await device.readCharacteristicForService(
                    "00001826-0000-1000-8000-00805f9b34fb",
                    RANGE_CHAR_UUIDS.RESISTANCE_RANGE
                );
                
                if (resistanceChar.value) {
                    const buffer = Buffer.from(resistanceChar.value, 'base64');
                    const range = parseRangeCharacteristic(buffer);
                    
                    this.testResults.supportRanges.resistance = {
                        min: range.min,
                        max: range.max,
                        increment: range.increment
                    };
                }
            } catch (e) {
                console.log("Resistance range not available:", e);
            }
            
            // Read Power Range
            try {
                const powerChar = await device.readCharacteristicForService(
                    "00001826-0000-1000-8000-00805f9b34fb",
                    RANGE_CHAR_UUIDS.POWER_RANGE
                );
                
                if (powerChar.value) {
                    const buffer = Buffer.from(powerChar.value, 'base64');
                    const range = parseRangeCharacteristic(buffer);
                    
                    // Power is in watts
                    this.testResults.supportRanges.power = {
                        min: range.min,
                        max: range.max,
                        increment: range.increment
                    };
                }
            } catch (e) {
                console.log("Power range not available:", e);
            }
            
        } catch (error) {
            this.testResults.issuesFound.push(`범위 특성 읽기 오류: ${error instanceof Error ? error.message : String(error)}`);
            // Don't throw here to allow the test to continue
        }
    }
    
    private async monitorBikeData(): Promise<void> {
        try {
            await this.ftmsManager.subscribeToNotifications(
                // Control Point Response handler
                (data: Buffer) => {
                    this.handleControlPointResponse(data);
                },
                // Indoor Bike Data handler
                (data) => {
                    this.handleBikeData(data);
                }
            );
            
            // Send initial commands to activate the device
            await this.ftmsManager.requestControl();
            await this.ftmsManager.resetMachine();
            await this.ftmsManager.startMachine();
            
        } catch (error) {
            this.testResults.issuesFound.push(`알림 구독 오류: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    
    private async monitorCscData(): Promise<void> {
        try {
            // CSC monitoring would be implemented here
            this.testResults.issuesFound.push("CSC 데이터 모니터링은 현재 구현되지 않았습니다.");
            
            // Placeholder for future CSC monitoring implementation
            
        } catch (error) {
            this.testResults.issuesFound.push(`CSC 알림 오류: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    
    private async testControlPoints(): Promise<void> {
        try {
            if (!this.testResults.controlTests) {
                this.testResults.controlTests = {};
            }

            // Test SET_RESISTANCE_LEVEL
            try {
                // Use a common test resistance level, e.g., 5.
                // This might need to be adjusted based on device's supported range,
                // which should be read by readSupportRanges if available.
                const resistanceLevel = 5; 
                
                this.resistanceTracking = {
                    commandPending: true,
                    lastCommandType: 'SET_RESISTANCE_LEVEL',
                    commandSentTime: Date.now(),
                    expectedResistance: resistanceLevel,
                    resistanceChangeNotedForLastCmd: false // Initialize
                };
                
                await this.ftmsManager.setResistance(resistanceLevel);
                
                // Result will be handled by the control point response handler
                this.testResults.controlTests['SET_RESISTANCE_LEVEL'] = {
                    status: "Pending", 
                    timestamp: Date.now(),
                    details: `Resistance level: ${resistanceLevel}`
                };
                
                // Wait a bit to let the device respond
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (e) {
                this.testResults.controlTests['SET_RESISTANCE_LEVEL'] = {
                    status: "Failed", 
                    timestamp: Date.now(),
                    details: `Error: ${e instanceof Error ? e.message : String(e)}`
                };
            }
            
            // Test SET_TARGET_POWER
            try {
                // Use 100W as a standard test value
                const targetPower = 100;
                
                this.resistanceTracking = {
                    commandPending: true,
                    lastCommandType: 'SET_TARGET_POWER',
                    commandSentTime: Date.now(),
                    expectedResistance: undefined,
                    resistanceChangeNotedForLastCmd: false // Initialize
                };
                
                await this.ftmsManager.setTargetPower(targetPower);
                
                this.testResults.controlTests['SET_TARGET_POWER'] = {
                    status: "Pending", 
                    timestamp: Date.now(),
                    details: `Target power: ${targetPower}W`
                };
                
                // Wait a bit to let the device respond
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (e) {
                this.testResults.controlTests['SET_TARGET_POWER'] = {
                    status: "Failed", 
                    timestamp: Date.now(),
                    details: `Error: ${e instanceof Error ? e.message : String(e)}`
                };
            }
            
            // Test SET_SIM_PARAMS
            try {
                // Test with 10% grade
                const grade = 10;
                
                this.resistanceTracking = {
                    commandPending: true,
                    lastCommandType: 'SET_SIM_PARAMS',
                    commandSentTime: Date.now(),
                    expectedResistance: undefined,
                    resistanceChangeNotedForLastCmd: false // Initialize
                };
                
                await this.ftmsManager.setSimulationParameters(0, grade, 0.004, 0.5);
                
                this.testResults.controlTests['SET_SIM_PARAMS'] = {
                    status: "Pending", 
                    timestamp: Date.now(),
                    details: `Grade: ${grade}%, Wind: 0 m/s, CRR: 0.004, CW: 0.5`
                };
                
                // Wait a bit to let the device respond
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (e) {
                this.testResults.controlTests['SET_SIM_PARAMS'] = {
                    status: "Failed", 
                    timestamp: Date.now(),
                    details: `Error: ${e instanceof Error ? e.message : String(e)}`
                };
            }
            
        } catch (error) {
            this.testResults.issuesFound.push(`제어 포인트 테스트 오류: ${error instanceof Error ? error.message : String(error)}`);
            // Don't throw here to allow the test to continue
        }
    }
      private handleControlPointResponse(data: Buffer): void {
        if (data.length < 3) return;
        
        const responseOpCode = data[0];
        const requestOpCode = data[1];
        const resultCode = data[2];
        
        if (responseOpCode !== 0x80) return; // Not a control point response
        
        // Result code 해석
        const resultString = this.getResultCodeString(resultCode);
        const responseTime = this.resistanceTracking.commandPending ? 
            ` (응답시간: ${Date.now() - this.resistanceTracking.commandSentTime}ms)` : '';
        
        // Update the control test result based on the response
        if (requestOpCode === 0x04 && this.testResults.controlTests?.['SET_RESISTANCE_LEVEL']) { // SET_RESISTANCE_LEVEL
            this.testResults.controlTests['SET_RESISTANCE_LEVEL'].status = resultCode === 0x01 ? "OK" : "Failed";
            this.testResults.controlTests['SET_RESISTANCE_LEVEL'].details += 
                ` (응답: ${resultString}${responseTime})`;
            
            if (resultCode !== 0x01) {
                this.testResults.issuesFound.push(`저항 수준 설정 오류 (코드: ${resultCode} - ${resultString})`);
            }
        } else if (requestOpCode === 0x05 && this.testResults.controlTests?.['SET_TARGET_POWER']) { // SET_TARGET_POWER
            this.testResults.controlTests['SET_TARGET_POWER'].status = resultCode === 0x01 ? "OK" : "Failed";
            this.testResults.controlTests['SET_TARGET_POWER'].details += 
                ` (응답: ${resultString}${responseTime})`;
            
            if (resultCode !== 0x01) {
                this.testResults.issuesFound.push(`목표 파워 설정 오류 (코드: ${resultCode} - ${resultString})`);
            } else {
                // 성공 시 추가 설명
                this.testResults.controlTests['SET_TARGET_POWER'].details += ' - 파워 목표 설정 확인됨';
            }
        } else if (requestOpCode === 0x11 && this.testResults.controlTests?.['SET_SIM_PARAMS']) { // SET_SIM_PARAMS
            this.testResults.controlTests['SET_SIM_PARAMS'].status = resultCode === 0x01 ? "OK" : "Failed";
            this.testResults.controlTests['SET_SIM_PARAMS'].details += 
                ` (응답: ${resultString}${responseTime})`;
            
            if (resultCode !== 0x01) {
                this.testResults.issuesFound.push(`시뮬레이션 파라미터 설정 오류 (코드: ${resultCode} - ${resultString})`);
            } else {
                // 성공 시 추가 설명
                this.testResults.controlTests['SET_SIM_PARAMS'].details += ' - 경사도 시뮬레이션 적용됨';
            }
        }
        
        // Reset resistance tracking
        if (this.resistanceTracking.commandPending && 
            (requestOpCode === 0x04 || requestOpCode === 0x05 || requestOpCode === 0x11)) {
            this.resistanceTracking.commandPending = false;
        }
    }
    
    // FTMS 제어 응답 코드를 의미있는 문자열로 변환
    private getResultCodeString(resultCode: number): string {
        switch(resultCode) {
            case 0x01: return '성공';
            case 0x02: return '잘못된 파라미터';
            case 0x03: return '작업 실패';
            case 0x04: return '제어 권한 없음';
            case 0x05: return '잘못된 상태';
            default: return `알 수 없음(${resultCode})`;
        }
    }
    
    private handleBikeData(data: any): void {
        // Track data fields
        if (data.instantaneousSpeed !== undefined) {
            this.testResults = updateDataField(this.testResults, 'speed', data.instantaneousSpeed);
        }
        
        if (data.instantaneousCadence !== undefined) {
            this.testResults = updateDataField(this.testResults, 'cadence', data.instantaneousCadence);
        }
        
        if (data.instantaneousPower !== undefined) {
            this.testResults = updateDataField(this.testResults, 'power', data.instantaneousPower);
        }
          if (data.resistanceLevel !== undefined) {
            this.testResults = updateDataField(this.testResults, 'resistance', data.resistanceLevel);
            
            // Track resistance changes
            if (this.lastResistanceLevel !== undefined && 
                this.lastResistanceLevel !== data.resistanceLevel) {
                
                let changeSource = '자동 변경';
                let attributedToCommandType: string | undefined = undefined;
                const currentTime = Date.now();
                const timeSinceLastCommand = currentTime - this.resistanceTracking.commandSentTime;

                // If a relevant command was sent recently (e.g., within 5 seconds)
                if (this.resistanceTracking.lastCommandType && timeSinceLastCommand < 5000) {
                    switch(this.resistanceTracking.lastCommandType) {
                        case 'SET_RESISTANCE_LEVEL':
                            changeSource = `저항 레벨 명령 (${this.resistanceTracking.lastCommandType})`;
                            attributedToCommandType = this.resistanceTracking.lastCommandType;
                            break;
                        case 'SET_TARGET_POWER':
                            changeSource = `목표 파워 명령 (${this.resistanceTracking.lastCommandType})`;
                            attributedToCommandType = this.resistanceTracking.lastCommandType;
                            break;
                        case 'SET_SIM_PARAMS':
                            changeSource = `경사도 시뮬레이션 명령 (${this.resistanceTracking.lastCommandType})`;
                            attributedToCommandType = this.resistanceTracking.lastCommandType;
                            break;
                    }
                    if (attributedToCommandType) {
                         changeSource += ` (저항 변경까지: ${timeSinceLastCommand}ms)`;
                    }
                }
                
                this.testResults = trackResistanceChange(
                    this.testResults,
                    'resistance',
                    data.resistanceLevel,
                    this.lastResistanceLevel,
                    changeSource
                );
                
                // Specific check for SET_RESISTANCE_LEVEL outcome
                if (attributedToCommandType === 'SET_RESISTANCE_LEVEL' &&
                    this.resistanceTracking.expectedResistance !== undefined) {
                        
                    const controlTestEntry = this.testResults.controlTests?.['SET_RESISTANCE_LEVEL'];
                    if (controlTestEntry) {
                        if (data.resistanceLevel === this.resistanceTracking.expectedResistance) {
                            controlTestEntry.status = "OK";
                            controlTestEntry.details += ` (실제 저항 확인됨: ${this.lastResistanceLevel} → ${data.resistanceLevel})`;
                        } else {
                            controlTestEntry.details += ` (경고: 저항이 예상(${this.resistanceTracking.expectedResistance})과 다르게 변경됨: ${this.lastResistanceLevel} → ${data.resistanceLevel})`;
                            this.testResults.issuesFound.push(
                                `저항 수준 설정 후 예상치 불일치: 예상 ${this.resistanceTracking.expectedResistance}, 실제 ${data.resistanceLevel} (명령 후 ${timeSinceLastCommand}ms)`
                            );
                        }
                        this.resistanceTracking.expectedResistance = undefined; // Mark expectation as checked
                    }
                }

                // Add confirmation for SET_TARGET_POWER and SET_SIM_PARAMS if resistance changed post-command
                if (!this.resistanceTracking.resistanceChangeNotedForLastCmd) {
                    if (attributedToCommandType === 'SET_TARGET_POWER') {
                        const controlTestEntry = this.testResults.controlTests?.['SET_TARGET_POWER'];
                        if (controlTestEntry && controlTestEntry.status === "OK") { // If command was ack'd
                            controlTestEntry.details += ` (저항 변경 관찰됨: ${this.lastResistanceLevel} → ${data.resistanceLevel}, 명령 후 ${timeSinceLastCommand}ms)`;
                            this.resistanceTracking.resistanceChangeNotedForLastCmd = true;
                        }
                    } else if (attributedToCommandType === 'SET_SIM_PARAMS') {
                        const controlTestEntry = this.testResults.controlTests?.['SET_SIM_PARAMS'];
                        if (controlTestEntry && controlTestEntry.status === "OK") { // If command was ack'd
                            controlTestEntry.details += ` (저항 변경 관찰됨: ${this.lastResistanceLevel} → ${data.resistanceLevel}, 명령 후 ${timeSinceLastCommand}ms)`;
                            this.resistanceTracking.resistanceChangeNotedForLastCmd = true;
                        }
                    }
                }
            }
            
            this.lastResistanceLevel = data.resistanceLevel;
        }
        
        if (data.heartRate !== undefined) {
            this.testResults = updateDataField(this.testResults, 'heartRate', data.heartRate);
        }
        
        if (data.totalDistance !== undefined) {
            this.testResults = updateDataField(this.testResults, 'distance', data.totalDistance);
        }
    }
    
    private async runDataCollection(duration: number): Promise<void> {
        return new Promise((resolve) => {
            this.testTimeoutId = setTimeout(() => {
                resolve();
            }, duration);
        });
    }
    
    private updateProgress(progress: number, message: string): void {
        if (this.onProgressUpdate) {
            this.onProgressUpdate(progress, message);
        }
    }
}
