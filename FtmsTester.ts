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
        this.ftmsManager.setLogCallback(this.logInteraction.bind(this)); // Add this line
    }

    // Add this new method to log interactions
    private logInteraction(message: string) {
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 23);
        const logEntry = `${timestamp} - ${message}`;
        if (!this.testResults.interactionLogs) {
            this.testResults.interactionLogs = [];
        }
        this.testResults.interactionLogs.push(logEntry);
        // Optionally, you can also pass this to a UI callback if needed immediately
        // console.log(logEntry); // For debugging during development
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
            this.logInteraction('INFO - Test: Attempting to connect to device.');
            await this.connectToDevice(device);
            this.testResults.connection.status = true;
            this.logInteraction('INFO - Test: Device connected successfully.');
            this.updateProgress(10, "서비스 확인 중...");
            this.logInteraction('INFO - Test: Discovering services and characteristics.');
            await this.identifyProtocols();
            this.logInteraction(`INFO - Test: Identified protocols: ${this.testResults.supportedProtocols.join(', ') || 'None'}.`);
            
            // Step 2: Read supported ranges if FTMS protocol is available
            if (this.testResults.supportedProtocols.includes("FTMS")) {
                this.updateProgress(20, "지원 범위 확인 중...");
                this.logInteraction('INFO - Test: Reading supported FTMS ranges.');
                await this.readSupportRanges();
                this.logInteraction('INFO - Test: Finished reading supported ranges.');
                
                // Step 3: Subscribe to notifications and monitor data fields
                this.updateProgress(30, "데이터 필드 모니터링 설정 중...");
                this.logInteraction('INFO - Test: Subscribing to FTMS notifications.');
                await this.monitorBikeData();
                this.logInteraction('INFO - Test: Subscribed to notifications and initial commands sent.');
                
                // Step 4: Test control points
                this.updateProgress(40, "제어 기능 테스트 중...");
                this.logInteraction('INFO - Test: Starting control point tests.');
                await this.testControlPoints();
                this.logInteraction('INFO - Test: Control point tests completed.');
                
                // Step 5: Let the test run for the remaining duration to collect data
                const elapsed = Date.now() - this.startTime;
                const remainingTime = Math.max(0, this.testDuration - elapsed);
                
                if (remainingTime > 0) {
                    this.updateProgress(50, "데이터 수집 중...");
                    this.logInteraction(`INFO - Test: Starting data collection phase for ${remainingTime / 1000} seconds.`);
                    await this.runDataCollection(remainingTime);
                    this.logInteraction('INFO - Test: Data collection phase ended.');
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
                this.logInteraction('INFO - Test: Starting limited CSC protocol testing.');
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
            this.logInteraction(`INFO - FTMSTester: Successfully connected to device ${device.id}`);
            
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
            this.logInteraction('INFO - FTMSTester: Identifying protocols.');
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
                this.logInteraction('INFO - FTMSTester: Reading FTMS features.');
                await this.readFtmsFeatures();
            }
            
        } catch (error) {
            this.logInteraction(`ERROR - FTMSTester: Error identifying protocols: ${error instanceof Error ? error.message : String(error)}`);
            this.testResults.issuesFound.push(`프로토콜 식별 오류: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    
    private async readFtmsFeatures(): Promise<void> {
        try {
            // Use the FTMSManager to read features
            this.logInteraction('INFO - FTMSTester: Attempting to read FTMS features characteristic.');
            const featureBits = await this.ftmsManager.readFTMSFeatures();
            this.logInteraction(`INFO - FTMSTester: FTMS Features raw bits: ${featureBits.toString(16)}`);
            
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
            this.logInteraction(`INFO - FTMSTester: Parsed FTMS features: ${JSON.stringify(features)}`);
            
        } catch (error) {
            this.logInteraction(`ERROR - FTMSTester: Error reading FTMS features: ${error instanceof Error ? error.message : String(error)}`);
            this.testResults.issuesFound.push(`FTMS 기능 읽기 오류: ${error instanceof Error ? error.message : String(error)}`);
            // Don't throw here to allow the test to continue
        }
    }

    private async readSupportRanges(): Promise<void> {
        try {
            if (!this.testResults.supportRanges) {
                this.testResults.supportRanges = {};
            }
            this.logInteraction('INFO - FTMSTester: Reading support ranges.');
            
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
                    this.logInteraction(`INFO - FTMSTester: Speed range: ${JSON.stringify(this.testResults.supportRanges.speed)}`);
                }
            } catch (e) {
                this.logInteraction(`WARN - FTMSTester: Speed range not available: ${e}`);
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
                    this.logInteraction(`INFO - FTMSTester: Incline range: ${JSON.stringify(this.testResults.supportRanges.incline)}`);
                }
            } catch (e) {
                this.logInteraction(`WARN - FTMSTester: Incline range not available: ${e}`);
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
                    this.logInteraction(`INFO - FTMSTester: Resistance range: ${JSON.stringify(this.testResults.supportRanges.resistance)}`);
                }
            } catch (e) {
                this.logInteraction(`WARN - FTMSTester: Resistance range not available: ${e}`);
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
                    this.logInteraction(`INFO - FTMSTester: Power range: ${JSON.stringify(this.testResults.supportRanges.power)}`);
                }
            } catch (e) {
                this.logInteraction(`WARN - FTMSTester: Power range not available: ${e}`);
                console.log("Power range not available:", e);
            }
            
        } catch (error) {
            this.logInteraction(`ERROR - FTMSTester: Error reading support ranges: ${error instanceof Error ? error.message : String(error)}`);
            this.testResults.issuesFound.push(`범위 특성 읽기 오류: ${error instanceof Error ? error.message : String(error)}`);
            // Don't throw here to allow the test to continue
        }
    }
    
    private async monitorBikeData(): Promise<void> {
        try {
            this.logInteraction('INFO - FTMSTester: Setting up notifications for Indoor Bike Data and Control Point.');
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
            this.logInteraction('INFO - FTMSTester: Sending initial FTMS commands (REQUEST_CONTROL, RESET, START).');
            await this.ftmsManager.requestControl();
            await this.ftmsManager.resetMachine();
            await this.ftmsManager.startMachine();
            
        } catch (error) {
            this.logInteraction(`ERROR - FTMSTester: Error subscribing to notifications: ${error instanceof Error ? error.message : String(error)}`);
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
                const resistanceLevel = 10; 
                
                this.resistanceTracking = {
                    commandPending: true,
                    lastCommandType: 'SET_RESISTANCE_LEVEL',
                    commandSentTime: Date.now(),
                    expectedResistance: resistanceLevel,
                    resistanceChangeNotedForLastCmd: false // Initialize
                };
                this.logInteraction(`INFO - FTMSTester: Sending SET_RESISTANCE_LEVEL: ${resistanceLevel}`);
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
                    expectedResistance: undefined, // Not directly expecting a specific resistance for power
                    resistanceChangeNotedForLastCmd: false // Initialize
                };
                this.logInteraction(`INFO - FTMSTester: Sending SET_TARGET_POWER: ${targetPower}W`);
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
                const windSpeed = 0; // Example
                const crr = 0.004; // Example Rolling Resistance Coefficient
                const cw = 0.5; // Example Wind Resistance Coefficient
                
                this.resistanceTracking = {
                    commandPending: true,
                    lastCommandType: 'SET_SIM_PARAMS',
                    commandSentTime: Date.now(),
                    expectedResistance: undefined, // Not directly expecting for sim params
                    resistanceChangeNotedForLastCmd: false // Initialize
                };
                this.logInteraction(`INFO - FTMSTester: Sending SET_SIM_PARAMS: Grade ${grade}%, Wind ${windSpeed} km/h, CRR ${crr}, CW ${cw}`);
                await this.ftmsManager.setSimulationParameters(windSpeed, grade, crr, cw); 
                
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
      private handleControlPointResponse(data: Buffer) {
        // This method is called by FTMSManager's notification handler
        // It needs to be adapted to use the logInteraction method if direct logging is needed here
        // For now, FTMSManager will handle logging of CP responses.
        const opCode = data[1];
        const resultCode = data[2];
        const commandName = this.ftmsManager.getOpCodeName(opCode);
        const resultName = this.ftmsManager.getResultCodeName(resultCode);

        this.logInteraction(`INFO - FTMSTester: Control Response Received - OpCode: ${opCode.toString(16)}, Result: ${resultCode.toString(16)} (${commandName}, ${resultName})`);

        if (this.resistanceTracking.commandPending && 
            (commandName === 'SET_RESISTANCE_LEVEL' || 
             commandName === 'SET_TARGET_POWER' || 
             commandName === 'SET_SIM_PARAMS')) {
            
            if (resultCode === 0x01) { // Success
                this.testResults.controlTests[commandName] = {
                    ...this.testResults.controlTests[commandName],
                    status: "OK", // Initially OK, will be verified by resistance change
                    details: `${commandName} successful. Waiting for resistance change.`
                };
                this.logInteraction(`INFO - FTMSTester: ${commandName} command successful via CP response.`);
                // Now we wait for handleBikeData to confirm the change
            } else {
                this.testResults.controlTests[commandName] = {
                    ...this.testResults.controlTests[commandName],
                    status: "Failed",
                    details: `${commandName} failed. Result: ${resultName} (${resultCode.toString(16)})`
                };
                this.resistanceTracking.commandPending = false;
                this.logInteraction(`ERROR - FTMSTester: ${commandName} command failed via CP response. Result: ${resultName}`);
            }
        }
    }

    private handleBikeData(data: any) {
        // This method is called by FTMSManager's notification handler
        // It needs to be adapted to use the logInteraction method if direct logging is needed here
        // For now, FTMSManager will handle logging of Bike Data.
        // Update data fields
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
            const newResistance = data.resistanceLevel;
            if (this.lastResistanceLevel !== newResistance) {
                this.testResults = trackResistanceChange(
                    this.testResults, 
                    'Resistance Level', 
                    newResistance, 
                    this.lastResistanceLevel,
                    this.resistanceTracking.commandPending ? this.resistanceTracking.lastCommandType : '자동 변경'
                );
                this.logInteraction(`INFO - FTMSTester: Resistance changed from ${this.lastResistanceLevel} to ${newResistance}. Command pending: ${this.resistanceTracking.commandPending}, Type: ${this.resistanceTracking.lastCommandType}`);

                if (this.resistanceTracking.commandPending && 
                    !this.resistanceTracking.resistanceChangeNotedForLastCmd) {
                    
                    const commandName = this.resistanceTracking.lastCommandType;
                    let commandSuccess = false;

                    if (commandName === 'SET_RESISTANCE_LEVEL') {
                        if (newResistance === this.resistanceTracking.expectedResistance) {
                            commandSuccess = true;
                            this.logInteraction(`INFO - FTMSTester: SET_RESISTANCE_LEVEL to ${this.resistanceTracking.expectedResistance} confirmed by bike data (new resistance: ${newResistance}).`);
                        } else {
                            this.logInteraction(`WARN - FTMSTester: SET_RESISTANCE_LEVEL to ${this.resistanceTracking.expectedResistance} expected, but bike data shows ${newResistance}.`);
                        }
                    } else if (commandName === 'SET_TARGET_POWER' || commandName === 'SET_SIM_PARAMS') {
                        // For power/sim, any change in resistance after command is initially considered a success.
                        // More sophisticated checks could be added (e.g. if power output changes as expected)
                        commandSuccess = true; 
                        this.logInteraction(`INFO - FTMSTester: ${commandName} appears to have changed resistance (new resistance: ${newResistance}).`);
                    }

                    if (commandSuccess) {
                        this.testResults.controlTests[commandName] = {
                            ...this.testResults.controlTests[commandName],
                            status: "OK",
                            details: `${commandName} successful. Resistance changed to ${newResistance}.`
                        };
                        this.resistanceTracking.resistanceChangeNotedForLastCmd = true; // Mark as noted
                        // this.resistanceTracking.commandPending = false; // Keep pending until timeout or next command
                    } else if (this.testResults.controlTests[commandName]?.status !== "Failed") {
                        // If CP response was OK, but resistance didn't match for SET_RESISTANCE_LEVEL
                        this.testResults.controlTests[commandName] = {
                            ...this.testResults.controlTests[commandName],
                            status: "Failed",
                            details: `${commandName} to ${this.resistanceTracking.expectedResistance} failed. Bike reported ${newResistance}.`
                        };
                    }
                }
                this.lastResistanceLevel = newResistance;
            }
            this.testResults = updateDataField(this.testResults, 'resistance', data.resistanceLevel);
        }
        if (data.totalDistance !== undefined) {
            this.testResults = updateDataField(this.testResults, 'distance', data.totalDistance);
        }
        if (data.heartRate !== undefined) {
            this.testResults = updateDataField(this.testResults, 'heartRate', data.heartRate);
        }
    }
    
    private async runDataCollection(duration: number): Promise<void> {
        return new Promise((resolve) => {
            this.logInteraction(`INFO - FTMSTester: Starting data collection phase for ${duration / 1000} seconds.`);
            this.testTimeoutId = setTimeout(() => {
                this.logInteraction('INFO - FTMSTester: Data collection phase ended.');
                // Check any pending resistance commands that didn't get a bike data confirmation
                if (this.resistanceTracking.commandPending && !this.resistanceTracking.resistanceChangeNotedForLastCmd) {
                    const commandName = this.resistanceTracking.lastCommandType;
                    if (this.testResults.controlTests[commandName] && this.testResults.controlTests[commandName].status !== "Failed") {
                        this.testResults.controlTests[commandName] = {
                            ...this.testResults.controlTests[commandName],
                            status: "Failed",
                            details: `${commandName} did not result in an observed resistance change within timeout.`
                        };
                        this.logInteraction(`WARN - FTMSTester: ${commandName} timed out waiting for resistance change confirmation from bike data.`);
                    }
                }
                this.resistanceTracking.commandPending = false; // Clear pending state after timeout

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
