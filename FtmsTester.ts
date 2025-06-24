// FtmsTester.ts - FTMS testing functionality for IsYafit app
import { Device } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { FTMSManager, ProtocolType } from './FtmsManager';
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

// 사용자 상호작용 요청을 위한 타입 정의
export interface UserInteractionRequest {
    type: 'command_start' | 'resistance_check';
    commandName: string;
    commandDescription: string;
    message: string;
}

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
        resistanceChangeNotedForLastCmd: false,
        commandCompletedTime: 0, // Track when command was fully completed
        allowResistanceAttributionWindow: 0 // Time window to still attribute resistance changes to last command
    };

    // Tacx 사용자 상호작용 테스트를 위한 콜백들
    private onUserInteractionRequest?: (interaction: UserInteractionRequest) => Promise<boolean>;
    private onCountdownUpdate?: (countdown: number) => void;

    constructor(ftmsManager: FTMSManager) {
        this.ftmsManager = ftmsManager;
        this.testResults = initTestResults();
        // this.ftmsManager.setLogCallback(this.logInteraction.bind(this)); // Remove this line
    }

    // 사용자 상호작용 요청을 위한 인터페이스
    public setUserInteractionCallbacks(
        onUserInteractionRequest: (interaction: UserInteractionRequest) => Promise<boolean>,
        onCountdownUpdate?: (countdown: number) => void
    ) {
        this.onUserInteractionRequest = onUserInteractionRequest;
        this.onCountdownUpdate = onCountdownUpdate;
    }

    // Check if device is still connected
    private isDeviceConnected(): boolean {
        const connectedDevice = this.ftmsManager.getConnectedDevice();
        return connectedDevice !== null && connectedDevice !== undefined;
    }

    // Check connection and stop test if disconnected
    private checkConnectionAndStopIfNeeded(): boolean {
        if (!this.isDeviceConnected()) {
            this.logInteraction('ERROR - Test: Device connection lost, stopping test.');
            this.testResults.issuesFound.push('테스트 중 기기 연결이 끊어졌습니다.');
            this.stopTest();
            return false;
        }
        return true;
    }

    // Add this new method to log interactions
    private logInteraction(message: string) {
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 23);
        const logEntry = `${timestamp} - ${message}`;
        if (!this.testResults.interactionLogs) {
            this.testResults.interactionLogs = [];
        }
        this.testResults.interactionLogs.push(logEntry);
        
        // Add console logging for debugging - especially for status changes
        if (message.includes('SUCCESS') || message.includes('FAILED') || message.includes('Status changed') || 
            message.includes('RESISTANCE CHANGED') || message.includes('Command pending') || 
            message.includes('CP Response') || message.includes('status changed')) {
            console.log(`[FTMS_DEBUG] ${logEntry}`);
        }
    }

    // New method to merge logs from FtmsManager
    private mergeFtmsManagerLogs() {
        const managerLogs = this.ftmsManager.getLogs(); // FtmsManager.LogEntry[]
        if (!this.testResults.interactionLogs) {
            this.testResults.interactionLogs = [];
        }
        for (const log of managerLogs) {
            const formattedLog = `${log.timestamp.replace('T', ' ').substring(0, 23)} - [FTMSManager][${log.type.toUpperCase()}] ${log.message}`;
            this.testResults.interactionLogs.push(formattedLog);
        }
        this.ftmsManager.clearLogs(); // Clear logs in manager to avoid duplicates if manager is reused
    }

    // Main testing flow
    async runDeviceTest(
        device: Device, 
        duration: number = 20000,
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
              // 프로토콜별 테스트 처리 (우선순위 순서: MOBI > REBORN > TACX > FITSHOW > YAFIT_S3 > YAFIT_S4 > FTMS > CSC)
            if (this.testResults.supportedProtocols.includes("MOBI")) {
                // Mobi 프로토콜 테스트 (우선순위 1)
                this.updateProgress(30, "Mobi 데이터 모니터링 중...");
                this.logInteraction('INFO - Test: Starting Mobi protocol testing (read-only).');
                await this.monitorMobiData();
                
                const elapsed = Date.now() - this.startTime;
                const remainingTime = Math.max(0, this.testDuration - elapsed);
                
                if (remainingTime > 0) {
                    this.updateProgress(50, "Mobi 데이터 수집 중... (페달을 계속 돌려주세요)");
                    await new Promise(resolve => setTimeout(resolve, remainingTime));
                }
                
                this.mergeFtmsManagerLogs();
                this.testResults = finalizeTestReport(this.testResults);
                this.updateProgress(100, "Mobi 테스트 완료 (읽기 전용)");
                if (this.onTestComplete) {
                    this.onTestComplete(this.testResults);
                }                  } else if (this.testResults.supportedProtocols.includes("REBORN")) {
                // Reborn 프로토콜 테스트 (우선순위 2) - 인증 외 제어 불가능
                this.updateProgress(30, "Reborn 인증 및 데이터 모니터링 중...");
                this.logInteraction('INFO - Test: Starting Reborn protocol testing (authentication + data only).');
                await this.monitorRebornData();
                
                // Reborn은 인증 외에는 제어 명령이 불가능하므로 제어 테스트 생략
                this.logInteraction('INFO - Test: Skipping control point tests for Reborn (authentication-only protocol).');
                
                const elapsed = Date.now() - this.startTime;
                const remainingTime = Math.max(0, this.testDuration - elapsed);
                
                if (remainingTime > 0) {
                    this.updateProgress(50, "Reborn 데이터 수집 중... 페달을 돌려주세요!");
                    this.logInteraction('INFO - Test: Please pedal to generate data for Reborn protocol testing.');
                    await this.runDataCollection(remainingTime);
                }
                
                this.mergeFtmsManagerLogs();
                this.testResults = finalizeTestReport(this.testResults);
                this.updateProgress(100, "Reborn 테스트 완료");
                if (this.onTestComplete) {
                    this.onTestComplete(this.testResults);
                }
                  } else if (this.testResults.supportedProtocols.includes("TACX")) {
                // Tacx Neo 프로토콜 테스트 (우선순위 3)
                this.updateProgress(30, "Tacx Neo 데이터 모니터링 중...");
                this.logInteraction('INFO - Test: Starting Tacx Neo protocol testing (with user interaction control commands).');
                await this.monitorBikeData();
                
                this.updateProgress(40, "Tacx Neo 사용자 상호작용 제어 기능 테스트 중...");
                this.logInteraction('INFO - Test: Starting Tacx Neo user interaction control point tests.');
                await this.testTacxControlPointsWithUserInteraction();
                
                const elapsed = Date.now() - this.startTime;
                const remainingTime = Math.max(0, this.testDuration - elapsed);
                
                if (remainingTime > 0) {
                    this.updateProgress(50, "Tacx Neo 데이터 수집 중...");
                    await new Promise(resolve => setTimeout(resolve, remainingTime));
                }
                
                this.mergeFtmsManagerLogs();
                this.testResults = finalizeTestReport(this.testResults);
                this.updateProgress(100, "Tacx Neo 테스트 완료 (사용자 상호작용 제어 기능 포함)");
                if (this.onTestComplete) {
                    this.onTestComplete(this.testResults);
                }
                  } else if (this.testResults.supportedProtocols.includes("FITSHOW")) {
                // FitShow 프로토콜 테스트 (우선순위 4)
                this.updateProgress(30, "FitShow 데이터 모니터링 중...");
                this.logInteraction('INFO - Test: Starting FitShow protocol testing (with control commands).');
                await this.monitorBikeData();
                
                // this.updateProgress(40, "FitShow 제어 기능 테스트 중...");
                // this.logInteraction('INFO - Test: Starting FitShow control point tests.');
                // await this.testControlPoints();
                
                const elapsed = Date.now() - this.startTime;
                const remainingTime = Math.max(0, this.testDuration - elapsed);
                
                if (remainingTime > 0) {
                    this.updateProgress(50, "FitShow 데이터 수집 중...");
                    await new Promise(resolve => setTimeout(resolve, remainingTime));
                }
                
                this.mergeFtmsManagerLogs();
                this.testResults = finalizeTestReport(this.testResults);
                this.updateProgress(100, "FitShow 테스트 완료 (제어 기능 미포함)");
                if (this.onTestComplete) {
                    this.onTestComplete(this.testResults);
                }                  } else if (this.testResults.supportedProtocols.includes("YAFIT_S3") || this.testResults.supportedProtocols.includes("YAFIT_S4") || this.testResults.supportedProtocols.includes("FTMS")) {
                // FTMS 프로토콜 테스트 (YAFIT_S3, YAFIT_S4 포함)
                let protocolName = "FTMS";
                if (this.testResults.supportedProtocols.includes("YAFIT_S3")) {
                    protocolName = "YAFIT_S3";
                } else if (this.testResults.supportedProtocols.includes("YAFIT_S4")) {
                    protocolName = "YAFIT_S4";
                }
                
                this.updateProgress(20, `${protocolName} 지원 범위 확인 중...`);
                this.logInteraction(`INFO - Test: Reading supported ${protocolName} ranges (using FTMS protocol).`);
                await this.readSupportRanges();
                this.logInteraction(`INFO - Test: Finished reading supported ranges for ${protocolName}.`);
                
                this.updateProgress(30, `${protocolName} 데이터 필드 모니터링 설정 중...`);
                this.logInteraction(`INFO - Test: Subscribing to ${protocolName} notifications (using FTMS protocol).`);
                await this.monitorBikeData();
                this.logInteraction(`INFO - Test: Subscribed to notifications and initial commands sent for ${protocolName}.`);
                
                this.updateProgress(40, `${protocolName} 제어 기능 테스트 중...`);
                this.logInteraction(`INFO - Test: Starting ${protocolName} control point tests (using FTMS protocol).`);
                await this.testControlPoints();
                this.logInteraction(`INFO - Test: Control point tests completed for ${protocolName}.`);
                
                const elapsed = Date.now() - this.startTime;
                const remainingTime = Math.max(0, this.testDuration - elapsed);
                
                if (remainingTime > 0) {
                    this.updateProgress(50, `${protocolName} 데이터 수집 중...`);
                    this.logInteraction(`INFO - Test: Starting data collection phase for ${protocolName} for ${remainingTime / 1000} seconds.`);
                    await this.runDataCollection(remainingTime);
                    this.logInteraction(`INFO - Test: Data collection phase ended for ${protocolName}.`);
                }
                
                this.updateProgress(90, `${protocolName} 호환성 분석 중...`);
                this.mergeFtmsManagerLogs();
                this.testResults = finalizeTestReport(this.testResults);
                this.updateProgress(100, `${protocolName} 테스트 완료`);
                if (this.onTestComplete) {
                    this.onTestComplete(this.testResults);
                }
                } else if (this.testResults.supportedProtocols.includes("CSC")) {
                // CSC 프로토콜 테스트 (우선순위 8)
                this.updateProgress(30, "CSC 데이터 모니터링 중...");
                this.logInteraction('INFO - Test: Starting CSC protocol testing.');
                await this.monitorCscData();
                
                const elapsed = Date.now() - this.startTime;
                const remainingTime = Math.max(0, this.testDuration - elapsed);
                
                if (remainingTime > 0) {
                    this.updateProgress(50, "CSC 데이터 수집 중...");
                    await new Promise(resolve => setTimeout(resolve, remainingTime));
                }
                
                this.mergeFtmsManagerLogs();
                this.testResults = finalizeTestReport(this.testResults);
                this.updateProgress(100, "CSC 테스트 완료 (제한된 기능)");                if (this.onTestComplete) {
                    this.onTestComplete(this.testResults);
                }            } else {
                // No supported protocols
                this.testResults.reasons.push("지원되는 프로토콜을 찾을 수 없습니다. 우선순위: MOBI > REBORN > TACX > FITSHOW > YAFIT_S3 > YAFIT_S4 > FTMS > CSC");
                this.mergeFtmsManagerLogs();
                this.testResults = finalizeTestReport(this.testResults);
                this.updateProgress(100, "호환 불가능한 프로토콜");
                if (this.onTestComplete) {
                    this.onTestComplete(this.testResults);
                }
            }
            
        } catch (error) {
            console.error("Device test error:", error);
            this.testResults.issuesFound.push(`테스트 오류: ${error instanceof Error ? error.message : String(error)}`);
            this.logInteraction(`ERROR - Test: Critical error during test: ${error instanceof Error ? error.message : String(error)}`);
            this.mergeFtmsManagerLogs(); // Merge logs even in case of error
            this.testResults = finalizeTestReport(this.testResults);
            if (this.onTestComplete) {
                this.onTestComplete(this.testResults);
            }
        } finally {
            this.isTestRunning = false;
            if (this.testTimeoutId) {
                clearTimeout(this.testTimeoutId);
                this.testTimeoutId = undefined; // Clear the timeout ID
            }            // Wait a bit before disconnecting to allow any pending responses to complete
            this.logInteraction('INFO - Test: Waiting 3 seconds before disconnecting to allow pending operations to complete...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Disconnect the device
            if (this.ftmsManager.getConnectedDevice()) {
                this.logInteraction('INFO - Test: Attempting to disconnect from device post-test.');
                try {
                    await this.ftmsManager.disconnectDevice();
                    // Logs from ftmsManager.disconnectDevice() will be captured if mergeFtmsManagerLogs was called again,
                    // but we've already merged. FtmsTester's own log is sufficient here.
                    this.logInteraction('INFO - Test: Device disconnected successfully post-test.');
                } catch (disconnectError) {
                    const errorMessage = disconnectError instanceof Error ? disconnectError.message : String(disconnectError);
                    console.error("Error during post-test device disconnection:", disconnectError);
                    this.logInteraction(`ERROR - Test: Failed to disconnect device post-test: ${errorMessage}`);
                }
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
    }    private async identifyProtocols(): Promise<void> {
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
            
            // FtmsManager에서 우선순위에 따라 결정된 프로토콜 목록을 가져옴
            const primaryProtocol = this.ftmsManager.getDetectedProtocol();
            const allSupportedProtocols = this.ftmsManager.getAllDetectedProtocols();
            
            this.logInteraction(`INFO - FTMSTester: All detected protocols: ${allSupportedProtocols.join(', ')}`);
            this.logInteraction(`INFO - FTMSTester: Primary protocol for testing: ${primaryProtocol}`);

            if (primaryProtocol) {
                // 모든 지원 프로토콜을 결과에 기록
                this.testResults.supportedProtocols = allSupportedProtocols;
                // 테스트에 사용될 주 프로토콜을 기록
                this.testResults.deviceInfo.protocol = primaryProtocol;
                
                // Read FTMS features if an FTMS-based protocol is selected
                const ftmsBased = [ProtocolType.FTMS, ProtocolType.YAFIT_S3, ProtocolType.YAFIT_S4, ProtocolType.FITSHOW];
                if (ftmsBased.includes(primaryProtocol)) {
                    this.logInteraction(`INFO - FTMSTester: Reading FTMS features for ${primaryProtocol}.`);
                    await this.readFtmsFeatures();
                }
            } else {
                this.testResults.deviceInfo.protocol = "알 수 없음";
                this.testResults.supportedProtocols = [];
                this.testResults.issuesFound.push("지원되는 프로토콜을 식별할 수 없습니다.");
                this.logInteraction('ERROR - FTMSTester: No protocol detected');
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
    }    private async monitorBikeData(): Promise<void> {
        try {
            this.logInteraction('INFO - [monitorBikeData] Setting up notifications for Indoor Bike Data and Control Point.');
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
            this.logInteraction('INFO - [monitorBikeData] Sending initial FTMS commands (REQUEST_CONTROL, RESET, START).');
            
            // Clear any previous command state before starting
            this.resistanceTracking = {
                commandPending: false,
                lastCommandType: '',
                commandSentTime: 0,
                expectedResistance: undefined,
                resistanceChangeNotedForLastCmd: false,
                commandCompletedTime: 0,
                allowResistanceAttributionWindow: 0
            };
            this.logInteraction('DEBUG - [monitorBikeData] Command tracking completely cleared before initial commands');
            
            await this.ftmsManager.requestControl();
            await this.ftmsManager.resetMachine();
            await this.ftmsManager.startMachine();
            
            this.logInteraction('INFO - [monitorBikeData] Initial FTMS commands completed successfully.');
            
        } catch (error) {
            this.logInteraction(`ERROR - [monitorBikeData] Error subscribing to notifications: ${error instanceof Error ? error.message : String(error)}`);
            this.testResults.issuesFound.push(`알림 구독 오류: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
      private async monitorCscData(): Promise<void> {
        try {
            this.logInteraction('INFO - [monitorCscData] Setting up notifications for CSC Data.');
            await this.ftmsManager.subscribeToNotifications(
                // No control point for CSC
                () => {},
                // CSC Data handler
                (data) => {
                    this.handleBikeData(data);
                }
            );
            
            this.logInteraction('INFO - [monitorCscData] CSC notifications setup completed.');
            
        } catch (error) {
            this.logInteraction(`ERROR - [monitorCscData] Error subscribing to CSC notifications: ${error instanceof Error ? error.message : String(error)}`);
            this.testResults.issuesFound.push(`CSC 알림 구독 오류: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    private async monitorMobiData(): Promise<void> {
        try {
            this.logInteraction('INFO - [monitorMobiData] Setting up notifications for Mobi Data (read-only protocol).');
            await this.ftmsManager.subscribeToNotifications(
                // No control point for Mobi
                () => {},
                // Mobi Data handler
                (data) => {
                    this.handleBikeData(data);
                }
            );
            
            this.logInteraction('INFO - [monitorMobiData] Mobi notifications setup completed. Device is read-only - no control commands will be sent.');
            
        } catch (error) {
            this.logInteraction(`ERROR - [monitorMobiData] Error subscribing to Mobi notifications: ${error instanceof Error ? error.message : String(error)}`);
            this.testResults.issuesFound.push(`Mobi 알림 구독 오류: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }private async monitorRebornData(): Promise<void> {
        try {
            this.logInteraction('INFO - [monitorRebornData] Setting up notifications for Reborn Data (read-only protocol with authentication).');
            await this.ftmsManager.subscribeToNotifications(
                // No control point for Reborn
                () => {},
                // Reborn Data handler
                (data) => {
                    this.handleBikeData(data);
                }
            );
            
            this.logInteraction('INFO - [monitorRebornData] Reborn notifications setup completed. Device is read-only with authentication - no control commands will be sent.');
            
        } catch (error) {
            this.logInteraction(`ERROR - [monitorRebornData] Error subscribing to Reborn notifications: ${error instanceof Error ? error.message : String(error)}`);
            this.testResults.issuesFound.push(`Reborn 알림 구독 오류: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    
    private async testControlPoints(): Promise<void> {
        try {
            if (!this.checkConnectionAndStopIfNeeded()) return;
            
            if (!this.testResults.controlTests) {
                this.testResults.controlTests = {};
            }
            
            const detectedProtocol = this.ftmsManager.getDetectedProtocol();
            
            this.logInteraction('INFO - [testControlPoints] Control point testing started. Testing order: SET_SIM_PARAMS -> SET_TARGET_POWER -> SET_RESISTANCE_LEVEL (to return to normal mode)');

            // Test SET_SIM_PARAMS first
            if (!this.checkConnectionAndStopIfNeeded()) return;
            await this.testSingleControlCommand('SET_SIM_PARAMS', async () => {
                const grade = 10;
                const windSpeed = 0;
                const crr = 0.004;
                const cw = 0.5;
                this.logInteraction(`INFO - [testControlPoints] Executing SET_SIM_PARAMS with Grade: ${grade}%, Wind: ${windSpeed} km/h, CRR: ${crr}, CW: ${cw}`);
                await this.ftmsManager.setSimulationParameters(windSpeed, grade, crr, cw);
                return `Grade: ${grade}%, Wind: ${windSpeed} km/h, CRR: ${crr}, CW: ${cw}`;
            });
              
            // Test SET_TARGET_POWER second
            if (!this.checkConnectionAndStopIfNeeded()) return;
            await this.testSingleControlCommand('SET_TARGET_POWER', async () => {
                const targetPower = 50;
                this.logInteraction(`INFO - [testControlPoints] Executing SET_TARGET_POWER with value: ${targetPower}W (will demonstrate continuous resistance changes)`);
                await this.ftmsManager.setTargetPower(targetPower);
                return `Target power: ${targetPower}W`;
            });
            
            // Wait for SET_TARGET_POWER to show its effects
            if (!this.checkConnectionAndStopIfNeeded()) return;
            this.logInteraction('INFO - [testControlPoints] Waiting for SET_TARGET_POWER to demonstrate continuous resistance changes...');
            await new Promise(resolve => setTimeout(resolve, 4000));

            // Test SET_RESISTANCE_LEVEL for functionality testing
            if (!this.checkConnectionAndStopIfNeeded()) return;
            this.logInteraction('INFO - [testControlPoints] Testing SET_RESISTANCE_LEVEL functionality');
            await this.testSingleControlCommand('SET_RESISTANCE_LEVEL', async () => {
                const testResistance = 40; // Test with different resistance level
                this.logInteraction(`INFO - [testControlPoints] Executing SET_RESISTANCE_LEVEL with value: ${testResistance} for functionality test`);
                await this.ftmsManager.setResistance(testResistance);
                return `Resistance level: ${testResistance} (functionality test)`;
            });
            
            // Wait for resistance change to be observed and any delayed responses
            this.logInteraction('INFO - [testControlPoints] Waiting for final resistance changes and delayed responses...');
            await new Promise(resolve => setTimeout(resolve, 5000)); // Increased from 3 to 5 seconds
            
            this.logInteraction('INFO - [testControlPoints] All control point tests completed');
            
            // Final check for any pending commands after all tests
            if (this.resistanceTracking.commandPending) {
                const commandName = this.resistanceTracking.lastCommandType;
                const timeFromCommand = Date.now() - this.resistanceTracking.commandSentTime;
                this.logInteraction(`WARN - [testControlPoints] Command ${commandName} still pending after control tests completed (${timeFromCommand}ms) - will be handled in data collection phase`);
            }
            
        } catch (error) {
            this.logInteraction(`ERROR - [testControlPoints] Control point testing failed: ${error instanceof Error ? error.message : String(error)}`);
            this.testResults.issuesFound.push(`제어 포인트 테스트 오류: ${error instanceof Error ? error.message : String(error)}`);
            // Don't throw here to allow the test to continue
        }
    }
    
    private async testSingleControlCommand(commandName: string, commandExecutor: () => Promise<string>): Promise<void> {
        if (!this.checkConnectionAndStopIfNeeded()) return;
        try {
            // Clear previous command state and set new command
            this.logInteraction(`INFO - [testSingleControlCommand] Starting ${commandName} test`);
            this.logInteraction(`DEBUG - [testSingleControlCommand] Previous commandPending state: ${this.resistanceTracking.commandPending}, lastCommandType: ${this.resistanceTracking.lastCommandType}`);

            // Add visually distinctive log for control command execution
            // Mint color: #3EB489 (or use a special tag for the app to color it)
            // Emoji for control: 🟢
            this.logInteraction(`[CONTROL_COMMAND] 🟢 제어 명령 실행: ${commandName}`);

            this.resistanceTracking = {
                commandPending: true,
                lastCommandType: commandName,
                commandSentTime: Date.now(),
                expectedResistance: undefined, // Using change detection for all commands
                resistanceChangeNotedForLastCmd: false,
                commandCompletedTime: 0,
                allowResistanceAttributionWindow: 0
            };
            
            this.logInteraction(`DEBUG - [testSingleControlCommand] Command tracking initialized for ${commandName} at ${this.resistanceTracking.commandSentTime}`);            // Execute command
            const details = await commandExecutor();
            
            // Use the tracked command name for consistency
            const trackedCommandName = this.resistanceTracking.lastCommandType;
            
            // Only set initial test result if not already processed by CP response or resistance change
            if (!this.testResults.controlTests[trackedCommandName]) {
                // No existing result, set initial Pending status
                this.testResults.controlTests[trackedCommandName] = {
                    status: "Pending", 
                    timestamp: Date.now(),
                    details: details
                };
                this.logInteraction(`DEBUG - [testSingleControlCommand] ${trackedCommandName} command sent, status set to Pending`);
            } else {
                // Result already exists, don't overwrite
                const existingStatus = this.testResults.controlTests[trackedCommandName].status;
                this.logInteraction(`DEBUG - [testSingleControlCommand] ${trackedCommandName} command sent, but result already exists with status: ${existingStatus}. Not overwriting.`);
            }

            // Wait for response (longer timeout for SET_TARGET_POWER)
            const waitTime = trackedCommandName === 'SET_TARGET_POWER' ? 5000 : 3000;
            this.logInteraction(`DEBUG - [testSingleControlCommand] Waiting ${waitTime}ms for ${trackedCommandName} response...`);

            await new Promise(resolve => setTimeout(resolve, waitTime));
            
            // Check final status after wait - only handle truly failed commands
            const actualCommandName = this.resistanceTracking.lastCommandType;
            const finalStatus = this.testResults.controlTests[actualCommandName]?.status || 'Unknown';
            const isStillPending = this.resistanceTracking.commandPending && this.resistanceTracking.lastCommandType === actualCommandName;
            
            this.logInteraction(`INFO - [testSingleControlCommand] ${actualCommandName} test completed with final status: ${finalStatus}, commandPending: ${isStillPending}`);
            this.logInteraction(`DEBUG - [RESISTANCE_DEBUG] Final testResults.controlTests[${actualCommandName}]: ${JSON.stringify(this.testResults.controlTests[actualCommandName])}`);
              if (finalStatus === 'Pending' && isStillPending) {
                // Command is still pending - check if CP response was received
                const hasReceivedCPResponse = this.testResults.controlTests[actualCommandName]?.details?.includes('CP Response: Success');
                
                if (hasReceivedCPResponse) {
                    // CP response was successful but no resistance change observed within timeout
                    this.logInteraction(`WARN - [testSingleControlCommand] ${actualCommandName} received CP success but no resistance change within timeout - marking as failed`);
                    this.testResults.controlTests[actualCommandName] = {
                        ...this.testResults.controlTests[actualCommandName],
                        status: "Failed",
                        details: `${this.testResults.controlTests[actualCommandName]?.details || details} - CP response successful but no resistance change observed within timeout`
                    };
                    this.logInteraction(`WARN - [RESISTANCE] Control command status changed to FAILED for ${actualCommandName} - CP success but no resistance change`);
                } else {
                    // No CP response at all
                    this.logInteraction(`WARN - [testSingleControlCommand] ${actualCommandName} remained in Pending state with no CP response - marking as failed`);
                    this.testResults.controlTests[actualCommandName] = {
                        ...this.testResults.controlTests[actualCommandName],
                        status: "Failed",
                        details: `${details} - No CP response received within timeout`
                    };
                    this.logInteraction(`WARN - [RESISTANCE] Control command status changed to FAILED for ${actualCommandName} due to timeout - no CP response`);
                }
                
                // Clear command pending state and set attribution window
                this.resistanceTracking.commandPending = false;
                this.resistanceTracking.commandCompletedTime = Date.now();
                this.resistanceTracking.allowResistanceAttributionWindow = Date.now() + 2000; // 2 seconds window
                this.logInteraction(`DEBUG - [testSingleControlCommand] Command pending cleared due to timeout, attribution window set`);
            } else if (finalStatus === 'Pending' && !isStillPending) {
                // Status says pending but commandPending is false - inconsistent state, likely already processed
                this.logInteraction(`DEBUG - [testSingleControlCommand] ${actualCommandName} status shows Pending but command was already processed elsewhere`);
            } else if (finalStatus === 'OK') {
                // Command fully completed successfully
                this.logInteraction(`DEBUG - [testSingleControlCommand] ${actualCommandName} completed successfully with full confirmation`);
            } else {
                // Command finished with other status
                this.logInteraction(`DEBUG - [testSingleControlCommand] ${actualCommandName} finished with status: ${finalStatus}, pending: ${isStillPending}`);
            }
            
            this.logInteraction(`DEBUG - [testSingleControlCommand] Function ending for ${this.resistanceTracking.lastCommandType}`);
              } catch (e) {
            const actualCommandName = this.resistanceTracking.lastCommandType;
            this.logInteraction(`ERROR - [testSingleControlCommand] ${actualCommandName} execution failed: ${e instanceof Error ? e.message : String(e)}`);
            this.testResults.controlTests[actualCommandName] = {
                status: "Failed", 
                timestamp: Date.now(),
                details: `Error: ${e instanceof Error ? e.message : String(e)}`
            };
            
            // Clear command pending state on error and set attribution window
            this.resistanceTracking.commandPending = false;
            this.resistanceTracking.commandCompletedTime = Date.now();
            this.resistanceTracking.allowResistanceAttributionWindow = Date.now() + 1000; // 1 second window for errors
            this.logInteraction(`DEBUG - [testSingleControlCommand] Command pending cleared due to error in ${actualCommandName}, attribution window set`);
            this.logInteraction(`ERROR - [RESISTANCE] Control command status changed to FAILED for ${actualCommandName} due to execution error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    private handleControlPointResponse(data: Buffer) {
        // This method is called by FTMSManager's notification handler
        const opCode = data[1];
        const resultCode = data[2];
        const commandName = this.ftmsManager.getOpCodeName(opCode);
        const resultName = this.ftmsManager.getResultCodeName(resultCode);

        this.logInteraction(`INFO - [handleControlPointResponse] Control Response Received - OpCode: 0x${opCode.toString(16)}, Result: 0x${resultCode.toString(16)} (${commandName}, ${resultName})`);

        if (this.resistanceTracking.commandPending) {
            this.logInteraction(`DEBUG - [handleControlPointResponse] Current pending command: ${this.resistanceTracking.lastCommandType}, received response for: ${commandName}`);
            
            if (commandName === this.resistanceTracking.lastCommandType) {
                const timeSinceCommand = Date.now() - this.resistanceTracking.commandSentTime;
                this.logInteraction(`DEBUG - [handleControlPointResponse] Response time: ${timeSinceCommand}ms for ${commandName}`);                if (resultCode === 0x01) { // Success
                    const actualCommandName = this.resistanceTracking.lastCommandType; // Use the tracked command name
                    this.testResults.controlTests[actualCommandName] = {
                        ...this.testResults.controlTests[actualCommandName],
                        status: "Pending", // Keep as Pending while waiting for resistance change
                        details: `${this.testResults.controlTests[actualCommandName]?.details || actualCommandName}. CP Response: Success. Waiting for resistance change confirmation.`
                    };
                    this.logInteraction(`INFO - [handleControlPointResponse] ${actualCommandName} command SUCCESS via CP response. Status remains: Pending (waiting for resistance change)`);
                    this.logInteraction(`INFO - [RESISTANCE] Control command CP SUCCESS for ${actualCommandName} - waiting for resistance change confirmation`);
                    this.logInteraction(`DEBUG - [RESISTANCE_DEBUG] testResults.controlTests[${actualCommandName}] updated: ${JSON.stringify(this.testResults.controlTests[actualCommandName])}`);
                    // Keep commandPending=true to wait for resistance change confirmation
                } else {
                    this.testResults.controlTests[commandName] = {
                        ...this.testResults.controlTests[commandName],
                        status: "Failed",
                        details: `${this.testResults.controlTests[commandName]?.details || commandName}. CP Response: ${resultName} (0x${resultCode.toString(16)})`
                    };
                    // Set attribution window even for failed commands in case resistance still changes
                    this.resistanceTracking.commandPending = false;
                    this.resistanceTracking.commandCompletedTime = Date.now();
                    this.resistanceTracking.allowResistanceAttributionWindow = Date.now() + 1500; // 1.5 seconds for failed commands
                    this.logInteraction(`ERROR - [handleControlPointResponse] ${commandName} command FAILED via CP response. Status changed to: Failed. CommandPending cleared. Attribution window set until ${new Date(this.resistanceTracking.allowResistanceAttributionWindow).toLocaleTimeString()}`);
                }
            } else {
                this.logInteraction(`WARN - [handleControlPointResponse] Received response for ${commandName} but pending command is ${this.resistanceTracking.lastCommandType}. Possible command mismatch.`);
            }
        } else {
            this.logInteraction(`DEBUG - [handleControlPointResponse] Received CP response for ${commandName} but no command is currently pending`);
        }
    }    
    
    private handleBikeData(data: any) {
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
          // Handle Mobi-specific data
        if (data.gearLevel !== undefined) {
            this.testResults = updateDataField(this.testResults, 'gear', data.gearLevel);
            this.logInteraction(`INFO - [handleBikeData] Mobi 기어 레벨: ${data.gearLevel}`);
        }
        if (data.batteryLevel !== undefined) {
            this.testResults = updateDataField(this.testResults, 'battery', data.batteryLevel);
            this.logInteraction(`INFO - [handleBikeData] Mobi 배터리 레벨: ${data.batteryLevel}%`);
        }
        
        // Handle Reborn-specific data (similar to Mobi but with authentication)
        const detectedProtocol = this.ftmsManager.getDetectedProtocol();
        if (detectedProtocol === 'REBORN') {
            if (data.gearLevel !== undefined) {
                this.testResults = updateDataField(this.testResults, 'gear', data.gearLevel);
                this.logInteraction(`INFO - [handleBikeData] Reborn 기어 레벨: ${data.gearLevel}`);
            }
            if (data.batteryLevel !== undefined) {
                this.testResults = updateDataField(this.testResults, 'battery', data.batteryLevel);
                this.logInteraction(`INFO - [handleBikeData] Reborn 배터리 레벨: ${data.batteryLevel}% (고정값)`);
            }
        }
        
        if (data.resistanceLevel !== undefined) {
            const newResistance = data.resistanceLevel;
            const currentTime = Date.now();
            
            // Log every resistance value for debugging
            this.logInteraction(`DEBUG - [handleBikeData] Current resistance: ${newResistance}, Previous: ${this.lastResistanceLevel}, CommandPending: ${this.resistanceTracking.commandPending}, CommandType: ${this.resistanceTracking.lastCommandType}, AttributionWindow: ${this.resistanceTracking.allowResistanceAttributionWindow > currentTime ? 'Active' : 'Expired'}`);
            
            if (this.lastResistanceLevel !== newResistance) {
                const timeFromCommand = this.resistanceTracking.commandSentTime > 0 ? 
                    currentTime - this.resistanceTracking.commandSentTime : 0;
                
                // Determine the cause of resistance change
                let changeCause = '자동 변경';
                let isCommandRelated = false;
                
                if (this.resistanceTracking.commandPending && 
                    !this.resistanceTracking.resistanceChangeNotedForLastCmd) {
                    // Command is still pending and this is the first resistance change for this command
                    changeCause = this.resistanceTracking.lastCommandType;
                    isCommandRelated = true;
                    this.logInteraction(`DEBUG - [handleBikeData] Resistance change attributed to PENDING command: ${changeCause}`);
                } else if (!this.resistanceTracking.commandPending && 
                           this.resistanceTracking.allowResistanceAttributionWindow > currentTime &&
                           this.resistanceTracking.lastCommandType) {
                    // Command is completed but still within attribution window
                    changeCause = `${this.resistanceTracking.lastCommandType} (지연됨)`;
                    isCommandRelated = true;
                    const windowRemaining = this.resistanceTracking.allowResistanceAttributionWindow - currentTime;
                    this.logInteraction(`DEBUG - [handleBikeData] Resistance change attributed to COMPLETED command within window: ${this.resistanceTracking.lastCommandType}, window remaining: ${windowRemaining}ms`);
                } else {
                    this.logInteraction(`DEBUG - [handleBikeData] Resistance change NOT attributed to command - automatic change`);
                }
                    
                this.testResults = trackResistanceChange(
                    this.testResults, 
                    'Resistance Level', 
                    newResistance, 
                    this.lastResistanceLevel,
                    changeCause
                );
                
                this.logInteraction(`INFO - [handleBikeData] RESISTANCE CHANGED from ${this.lastResistanceLevel} to ${newResistance}. Cause: ${changeCause}, TimeFromCommand: ${timeFromCommand}ms, IsCommandRelated: ${isCommandRelated}`);                // Handle command-related resistance changes
                if (isCommandRelated && this.resistanceTracking.lastCommandType) {
                    const actualCommandName = this.resistanceTracking.lastCommandType;
                    
                    if (this.resistanceTracking.commandPending && 
                        !this.resistanceTracking.resistanceChangeNotedForLastCmd) {
                        
                        this.logInteraction(`DEBUG - [handleBikeData] Processing resistance change for pending command: ${actualCommandName}`);

                        if (actualCommandName === 'SET_RESISTANCE_LEVEL' || actualCommandName === 'SET_TARGET_POWER' || actualCommandName === 'SET_SIM_PARAMS') {
                            this.logInteraction(`INFO - [handleBikeData] ${actualCommandName} SUCCESS - Resistance change detected (${this.lastResistanceLevel} -> ${newResistance}) after ${timeFromCommand}ms`);

                            const currentStatus = this.testResults.controlTests[actualCommandName]?.status || 'Unknown';
                            this.testResults.controlTests[actualCommandName] = {
                                ...this.testResults.controlTests[actualCommandName],
                                status: "OK", // Final success status
                                details: `${actualCommandName} successful. CP Response: Success, Resistance changed from ${this.lastResistanceLevel} to ${newResistance} after ${timeFromCommand}ms.`
                            };
                              this.logInteraction(`INFO - [handleBikeData] ${actualCommandName} status changed from ${currentStatus} to OK - resistance change confirmed`);
                            this.logInteraction(`INFO - [RESISTANCE] Control command COMPLETED SUCCESSFULLY for ${actualCommandName} - resistance change confirmed (${this.lastResistanceLevel} -> ${newResistance})`);
                            this.logInteraction(`DEBUG - [RESISTANCE_DEBUG] testResults.controlTests[${actualCommandName}] updated: ${JSON.stringify(this.testResults.controlTests[actualCommandName])}`);
                            this.resistanceTracking.resistanceChangeNotedForLastCmd = true;
                            this.resistanceTracking.commandPending = false;
                            this.resistanceTracking.commandCompletedTime = currentTime;

                            // Set attribution window based on command type
                            let attributionWindowDuration;
                            if (actualCommandName === 'SET_TARGET_POWER') {
                                attributionWindowDuration = 12000; // 12 seconds for target power mode (extended to capture more changes)
                                this.logInteraction(`INFO - [handleBikeData] SET_TARGET_POWER mode activated - resistance will continuously adjust for power target. Attribution window: ${attributionWindowDuration}ms`);
                            } else if (actualCommandName === 'SET_RESISTANCE_LEVEL') {
                                attributionWindowDuration = 3000; // 3 seconds for resistance level
                                this.logInteraction(`INFO - [handleBikeData] SET_RESISTANCE_LEVEL executed - setting fixed resistance mode`);
                            } else {
                                attributionWindowDuration = 3000; // 3 seconds for normal commands
                            }
                            
                            this.resistanceTracking.allowResistanceAttributionWindow = currentTime + attributionWindowDuration;
                            
                            this.logInteraction(`DEBUG - [handleBikeData] Command ${actualCommandName} completed successfully. Attribution window set for ${attributionWindowDuration}ms until ${new Date(this.resistanceTracking.allowResistanceAttributionWindow).toLocaleTimeString()}`);
                        }                    } else if (!this.resistanceTracking.commandPending) {
                        // This is a delayed resistance change for an already completed command
                        this.logInteraction(`DEBUG - [handleBikeData] Delayed resistance change for completed command: ${actualCommandName}`);
                    }
                } else if (this.resistanceTracking.commandPending) {
                    this.logInteraction(`DEBUG - [handleBikeData] Resistance change noted but change already processed for ${this.resistanceTracking.lastCommandType}`);
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
    }    private async runDataCollection(duration: number): Promise<void> {
        return new Promise((resolve) => {
            if (!this.checkConnectionAndStopIfNeeded()) {
                resolve();
                return;
            }
            
            this.logInteraction(`INFO - [runDataCollection] Starting data collection phase for ${duration / 1000} seconds.`);
            
            // Set up periodic connection checks during data collection
            const connectionCheckInterval = setInterval(() => {
                if (!this.checkConnectionAndStopIfNeeded()) {
                    clearInterval(connectionCheckInterval);
                    if (this.testTimeoutId) {
                        clearTimeout(this.testTimeoutId);
                    }
                    resolve();
                }
            }, 2000); // Check every 2 seconds
            
            this.testTimeoutId = setTimeout(() => {
                clearInterval(connectionCheckInterval);
                this.logInteraction('INFO - [runDataCollection] Data collection phase ended - checking pending commands');
                
                // Check any pending resistance commands that didn't get confirmation
                if (this.resistanceTracking.commandPending) {
                    const commandName = this.resistanceTracking.lastCommandType;
                    const timeFromCommand = Date.now() - this.resistanceTracking.commandSentTime;
                    
                    this.logInteraction(`WARN - [runDataCollection] Command ${commandName} still pending after ${timeFromCommand}ms - checking final status`);
                    
                    if (!this.resistanceTracking.resistanceChangeNotedForLastCmd) {
                        const currentStatus = this.testResults.controlTests[commandName]?.status || 'Unknown';
                        
                        if (currentStatus === 'Success') {
                            // CP was successful but no resistance change observed
                            this.testResults.controlTests[commandName] = {
                                ...this.testResults.controlTests[commandName],
                                status: "Partial",
                                details: `${this.testResults.controlTests[commandName]?.details || commandName}. CP Response: Success, but no resistance change observed within timeout (${timeFromCommand}ms).`
                            };
                            this.logInteraction(`WARN - [runDataCollection] ${commandName} status changed from ${currentStatus} to Partial - CP success but no resistance change`);
                        } else if (currentStatus === 'Pending') {
                            // No CP response and no resistance change
                            this.testResults.controlTests[commandName] = {
                                ...this.testResults.controlTests[commandName],
                                status: "Failed",
                                details: `${this.testResults.controlTests[commandName]?.details || commandName}. No CP response and no resistance change within timeout (${timeFromCommand}ms).`
                            };
                            this.logInteraction(`WARN - [runDataCollection] ${commandName} status changed from ${currentStatus} to Failed - no response within timeout`);
                        }
                    } else {
                        this.logInteraction(`DEBUG - [runDataCollection] ${commandName} was completed successfully during data collection`);
                    }
                    
                    // Set final attribution window for any remaining resistance changes
                    this.resistanceTracking.commandPending = false;
                    this.resistanceTracking.commandCompletedTime = Date.now();
                    this.resistanceTracking.allowResistanceAttributionWindow = Date.now() + 2000; // 2 seconds final window
                    this.logInteraction(`DEBUG - [runDataCollection] Command pending cleared for ${commandName} after timeout, final attribution window set`);
                } else {
                    this.logInteraction(`DEBUG - [runDataCollection] No pending commands at end of data collection phase`);
                    
                    // Check if there's still an active attribution window
                    if (this.resistanceTracking.allowResistanceAttributionWindow > Date.now()) {
                        const windowRemaining = this.resistanceTracking.allowResistanceAttributionWindow - Date.now();
                        this.logInteraction(`DEBUG - [runDataCollection] Attribution window still active for ${this.resistanceTracking.lastCommandType}, ${windowRemaining}ms remaining`);
                    }
                }

                resolve();
            }, duration);
        });
    }
      private updateProgress(progress: number, message: string): void {
        // Check connection before updating progress
        if (this.isTestRunning && !this.checkConnectionAndStopIfNeeded()) {
            return; // Test was stopped due to connection loss
        }
        
        if (this.onProgressUpdate) {
            this.onProgressUpdate(progress, message);
        }
    }

    // Tacx 프로토콜을 위한 사용자 상호작용 제어 테스트
    private async testTacxControlPointsWithUserInteraction(): Promise<void> {
        try {
            if (!this.checkConnectionAndStopIfNeeded()) return;
            
            if (!this.testResults.controlTests) {
                this.testResults.controlTests = {};
            }
            
            this.logInteraction('INFO - [testTacxControlPointsWithUserInteraction] Tacx 사용자 상호작용 제어 테스트 시작');

            // Test SET_SIM_PARAMS with user interaction
            if (!this.checkConnectionAndStopIfNeeded()) return;
            await this.testTacxControlCommandWithUserInteraction('SET_SIM_PARAMS', async () => {
                const grade = 10;
                const windSpeed = 0;
                const crr = 0.004;
                const cw = 0.5;
                this.logInteraction(`INFO - [testTacxControlPointsWithUserInteraction] Executing SET_SIM_PARAMS with Grade: ${grade}%, Wind: ${windSpeed} km/h, CRR: ${crr}, CW: ${cw}`);
                await this.ftmsManager.setSimulationParameters(windSpeed, grade, crr, cw);
                return `Grade: ${grade}%, Wind: ${windSpeed} km/h, CRR: ${crr}, CW: ${cw}`;
            }, '시뮬레이션 파라미터 설정', '경사 10%, 바람 0km/h로 설정합니다');
              
            // Test SET_TARGET_POWER with user interaction
            if (!this.checkConnectionAndStopIfNeeded()) return;
            await this.testTacxControlCommandWithUserInteraction('SET_TARGET_POWER', async () => {
                const targetPower = 50;
                this.logInteraction(`INFO - [testTacxControlPointsWithUserInteraction] Executing SET_TARGET_POWER with value: ${targetPower}W`);
                await this.ftmsManager.setTargetPower(targetPower);
                return `Target power: ${targetPower}W`;
            }, '목표 파워 설정', '목표 파워를 50W로 설정합니다');
            
            // Test SET_RESISTANCE_LEVEL with user interaction
            if (!this.checkConnectionAndStopIfNeeded()) return;
            await this.testTacxControlCommandWithUserInteraction('SET_RESISTANCE_LEVEL', async () => {
                const testResistance = 40;
                this.logInteraction(`INFO - [testTacxControlPointsWithUserInteraction] Executing SET_RESISTANCE_LEVEL with value: ${testResistance}`);
                await this.ftmsManager.setResistance(testResistance);
                return `Resistance level: ${testResistance}`;
            }, '저항 레벨 설정', '저항 레벨을 40으로 설정합니다');
            
            this.logInteraction('INFO - [testTacxControlPointsWithUserInteraction] Tacx 사용자 상호작용 제어 테스트 완료');
            
        } catch (error) {
            this.logInteraction(`ERROR - [testTacxControlPointsWithUserInteraction] Tacx 제어 테스트 실패: ${error instanceof Error ? error.message : String(error)}`);
            this.testResults.issuesFound.push(`Tacx 제어 테스트 오류: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // Tacx 개별 제어 명령을 사용자 상호작용과 함께 테스트
    private async testTacxControlCommandWithUserInteraction(
        commandName: string, 
        commandExecutor: () => Promise<string>,
        commandDisplayName: string,
        commandDescription: string
    ): Promise<void> {
        if (!this.checkConnectionAndStopIfNeeded()) return;
        
        try {
            this.logInteraction(`INFO - [testTacxControlCommandWithUserInteraction] ${commandName} 사용자 상호작용 테스트 시작`);
            console.log(`[DEBUG] Tacx 사용자 상호작용 테스트 시작: ${commandName}`);

            // 1. 사용자에게 명령 시작 요청
            if (this.onUserInteractionRequest) {
                console.log(`[DEBUG] 사용자 상호작용 콜백이 설정되어 있음`);
                const startInteraction: UserInteractionRequest = {
                    type: 'command_start',
                    commandName: commandName,
                    commandDescription: commandDescription,
                    message: `${commandDisplayName} 명령을 실행하시겠습니까?`
                };

                console.log(`[DEBUG] 사용자에게 명령 시작 요청: ${commandDisplayName}`);
                const userConfirmed = await this.onUserInteractionRequest(startInteraction);
                console.log(`[DEBUG] 사용자 응답: ${userConfirmed}`);
                
                if (!userConfirmed) {
                    this.logInteraction(`INFO - [testTacxControlCommandWithUserInteraction] 사용자가 ${commandName} 명령 실행을 취소했습니다`);
                    this.testResults.controlTests[commandName] = {
                        status: "Skipped",
                        timestamp: Date.now(),
                        details: "사용자가 명령 실행을 취소했습니다"
                    };
                    return;
                }
            } else {
                console.log(`[DEBUG] 사용자 상호작용 콜백이 설정되지 않음!`);
                this.logInteraction(`WARN - [testTacxControlCommandWithUserInteraction] 사용자 상호작용 콜백이 설정되지 않음`);
            }

            // 2. 3초 카운트다운
            this.logInteraction(`INFO - [testTacxControlCommandWithUserInteraction] ${commandName} 명령 실행을 위한 3초 카운트다운 시작`);
            console.log(`[DEBUG] 3초 카운트다운 시작`);
            for (let i = 3; i > 0; i--) {
                if (this.onCountdownUpdate) {
                    this.onCountdownUpdate(i);
                }
                this.logInteraction(`INFO - [testTacxControlCommandWithUserInteraction] 카운트다운: ${i}`);
                console.log(`[DEBUG] 카운트다운: ${i}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            if (this.onCountdownUpdate) {
                this.onCountdownUpdate(0);
            }

            // 3. 명령 실행
            this.logInteraction(`[CONTROL_COMMAND] 🟢 Tacx 제어 명령 실행: ${commandName}`);
            console.log(`[DEBUG] 명령 실행: ${commandName}`);
            const details = await commandExecutor();

            // 4. 사용자에게 저항 변화 확인 요청
            if (this.onUserInteractionRequest) {
                const resistanceCheckInteraction: UserInteractionRequest = {
                    type: 'resistance_check',
                    commandName: commandName,
                    commandDescription: commandDescription,
                    message: `${commandDisplayName} 명령 실행 후 실제로 저항이 변했습니까?`
                };

                console.log(`[DEBUG] 사용자에게 저항 변화 확인 요청`);
                const resistanceChanged = await this.onUserInteractionRequest(resistanceCheckInteraction);
                console.log(`[DEBUG] 저항 변화 확인 응답: ${resistanceChanged}`);
                
                // 결과 저장
                this.testResults.controlTests[commandName] = {
                    status: resistanceChanged ? "OK" : "Failed",
                    timestamp: Date.now(),
                    details: resistanceChanged 
                        ? `${details} - 사용자 확인: 저항 변화 감지됨`
                        : `${details} - 사용자 확인: 저항 변화 감지되지 않음`
                };

                this.logInteraction(`INFO - [testTacxControlCommandWithUserInteraction] ${commandName} 테스트 완료 - 사용자 확인 결과: ${resistanceChanged ? '성공' : '실패'}`);
                console.log(`[DEBUG] 테스트 완료: ${commandName} - ${resistanceChanged ? '성공' : '실패'}`);
            } else {
                // 콜백이 없는 경우 기본 처리
                this.testResults.controlTests[commandName] = {
                    status: "Pending",
                    timestamp: Date.now(),
                    details: `${details} - 사용자 상호작용 콜백 없음`
                };
                this.logInteraction(`WARN - [testTacxControlCommandWithUserInteraction] ${commandName} 사용자 상호작용 콜백이 설정되지 않음`);
                console.log(`[DEBUG] 사용자 상호작용 콜백 없음 - Pending 상태로 설정`);
            }

        } catch (error) {
            this.logInteraction(`ERROR - [testTacxControlCommandWithUserInteraction] ${commandName} 실행 실패: ${error instanceof Error ? error.message : String(error)}`);
            console.log(`[DEBUG] 오류 발생: ${error instanceof Error ? error.message : String(error)}`);
            this.testResults.controlTests[commandName] = {
                status: "Failed",
                timestamp: Date.now(),
                details: `Error: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}
