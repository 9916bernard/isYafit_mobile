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
    private testTimeoutId?: NodeJS.Timeout;    private resistanceTracking = {
        commandPending: false,
        lastCommandType: '',
        commandSentTime: 0,
        expectedResistance: undefined as number | undefined,
        resistanceChangeNotedForLastCmd: false,
        commandCompletedTime: 0, // Track when command was fully completed
        allowResistanceAttributionWindow: 0 // Time window to still attribute resistance changes to last command
    };

    constructor(ftmsManager: FTMSManager) {
        this.ftmsManager = ftmsManager;
        this.testResults = initTestResults();
        // this.ftmsManager.setLogCallback(this.logInteraction.bind(this)); // Remove this line
    }    // Check if device is still connected
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
                this.mergeFtmsManagerLogs(); // Merge logs before finalizing
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
                this.mergeFtmsManagerLogs(); // Merge logs before finalizing
                this.testResults = finalizeTestReport(this.testResults);
                this.updateProgress(100, "CSC 테스트 완료 (제한된 기능)");
                if (this.onTestComplete) {
                    this.onTestComplete(this.testResults);
                }
            } else {
                // No supported protocols
                this.testResults.reasons.push("지원되는 프로토콜(FTMS, CSC)을 찾을 수 없습니다.");
                this.mergeFtmsManagerLogs(); // Merge logs before finalizing
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
            // CSC monitoring would be implemented here
            this.testResults.issuesFound.push("CSC 데이터 모니터링은 현재 구현되지 않았습니다.");
            
            // Placeholder for future CSC monitoring implementation
            
        } catch (error) {
            this.testResults.issuesFound.push(`CSC 알림 오류: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }    private async testControlPoints(): Promise<void> {
        try {
            if (!this.checkConnectionAndStopIfNeeded()) return;
            
            if (!this.testResults.controlTests) {
                this.testResults.controlTests = {};
            }
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
                const targetPower = 100;
                this.logInteraction(`INFO - [testControlPoints] Executing SET_TARGET_POWER with value: ${targetPower}W (will demonstrate continuous resistance changes)`);
                await this.ftmsManager.setTargetPower(targetPower);
                return `Target power: ${targetPower}W`;
            });            // Wait for SET_TARGET_POWER to show its effects
            if (!this.checkConnectionAndStopIfNeeded()) return;
            this.logInteraction('INFO - [testControlPoints] Waiting for SET_TARGET_POWER to demonstrate continuous resistance changes...');
            await new Promise(resolve => setTimeout(resolve, 8000));

            // Test SET_RESISTANCE_LEVEL for functionality testing
            if (!this.checkConnectionAndStopIfNeeded()) return;
            this.logInteraction('INFO - [testControlPoints] Testing SET_RESISTANCE_LEVEL functionality');
            await this.testSingleControlCommand('SET_RESISTANCE_LEVEL', async () => {
                const testResistance = 20; // Test with different resistance level
                this.logInteraction(`INFO - [testControlPoints] Executing SET_RESISTANCE_LEVEL with value: ${testResistance} for functionality test`);
                await this.ftmsManager.setResistance(testResistance);
                return `Resistance level: ${testResistance} (functionality test)`;
            });            // Wait for resistance change to be observed and any delayed responses
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
    }private async testSingleControlCommand(commandName: string, commandExecutor: () => Promise<string>): Promise<void> {
        try {
            // Clear previous command state and set new command
            this.logInteraction(`INFO - [testSingleControlCommand] Starting ${commandName} test`);
            this.logInteraction(`DEBUG - [testSingleControlCommand] Previous commandPending state: ${this.resistanceTracking.commandPending}, lastCommandType: ${this.resistanceTracking.lastCommandType}`);
            
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
                // Only handle commands that are truly still pending
                this.logInteraction(`WARN - [testSingleControlCommand] ${actualCommandName} remained in Pending state with no response - marking as failed`);
                this.testResults.controlTests[actualCommandName] = {
                    ...this.testResults.controlTests[actualCommandName],
                    status: "Failed",
                    details: `${details} - No CP response received within timeout`
                };
                
                // Clear command pending state and set attribution window
                this.resistanceTracking.commandPending = false;
                this.resistanceTracking.commandCompletedTime = Date.now();
                this.resistanceTracking.allowResistanceAttributionWindow = Date.now() + 2000; // 2 seconds window
                this.logInteraction(`DEBUG - [testSingleControlCommand] Command pending cleared due to no response, attribution window set`);
                this.logInteraction(`WARN - [RESISTANCE] Control command status changed to FAILED for ${actualCommandName} due to timeout - no CP response`);
            } else if (finalStatus === 'Pending' && !isStillPending) {
                // Status says pending but commandPending is false - inconsistent state, likely already processed
                this.logInteraction(`DEBUG - [testSingleControlCommand] ${actualCommandName} status shows Pending but command was already processed elsewhere`);
            } else if (finalStatus === 'Success' && isStillPending) {
                // CP response received but no resistance change yet - this is normal
                this.logInteraction(`DEBUG - [testSingleControlCommand] ${actualCommandName} received CP success, still waiting for resistance change confirmation`);
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
                this.logInteraction(`DEBUG - [handleControlPointResponse] Response time: ${timeSinceCommand}ms for ${commandName}`);
                  if (resultCode === 0x01) { // Success
                    const actualCommandName = this.resistanceTracking.lastCommandType; // Use the tracked command name
                    this.testResults.controlTests[actualCommandName] = {
                        ...this.testResults.controlTests[actualCommandName],
                        status: "Success", // Changed from "OK" to indicate CP success
                        details: `${this.testResults.controlTests[actualCommandName]?.details || actualCommandName}. CP Response: Success. Waiting for resistance change confirmation.`
                    };
                    this.logInteraction(`INFO - [handleControlPointResponse] ${actualCommandName} command SUCCESS via CP response. Status changed to: Success`);
                    this.logInteraction(`INFO - [RESISTANCE] Control command status changed to SUCCESS for ${actualCommandName} via CP response`);
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
                            
                            this.logInteraction(`INFO - [handleBikeData] ${actualCommandName} status changed from ${currentStatus} to OK`);
                            this.logInteraction(`INFO - [RESISTANCE] Control command status changed to OK for ${actualCommandName} - resistance change confirmed (${this.lastResistanceLevel} -> ${newResistance})`);
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
}
