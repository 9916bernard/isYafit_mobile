import { BleManager, Device, Characteristic, Service, Subscription, BleErrorCode, BleError, State } from 'react-native-ble-plx';
import { Buffer } from 'buffer'; // Ensure 'buffer' is installed as a dependency

// FTMS UUIDs
const FTMS_SERVICE_UUID = "00001826-0000-1000-8000-00805f9b34fb";
const FTMS_FEATURE_CHAR_UUID = "00002acc-0000-1000-8000-00805f9b34fb";
const FTMS_CONTROL_POINT_CHAR_UUID = "00002ad9-0000-1000-8000-00805f9b34fb";
// const FTMS_STATUS_CHAR_UUID = "00002ada-0000-1000-8000-00805f9b34fb"; // Optional
const FTMS_INDOOR_BIKE_DATA_CHAR_UUID = "00002ad2-0000-1000-8000-00805f9b34fb";

// Mobi UUIDs
const MOBI_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
const MOBI_DATA_CHAR_UUID = "0000ffe4-0000-1000-8000-00805f9b34fb";

// Reborn UUIDs
const REBORN_SERVICE_UUID = "00010203-0405-0607-0809-0a0b0c0d1910";
const REBORN_DATA_CHAR_UUID = "00010203-0405-0607-0809-0a0b0c0d2b10";
const REBORN_WRITE_CHAR_UUID = "00010203-0405-0607-0809-0a0b0c0d2b11";

// FTMS Control Point Commands
const REQUEST_CONTROL = Buffer.from([0x00]);
const RESET = Buffer.from([0x01]);
const START = Buffer.from([0x07]);
const STOP = Buffer.from([0x08]);
// const GET_RESISTANCE_RANGE = Buffer.from([0x11]); // Opcode for Get Resistance Range, not fully implemented in Python script's test flow

const SET_RESISTANCE_LEVEL = (level: number): Buffer => Buffer.from([0x04, level & 0xFF]);
const SET_TARGET_POWER = (watts: number): Buffer => Buffer.from([0x05, watts & 0xFF, (watts >> 8) & 0xFF]);
const SET_SIM_PARAMS = (windSpeed: number, grade: number, crr: number, cw: number): Buffer => {
    const windSpeedBytes = Buffer.alloc(2);
    windSpeedBytes.writeInt16LE(Math.round(windSpeed * 1000), 0); // m/s with a resolution of 0.001

    const gradeBytes = Buffer.alloc(2);
    gradeBytes.writeInt16LE(Math.round(grade * 100), 0); // Percentage with a resolution of 0.01

    const crrBytes = Buffer.alloc(1);
    crrBytes.writeUInt8(Math.round(crr * 20000), 0); // Dimensionless with a resolution of 0.00005

    const cwBytes = Buffer.alloc(1);
    cwBytes.writeUInt8(Math.round(cw * 100), 0); // kg/m with a resolution of 0.01

    return Buffer.from([
        0x11, // Opcode for Set Indoor Bike Simulation Parameters
        windSpeedBytes[0], windSpeedBytes[1],
        gradeBytes[0], gradeBytes[1],
        crrBytes[0],
        cwBytes[0]
    ]);
};

// Example usage of SET_SIM_PARAMS from Python script (0 wind, 20% grade, 0 crr, 0 cw)
const DEFAULT_SIM_PARAMS = Buffer.from([
    0x11,        // Opcode
    0x00, 0x00,  // Wind Speed = 0
    0xD0, 0x07,  // Grade = 2000 (20.00%)  (0x07D0 little endian)
    0x00,        // Rolling Resistance Coefficient = 0
    0x00         // Wind Resistance Coefficient = 0
]);


interface IndoorBikeData {
    instantaneousSpeed?: number;
    averageSpeed?: number;
    instantaneousCadence?: number;
    averageCadence?: number;
    totalDistance?: number;
    resistanceLevel?: number;
    instantaneousPower?: number;
    averagePower?: number;
    expendedEnergy?: number;
    heartRate?: number;
    metabolicEquivalent?: number;
    elapsedTime?: number;
    remainingTime?: number;
    raw?: string;
    flags?: number;
    // Mobi specific fields
    gearLevel?: number;
    batteryLevel?: number;
}

// Protocol type enum
export enum ProtocolType {
    FTMS = 'FTMS',
    CSC = 'CSC',
    MOBI = 'MOBI',
    REBORN = 'REBORN',
    TACX_NEO = 'TACX_NEO',
    FITSHOW = 'FITSHOW',
    YAFIT_S3 = 'YAFIT_S3',
    YAFIT_S4 = 'YAFIT_S4'
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Type definition for log entries
export interface LogEntry {
    timestamp: string;
    message: string;
    type: 'info' | 'error' | 'success' | 'warning';
}

export class FTMSManager {
    private bleManager: BleManager;
    private connectedDevice: Device | null = null;
    private controlPointSubscription: Subscription | null = null;
    private indoorBikeDataSubscription: Subscription | null = null;
    private bluetoothStateSubscription: Subscription | null = null;
    private currentState: State = State.Unknown;
    
    private ftmsFeatureBits: number = 0;
    private isDeviceActive: boolean = false; // Track if device is active (started)
    private detectedProtocol: ProtocolType | null = null; // Track detected protocol
    
    // Protocol detection flags
    private _isMobiSensor: boolean = false;
    private _isRebornSensor: boolean = false;
    private _isTacxNeoSensor: boolean = false;
    private _isFSSensor: boolean = false;
    private _isS3Sensor: boolean = false;
    private _isS4Sensor: boolean = false;
    private _isFTMSSensor: boolean = false;
    
    // Reborn authentication state
    private rebornAuthBytes: Buffer | null = null;
    private rebornAuthCompleted: boolean = false;
    
    // Logging system
    private logs: LogEntry[] = [];
    private logCallback: ((logs: LogEntry[]) => void) | null = null;constructor() {
        this.bleManager = new BleManager();
        this.monitorBluetoothState();
        this.clearLogs();
        this.logInfo("FTMS Manager initialized");
    }
    
    // 센서 타입 판별 메서드들
    private checkMobiSensor(deviceName: string): boolean {
        this._isMobiSensor = deviceName.includes("MOB");
        return this._isMobiSensor;
    }
    
    private checkRebornSensor(deviceName: string): boolean {
        this._isRebornSensor = deviceName.includes("XQ");
        return this._isRebornSensor;
    }
    
    private checkTacxNeoSensor(deviceName: string): boolean {
        this._isTacxNeoSensor = deviceName.includes("Tac");
        return this._isTacxNeoSensor;
    }
    
    private checkFitShowSensor(deviceName: string): boolean {
        this._isFSSensor = deviceName.includes("FS-");
        return this._isFSSensor;
    }
    
    private checkS3Sensor(deviceName: string): boolean {
        this._isS3Sensor = deviceName.includes("YAFITS3") || deviceName.includes("YA FIT");
        return this._isS3Sensor;
    }
    
    private checkS4Sensor(deviceName: string): boolean {
        this._isS4Sensor = deviceName.includes("R-Q") || deviceName.includes("YAFITF1");
        return this._isS4Sensor;
    }
    
    private checkFTMSSensor(): boolean {
        // FTMS 서비스가 있는지 확인
        this._isFTMSSensor = this.connectedDevice?.serviceUUIDs?.includes(FTMS_SERVICE_UUID) ?? false;
        return this._isFTMSSensor;
    }
    
    // Mobi 센서 확인 메서드 (우선순위가 가장 높으므로 public으로 제공)
    public isMobiSensor(): boolean {
        return this._isMobiSensor;
    }
    
    // 모든 센서 플래그 초기화
    private resetSensorFlags(): void {
        this._isMobiSensor = false;
        this._isRebornSensor = false;
        this._isTacxNeoSensor = false;
        this._isFSSensor = false;
        this._isS3Sensor = false;
        this._isS4Sensor = false;
        this._isFTMSSensor = false;
    }
      // 프로토콜 우선순위에 따른 연결 타입 결정
    private determineProtocolByPriority(): ProtocolType {
        if (this.isMobiSensor()) {
            this.logInfo("Detected Mobi sensor - using Mobi protocol");
            return ProtocolType.MOBI;
        }
        else if (this._isRebornSensor) {
            this.logInfo("Detected Reborn sensor - using Reborn protocol");
            return ProtocolType.REBORN;
        }
        else if (this._isTacxNeoSensor) {
            this.logInfo("Detected Tacx Neo sensor - using Tacx Neo protocol");
            return ProtocolType.TACX_NEO;
        }
        else if (this._isFSSensor) {
            this.logInfo("Detected FitShow sensor - using FitShow protocol");
            return ProtocolType.FITSHOW;
        }
        else if (this._isS3Sensor) {
            this.logInfo("Detected YafitS3 sensor - using FTMS protocol");
            return ProtocolType.FTMS;
        }
        else if (this._isS4Sensor) {
            this.logInfo("Detected YafitS4 sensor - using FTMS protocol");
            return ProtocolType.FTMS;
        }
        else if (this._isFTMSSensor) {
            this.logInfo("Detected FTMS sensor - using standard FTMS protocol");
            return ProtocolType.FTMS;
        }
        else {
            this.logInfo("No specific protocol detected - using CSC protocol as fallback");
            return ProtocolType.CSC;
        }
    }
    
    private monitorBluetoothState(): void {
        this.bluetoothStateSubscription = this.bleManager.onStateChange((state) => {
            console.log(`Bluetooth state changed to: ${state}`);
            this.currentState = state;
        }, true); // true means start monitoring immediately
    }
    
    async checkBluetoothState(): Promise<boolean> {
        const state = await this.bleManager.state();
        console.log(`Current Bluetooth state: ${state}`);
        this.currentState = state;
        return state === State.PoweredOn;
    }
      async scanForFTMSDevices(
        scanDuration: number = 10000,
        onDeviceFound: (device: Device) => void
    ): Promise<void> {
        console.log("Scanning for fitness devices (FTMS, CSC, Mobi)...");
        
        // Check Bluetooth state before scanning
        const isBluetoothOn = await this.checkBluetoothState();
        if (!isBluetoothOn) {
            console.error("Bluetooth is powered off. Cannot start scan.");
            throw new Error("Bluetooth is not powered on");
        }
        
        return new Promise((resolve, reject) => {
            try {                // Scan for multiple protocol UUIDs
                const serviceUUIDs = [
                    FTMS_SERVICE_UUID,
                    "00001816-0000-1000-8000-00805f9b34fb", // CSC Service UUID
                    MOBI_SERVICE_UUID,
                    REBORN_SERVICE_UUID
                ];
                
                this.bleManager.startDeviceScan(serviceUUIDs, null, (error, device) => {
                    if (error) {
                        console.error("Scan error:", error);
                        this.bleManager.stopDeviceScan();
                        reject(error);
                        return;
                    }
                    if (device) {
                        console.log(`Found fitness device: ${device.name} (${device.id})`);
                        onDeviceFound(device);
                    }
                });

                setTimeout(() => {
                    this.bleManager.stopDeviceScan();
                    console.log("Scan finished.");
                    resolve();
                }, scanDuration);
            } catch (e) {
                console.error("Error starting scan:", e);
                reject(e);
            }
        });
    }    async connectToDevice(deviceId: string): Promise<Device> {
        this.logInfo(`Connecting to device ${deviceId}...`);
        try {
            await this.disconnectDevice(); // Ensure any previous connection is closed

            const device = await this.bleManager.connectToDevice(deviceId, { timeout: 20000 });
            this.logSuccess(`Connected to ${device.name}`);
            this.connectedDevice = device;
            this.isDeviceActive = false; // Reset active state

            await device.discoverAllServicesAndCharacteristics();
            this.logInfo("Services and characteristics discovered");

            // Detect protocol and perform protocol-specific initialization
            await this.detectProtocol();            // Protocol-specific initialization
            switch (this.detectedProtocol) {
                case ProtocolType.FTMS:
                    await this.readFTMSFeatures();
                    break;
                case ProtocolType.CSC:
                    this.logInfo("CSC protocol detected - no specific initialization needed");
                    break;
                case ProtocolType.MOBI:
                    this.logInfo("Mobi protocol detected - read-only protocol");
                    break;
                case ProtocolType.REBORN:
                    this.logInfo("Reborn protocol detected - authentication required");
                    this.rebornAuthCompleted = false;
                    break;
                case ProtocolType.TACX_NEO:
                    this.logInfo("Tacx Neo protocol detected - initialization not implemented yet");
                    break;
                case ProtocolType.FITSHOW:
                    this.logInfo("FitShow protocol detected - initialization not implemented yet");
                    break;
                default:
                    this.logWarning("Unknown protocol detected");
            }

            return device;
        } catch (error) {
            this.logError(`Connection error: ${error instanceof Error ? error.message : String(error)}`);
            this.connectedDevice = null;
            this.isDeviceActive = false;
            this.detectedProtocol = null;
            throw error;
        }
    }async disconnectDevice(): Promise<void> {
        if (this.connectedDevice) {
            try {
                this.logInfo(`Disconnecting from ${this.connectedDevice.name}...`);
                this.controlPointSubscription?.remove();
                this.indoorBikeDataSubscription?.remove();
                this.controlPointSubscription = null;
                this.indoorBikeDataSubscription = null;
                await this.bleManager.cancelDeviceConnection(this.connectedDevice.id);
                this.logSuccess("Disconnected successfully");
            } catch (error) {
                // Ignore cancellation errors if device is already disconnected
                if ((error as BleError).errorCode !== BleErrorCode.DeviceDisconnected) {
                    this.logError(`Disconnection error: ${error instanceof Error ? error.message : String(error)}`);
                }
            } finally {
                this.connectedDevice = null;
                this.isDeviceActive = false; // Reset active state
            }
        }
    }    private async writeControlPoint(data: Buffer): Promise<Characteristic | null> {
        if (!this.connectedDevice) {
            this.logError("Device not connected");
            return null;
        }
        
        try {
            this.logInfo(`Writing to Control Point: ${data.toString('hex')}`);
            
            let char: Characteristic | null = null;
              // 프로토콜별 control point 처리
            switch (this.detectedProtocol) {
                case ProtocolType.FTMS:
                case ProtocolType.YAFIT_S3:
                case ProtocolType.YAFIT_S4:
                    char = await this.connectedDevice.writeCharacteristicWithResponseForService(
                        FTMS_SERVICE_UUID,
                        FTMS_CONTROL_POINT_CHAR_UUID,
                        data.toString('base64')
                    );
                    break;
                    
                case ProtocolType.REBORN:
                    // Reborn 프로토콜용 control point (향후 구현)
                    char = await this.connectedDevice.writeCharacteristicWithResponseForService(
                        REBORN_SERVICE_UUID,
                        REBORN_WRITE_CHAR_UUID,
                        data.toString('base64')
                    );
                    break;
                    
                case ProtocolType.TACX_NEO:
                case ProtocolType.FITSHOW:
                    // 다른 프로토콜들은 추후 구현
                    this.logWarning(`Control point implementation not yet available for ${this.detectedProtocol} protocol`);
                    throw new Error(`Control point implementation not yet available for ${this.detectedProtocol} protocol`);
                    
                default:
                    throw new Error(`Unsupported protocol for control commands: ${this.detectedProtocol}`);
            }
            
            this.logSuccess("Write successful");
            return char;
        } catch (error) {
            this.logError(`Write Control Point error: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    async readFTMSFeatures(): Promise<number> {
        if (!this.connectedDevice) {
            throw new Error("Device not connected.");
        }
        try {
            const characteristic = await this.connectedDevice.readCharacteristicForService(
                FTMS_SERVICE_UUID,
                FTMS_FEATURE_CHAR_UUID
            );
            if (characteristic.value) {
                const buffer = Buffer.from(characteristic.value, 'base64');
                // FTMS Feature is a 32-bit value (4 bytes), usually little-endian
                // The second 32-bit value (Target Setting Features) is also relevant for some commands
                this.ftmsFeatureBits = buffer.readUInt32LE(0); // First 4 bytes for Fitness Machine Features
                // const targetSettingFeatures = buffer.length >= 8 ? buffer.readUInt32LE(4) : 0; // Next 4 bytes for Target Setting Features
                console.log(`FTMS Features raw: ${buffer.toString('hex')}, bits: ${this.ftmsFeatureBits.toString(16)}`);
                return this.ftmsFeatureBits;
            }
            throw new Error("No value in FTMS Feature characteristic");
        } catch (error) {
            console.error("Read FTMS Features error:", error);
            throw error;
        }
    }
    async subscribeToNotifications(
        onControlPointResponse: (data: Buffer) => void,
        onIndoorBikeData: (data: IndoorBikeData) => void
    ): Promise<void> {
        if (!this.connectedDevice) {
            throw new Error("Device not connected.");
        }

        // First detect protocol if not already detected
        if (!this.detectedProtocol) {
            await this.detectProtocol();
        }        // Subscribe based on detected protocol
        switch (this.detectedProtocol) {
            case ProtocolType.FTMS:
                await this.subscribeToFTMSNotifications(onControlPointResponse, onIndoorBikeData);
                break;
            case ProtocolType.CSC:
                await this.subscribeToCSCNotifications(onIndoorBikeData);
                break;
            case ProtocolType.MOBI:
                await this.subscribeToMobiNotifications(onIndoorBikeData);
                break;
            case ProtocolType.REBORN:
                await this.subscribeToRebornNotifications(onIndoorBikeData);
                break;
            case ProtocolType.TACX_NEO:
                this.logWarning("Tacx Neo protocol notifications not implemented yet");
                throw new Error("Tacx Neo protocol notifications not implemented yet");
            case ProtocolType.FITSHOW:
                this.logWarning("FitShow protocol notifications not implemented yet");
                throw new Error("FitShow protocol notifications not implemented yet");
            default:
                throw new Error("Unsupported protocol for notifications");
        }
    }

    private async subscribeToFTMSNotifications(
        onControlPointResponse: (data: Buffer) => void,
        onIndoorBikeData: (data: IndoorBikeData) => void
    ): Promise<void> {
        // Control Point Notifications
        this.controlPointSubscription = this.connectedDevice!.monitorCharacteristicForService(
            FTMS_SERVICE_UUID,
            FTMS_CONTROL_POINT_CHAR_UUID,
            (error, characteristic) => {
                if (error) {
                    console.error("Control Point Notification error:", error);
                    return;
                }
                if (characteristic?.value) {
                    const buffer = Buffer.from(characteristic.value, 'base64');
                    console.log(`Control Point Response: ${buffer.toString('hex')}`);
                    this.parseControlPointResponse(buffer);
                    onControlPointResponse(buffer);
                }
            }
        );
        console.log("Subscribed to FTMS Control Point notifications");

        // Indoor Bike Data Notifications
        this.indoorBikeDataSubscription = this.connectedDevice!.monitorCharacteristicForService(
            FTMS_SERVICE_UUID,
            FTMS_INDOOR_BIKE_DATA_CHAR_UUID,
            (error, characteristic) => {
                if (error) {
                    console.error("Indoor Bike Data Notification error:", error);
                    return;
                }
                if (characteristic?.value) {
                    const buffer = Buffer.from(characteristic.value, 'base64');
                    const parsedData = this.parseIndoorBikeData(buffer);
                    onIndoorBikeData(parsedData);
                }
            }
        );
        console.log("Subscribed to FTMS Indoor Bike Data notifications");
    }

    private async subscribeToCSCNotifications(
        onIndoorBikeData: (data: IndoorBikeData) => void
    ): Promise<void> {
        // CSC Measurement Notifications
        this.indoorBikeDataSubscription = this.connectedDevice!.monitorCharacteristicForService(
            "00001816-0000-1000-8000-00805f9b34fb", // CSC Service UUID
            "00002a5b-0000-1000-8000-00805f9b34fb", // CSC Measurement Characteristic
            (error, characteristic) => {
                if (error) {
                    console.error("CSC Measurement Notification error:", error);
                    return;
                }
                if (characteristic?.value) {
                    const buffer = Buffer.from(characteristic.value, 'base64');
                    const parsedData = this.parseCSCData(buffer);
                    onIndoorBikeData(parsedData);
                }
            }
        );
        console.log("Subscribed to CSC Measurement notifications");
    }

    private async subscribeToMobiNotifications(
        onIndoorBikeData: (data: IndoorBikeData) => void
    ): Promise<void> {
        // Mobi Data Notifications
        this.indoorBikeDataSubscription = this.connectedDevice!.monitorCharacteristicForService(
            MOBI_SERVICE_UUID,
            MOBI_DATA_CHAR_UUID,
            (error, characteristic) => {
                if (error) {
                    console.error("Mobi Data Notification error:", error);
                    return;
                }
                if (characteristic?.value) {
                    const buffer = Buffer.from(characteristic.value, 'base64');
                    const parsedData = this.parseMobiData(buffer);
                    onIndoorBikeData(parsedData);
                }
            }
        );
        console.log("Subscribed to Mobi Data notifications");
    }

    private async subscribeToRebornNotifications(
        onIndoorBikeData: (data: IndoorBikeData) => void
    ): Promise<void> {
        if (!this.rebornAuthCompleted) {
            this.logInfo("Starting Reborn authentication process...");
            await this.performRebornAuthentication();
        }
        
        // Reborn Data Notifications
        this.indoorBikeDataSubscription = this.connectedDevice!.monitorCharacteristicForService(
            REBORN_SERVICE_UUID,
            REBORN_DATA_CHAR_UUID,
            (error, characteristic) => {
                if (error) {
                    console.error("Reborn Data Notification error:", error);
                    return;
                }
                if (characteristic?.value) {
                    const buffer = Buffer.from(characteristic.value, 'base64');
                    
                    // Handle authentication responses or normal data
                    if (buffer.length >= 4 && buffer[2] === 0x8A && buffer[3] === 0x03) {
                        this.handleRebornAuthResponse(buffer);
                    } else if (buffer.length === 16 && buffer[2] === 0x00 && buffer[3] === 0x80) {
                        const parsedData = this.parseRebornData(buffer);
                        onIndoorBikeData(parsedData);
                    } else if (buffer.length >= 5 && buffer[2] === 0x80 && buffer[3] === 0xE1 && buffer[4] === 0x01) {
                        this.logError("Reborn authentication error - restarting connection");
                        // In a real app, this would trigger reconnection
                    }
                }
            }
        );
        console.log("Subscribed to Reborn Data notifications");
    }parseControlPointResponse(data: Buffer): void {
        if (data.length >= 3) {
            const responseOpCode = data[0]; // Should be 0x80 for response
            const requestOpCode = data[1];
            const resultCode = data[2];
            const commandName = this.getOpCodeName(requestOpCode);
            const resultName = this.getResultCodeName(resultCode);

            if (responseOpCode === 0x80) {
                if (resultCode === 0x01) { // Success
                    this.logSuccess(`명령 응답 [성공] - 명령: ${commandName} (0x${requestOpCode.toString(16)}), 결과: ${resultName}`);
                    if (requestOpCode === 0x04) { // SET_RESISTANCE_LEVEL
                        this.logSuccess("저항 레벨 설정 성공");
                    } else if (requestOpCode === 0x00) { // REQUEST_CONTROL
                        this.logSuccess("제어 요청 승인됨");
                    } else if (requestOpCode === 0x01) { // RESET
                        this.logSuccess("기기 리셋 성공");                    } else if (requestOpCode === 0x07) { // START
                        this.logSuccess("기기 시작 성공");
                    } else if (requestOpCode === 0x08) { // STOP
                        this.logSuccess("기기 정지 성공");
                    } else if (requestOpCode === 0x05) { // SET_TARGET_POWER
                        this.logSuccess("목표 파워 설정 성공");
                    } else if (requestOpCode === 0x11) { // SET_SIM_PARAMS
                        this.logSuccess("시뮬레이션 파라미터 설정 성공");
                    }
                    // Add more specific success messages based on requestOpCode
                } else {
                    const commandName = this.getOpCodeName(requestOpCode);
                    const resultName = this.getResultCodeName(resultCode);
                    this.logWarning(`명령 응답 [실패] - 명령: ${commandName} (0x${requestOpCode.toString(16)}), 결과: ${resultName} (0x${resultCode.toString(16)})`);
                }
            } else {
                this.logWarning(`예상치 못한 Control Point 데이터 포맷: ${data.toString('hex')}`);
            }
        } else {
            this.logWarning(`잘못된 Control Point 데이터 길이: ${data.toString('hex')}`);
        }
    }parseIndoorBikeData(data: Buffer): IndoorBikeData {
        const parsed: IndoorBikeData = { raw: data.toString('hex') };
        let index = 0;

        const flags = data.readUInt16LE(index);
        index += 2;
        parsed.flags = flags;

        //this.logInfo(`Bike Data Flags: 0x${flags.toString(16)}, Raw data: ${data.toString('hex')}`);

        // Instantaneous Speed (bit 0 == 0 when present)
        if (!(flags & 0x0001)) { // More Data field, if 0, speed is present
            if (data.length >= index + 2) {                parsed.instantaneousSpeed = data.readUInt16LE(index) / 100; // km/h
                //this.logInfo(`바이크 데이터: 현재 속도 = ${parsed.instantaneousSpeed?.toFixed(2)} km/h`);
                index += 2;
            }
        }

        // Average Speed (bit 1 == 1)
        if (flags & 0x0002) {
            if (data.length >= index + 2) {
                parsed.averageSpeed = data.readUInt16LE(index) / 100; // km/h
                //this.logInfo(`바이크 데이터: 평균 속도 = ${parsed.averageSpeed?.toFixed(2)} km/h`);
                index += 2;
            }
        }

        // Instantaneous Cadence (bit 2 == 1)
        if (flags & 0x0004) {
            if (data.length >= index + 2) {                
                parsed.instantaneousCadence = data.readUInt16LE(index) / 2; // rpm
                //this.logInfo(`바이크 데이터: 현재 케이던스 = ${parsed.instantaneousCadence?.toFixed(1)} rpm`);
                index += 2;
            }
        }

        // Average Cadence (bit 3 == 1)
        if (flags & 0x0008) {
            if (data.length >= index + 2) {
                parsed.averageCadence = data.readUInt16LE(index) / 2; // rpm
                //this.logInfo(`바이크 데이터: 평균 케이던스 = ${parsed.averageCadence?.toFixed(1)} rpm`);
                index += 2;
            }
        }

        // Total Distance (bit 4 == 1)
        if (flags & 0x0010) {
            if (data.length >= index + 3) {
                parsed.totalDistance = data.readUIntLE(index, 3); // meters
                // console.log(`Total Distance: ${parsed.totalDistance} m`);
                index += 3;
            }
        }

        // Resistance Level (bit 5 == 1)
        if (flags & 0x0020) {
            if (data.length >= index + 2) {                
                parsed.resistanceLevel = data.readInt16LE(index);
                //this.logInfo(`바이크 데이터: 현재 저항 레벨 = ${parsed.resistanceLevel}`);
                index += 2;
            }
        }

        // Instantaneous Power (bit 6 == 1)
        if (flags & 0x0040) {
            if (data.length >= index + 2) {
                parsed.instantaneousPower = data.readInt16LE(index); // Watts
                //this.logInfo(`바이크 데이터: 현재 파워 = ${parsed.instantaneousPower} W`);
                index += 2;
            }
        }

        // Average Power (bit 7 == 1)
        if (flags & 0x0080) {
            if (data.length >= index + 2) {
                parsed.averagePower = data.readInt16LE(index); // Watts
                // console.log(`Average Power: ${parsed.averagePower} W`);
                index += 2;
            }
        }

        // Expended Energy (bit 8 == 1)
        if (flags & 0x0100) {
            // Total Energy (2 bytes), Energy Per Hour (2 bytes), Energy Per Minute (1 byte)
            if (data.length >= index + 2) { // Assuming Total Energy for now
                parsed.expendedEnergy = data.readUInt16LE(index); // kCal
                // console.log(`Expended Energy: ${parsed.expendedEnergy} kCal`);
                index += 2; // This field is complex, might need more bytes depending on what's present
            }
            // To fully parse, check FTMS spec for Expended Energy field structure
            // if (this.ftmsFeatureBits & (1 << 8)) { /* Check if Total Energy Present */ }
            // if (this.ftmsFeatureBits & (1 << 9)) { /* Check if Energy Per Hour Present */ index += 2; }
            // if (this.ftmsFeatureBits & (1 << 10)) { /* Check if Energy Per Minute Present */ index += 1; }
        }

        // Heart Rate (bit 9 == 1)
        if (flags & 0x0200) {
            if (data.length >= index + 1) {
                parsed.heartRate = data.readUInt8(index); // bpm
                // console.log(`Heart Rate: ${parsed.heartRate} bpm`);
                index += 1;
            }
        }

        // Metabolic Equivalent (bit 10 == 1)
        if (flags & 0x0400) {
            if (data.length >= index + 1) { // Spec says 1 byte, resolution 0.1
                parsed.metabolicEquivalent = data.readUInt8(index) / 10; // METs
                // console.log(`Metabolic Equivalent: ${parsed.metabolicEquivalent?.toFixed(1)} METs`);
                index += 1;
            }
        }

        // Elapsed Time (bit 11 == 1)
        if (flags & 0x0800) {
            if (data.length >= index + 2) {
                parsed.elapsedTime = data.readUInt16LE(index); // seconds
                // console.log(`Elapsed Time: ${parsed.elapsedTime} s`);
                index += 2;
            }
        }

        // Remaining Time (bit 12 == 1)
        if (flags & 0x1000) {
            if (data.length >= index + 2) {
                parsed.remainingTime = data.readUInt16LE(index); // seconds
                // console.log(`Remaining Time: ${parsed.remainingTime} s`);
                index += 2;
            }
        }
        // console.log("------------------------------------\n");
        return parsed;
    }    // --- Control Commands ---
    async requestControl(): Promise<void> {
        if (!this.supportsControlCommands()) {
            this.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        this.logInfo("명령 전송: REQUEST_CONTROL (0x00) - 제어 권한 요청");
        await this.writeControlPoint(REQUEST_CONTROL);
        await delay(500); // Time for device to respond
    }    async resetMachine(): Promise<void> {
        if (!this.supportsControlCommands()) {
            this.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        this.logInfo("명령 전송: RESET (0x01) - 기기 리셋");
        await this.writeControlPoint(RESET);
        await delay(1000);
    }
      async startMachine(): Promise<void> {
        if (!this.supportsControlCommands()) {
            this.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        this.logInfo("명령 전송: START (0x07) - 기기 시작");
        await this.writeControlPoint(START);
        this.isDeviceActive = true; // Set device as active
        await delay(1000);
    }    async stopMachine(): Promise<void> {
        if (!this.supportsControlCommands()) {
            this.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        this.logInfo("명령 전송: STOP (0x08) - 기기 정지");
        await this.writeControlPoint(STOP); // Stop command might have parameters for pause etc.
        this.isDeviceActive = false; // Set device as inactive
        await delay(1000);
    }    async setResistance(level: number): Promise<void> {
        if (!this.supportsControlCommands()) {
            this.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        console.log(`Sending Set Resistance Level command (${level})`);
        await this.writeControlPoint(SET_RESISTANCE_LEVEL(level));
        await delay(500);
    }    async setTargetPower(watts: number): Promise<void> {
        if (!this.supportsControlCommands()) {
            this.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        // Check if Target Power setting is supported via FTMS Feature bits (Target Setting Features, bit 2)
        // const targetSettingFeatures = ... (read from 2nd part of FTMS_FEATURE_CHAR_UUID)
        // if (!(targetSettingFeatures & (1 << 2))) {
        //    console.warn("Set Target Power may not be supported by this device.");
        // }
        console.log(`Sending Set Target Power command (${watts} watts)`);
        await this.writeControlPoint(SET_TARGET_POWER(watts));
        await delay(500);
    }    async setSimulationParameters(windSpeed: number = 0, grade: number = 0, crr: number = 0.004, cw: number = 0.5): Promise<void> {
        if (!this.supportsControlCommands()) {
            this.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        // Check if Simulation Parameters setting is supported (Target Setting Features, bit 5)
        console.log(`Sending Set Simulation Parameters command (Wind: ${windSpeed}, Grade: ${grade}%, CRR: ${crr}, CW: ${cw})`);
        // Using the default fixed values from Python for simplicity here, or the dynamic one:
        // await this.writeControlPoint(DEFAULT_SIM_PARAMS);
        await this.writeControlPoint(SET_SIM_PARAMS(windSpeed, grade, crr, cw));
        await delay(500);
    }// Example test sequence


    async runTestSequence(): Promise<void> {
        if (!this.connectedDevice) {
            this.logError("No device connected to run test sequence");
            return;
        }
        try {
            this.logInfo("Starting FTMS Test Sequence");
            
            // Machine should already be started from connectSequence()
            // If it's not, we'll start it
            if (!this.isDeviceActive) {
                this.logWarning("Device not active, starting connection sequence first");
                await this.requestControl();
                await this.resetMachine();
                await this.startMachine();
            }

            // Execute test actions directly without stopping/restarting
            this.logInfo("Setting resistance level to 100");
            await this.setResistance(100); // Example resistance
            await delay(3000); // Keep it for a while

            // Example: Set target power if supported
            // this.logInfo("Setting target power to 100 watts");
            // await this.setTargetPower(100); // 100 Watts
            // await delay(3000);

            // Example: Set simulation parameters
            // this.logInfo("Setting simulation parameters: 0 wind speed, 20% grade");
            // await this.setSimulationParameters(0, 20, 0, 0); // 20% grade
            // await delay(3000);

            // We don't stop the machine at the end of tests anymore
            // await this.stopMachine();

            this.logSuccess("FTMS Test Sequence Completed - Device remains active");
        } catch (error) {
            this.logError(`Error during test sequence: ${error instanceof Error ? error.message : String(error)}`);
        }
    }// Initial connection sequence without running tests
    async connectSequence(): Promise<boolean> {
        if (!this.connectedDevice) {
            this.logError("No device connected to run connection sequence");
            return false;
        }
        
        try {
            this.logInfo(`Starting connection sequence for ${this.detectedProtocol} protocol`);            // 프로토콜별 연결 시퀀스 처리
            switch (this.detectedProtocol) {
                case ProtocolType.FTMS:
                    return await this.connectSequenceFTMS();
                case ProtocolType.MOBI:
                    return await this.connectSequenceMobi();
                case ProtocolType.REBORN:
                    return await this.connectSequenceReborn();                case ProtocolType.TACX_NEO:
                    return await this.connectSequenceTacxNeo();
                case ProtocolType.FITSHOW:
                    return await this.connectSequenceFitShow();
                case ProtocolType.CSC:
                    return await this.connectSequenceCSC();
                default:
                    this.logError("Unsupported protocol for connection sequence");
                    return false;
            }
        } catch (error) {
            this.logError(`Error during connection sequence: ${error instanceof Error ? error.message : String(error)}`);
            this.isDeviceActive = false;
            return false;
        }
    }
    
    // FTMS 프로토콜 연결 시퀀스
    private async connectSequenceFTMS(): Promise<boolean> {
        try {
            this.logInfo("Starting FTMS Connection Sequence");
            await this.requestControl();
            await this.resetMachine();
            await this.startMachine();
            this.logSuccess("FTMS Connection Sequence Completed - Device is now active and ready for commands");
            return true;
        } catch (error) {
            this.logError(`FTMS connection sequence error: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
    
    // Mobi 프로토콜 연결 시퀀스 (추후 구현)
    private async connectSequenceMobi(): Promise<boolean> {
        this.logInfo("Mobi protocol connection sequence - read-only mode");
        this.isDeviceActive = true;
        return true;
    }    // Reborn 프로토콜 연결 시퀀스
    private async connectSequenceReborn(): Promise<boolean> {
        try {
            this.logInfo("Starting Reborn Connection Sequence");
            this.logInfo("Reborn protocol detected - authentication only, no control commands");
            
            // Reborn은 인증만 수행하고 제어 명령은 시도하지 않음
            this.logInfo("Reborn authentication completed, device is active for data reading only");
            this.isDeviceActive = true;
            return true;
        } catch (error) {
            this.logError(`Reborn connection sequence error: ${error instanceof Error ? error.message : String(error)}`);
            // fallback으로 device를 active 상태로 설정
            this.isDeviceActive = true;
            return true;
        }
    }
    
    // CSC 프로토콜 연결 시퀀스
    private async connectSequenceCSC(): Promise<boolean> {
        this.logInfo("CSC protocol connection sequence - read-only mode");
        this.isDeviceActive = true;
        return true;
    }
    
    // Tacx Neo 프로토콜 연결 시퀀스 (기본 틀)
    private async connectSequenceTacxNeo(): Promise<boolean> {
        try {
            this.logInfo("Starting Tacx Neo Connection Sequence");
            this.logWarning("Tacx Neo protocol implementation is not complete - using basic control sequence");
            // 기본 control sequence 시도
            await this.requestControl();
            await this.resetMachine();
            await this.startMachine();
            this.logSuccess("Tacx Neo Connection Sequence Completed");
            return true;
        } catch (error) {
            this.logError(`Tacx Neo connection sequence error: ${error instanceof Error ? error.message : String(error)}`);
            // fallback으로 device를 active 상태로 설정
            this.isDeviceActive = true;
            return true;
        }
    }
    
    // FitShow 프로토콜 연결 시퀀스 (기본 틀)
    private async connectSequenceFitShow(): Promise<boolean> {
        try {
            this.logInfo("Starting FitShow Connection Sequence");
            this.logWarning("FitShow protocol implementation is not complete - using basic control sequence");
            // 기본 control sequence 시도
            await this.requestControl();
            await this.resetMachine();
            await this.startMachine();
            this.logSuccess("FitShow Connection Sequence Completed");
            return true;
        } catch (error) {
            this.logError(`FitShow connection sequence error: ${error instanceof Error ? error.message : String(error)}`);
            // fallback으로 device를 active 상태로 설정
            this.isDeviceActive = true;
            return true;        }
    }

    getConnectedDevice(): Device | null {
        return this.connectedDevice;
    }
    
    // Logging methods
    setLogCallback(callback: (logs: LogEntry[]) => void): void {
        this.logCallback = callback;
    }

    // Add these helper methods
    getOpCodeName(opCode: number): string {
        switch (opCode) {
            case 0x00: return 'REQUEST_CONTROL';
            case 0x01: return 'RESET';
            case 0x02: return 'SET_TARGET_SPEED'; // Not used in current example but good to have
            case 0x03: return 'SET_TARGET_INCLINATION'; // Not used
            case 0x04: return 'SET_RESISTANCE_LEVEL';
            case 0x05: return 'SET_TARGET_POWER';
            case 0x06: return 'SET_TARGET_HEART_RATE'; // Not used
            case 0x07: return 'START';
            case 0x08: return 'STOP';
            case 0x09: return 'PAUSE'; // Not used, but part of STOP/PAUSE opcode
            case 0x11: return 'SET_SIM_PARAMS'; // Corrected from SET_INDOOR_BIKE_SIMULATION
            case 0x10: return 'GET_SUPPORTED_POWER_RANGE'; // Not used
            case 0x12: return 'GET_SUPPORTED_RESISTANCE_RANGE'; // Not used
            default: return `UNKNOWN_OPCODE_0x${opCode.toString(16)}`;
        }
    }

    getResultCodeName(resultCode: number): string {
        switch (resultCode) {
            case 0x01: return 'SUCCESS';
            case 0x02: return 'OP_CODE_NOT_SUPPORTED';
            case 0x03: return 'INVALID_PARAMETER';
            case 0x04: return 'OPERATION_FAILED';
            case 0x05: return 'CONTROL_NOT_PERMITTED';
            default: return `UNKNOWN_RESULT_0x${resultCode.toString(16)}`;
        }
    }

    getLogs(): LogEntry[] {
        return [...this.logs];
    }

    clearLogs(): void {
        this.logs = [];
        if (this.logCallback) {
            this.logCallback([]);
        }
    }

    private addLog(message: string, type: 'info' | 'error' | 'success' | 'warning'): void {
        const timestamp = new Date().toISOString();
        const log: LogEntry = { timestamp, message, type };
        this.logs.push(log);
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        if (this.logCallback) {
            this.logCallback([...this.logs]);
        }
    }

    logInfo(message: string): void {
        this.addLog(message, 'info');
    }

    logError(message: string): void {
        this.addLog(message, 'error');
    }

    logSuccess(message: string): void {
        this.addLog(message, 'success');
    }

    logWarning(message: string): void {
        this.addLog(message, 'warning');
    }

    destroy() {
        if (this.connectedDevice) {
            this.disconnectDevice();
        }
        
        // Clean up Bluetooth state subscription
        if (this.bluetoothStateSubscription) {
            this.bluetoothStateSubscription.remove();
            this.bluetoothStateSubscription = null;
        }
        
        // BleManager를 아직 destroy하지 않은 경우에만 destroy 수행
        if (this.bleManager) {
            this.bleManager.destroy();
            console.log("FTMSManager destroyed.");
            // destroy 후에는 bleManager를 null로 설정하여 중복 호출 방지
            (this as any).bleManager = null;
        }
    }    // Protocol detection method
    async detectProtocol(): Promise<ProtocolType> {
        if (!this.connectedDevice) {
            throw new Error("Device not connected");
        }
        
        try {
            this.logInfo("Detecting device protocol using priority system...");
            
            // 먼저 모든 센서 플래그 초기화
            this.resetSensorFlags();
            
            // 디바이스 이름으로 센서 타입 판별
            const deviceName = this.connectedDevice.name || "";
            this.logInfo(`Device name: ${deviceName}`);
            
            // 각 센서 타입 확인
            this.checkMobiSensor(deviceName);
            this.checkRebornSensor(deviceName);
            this.checkTacxNeoSensor(deviceName);
            this.checkFitShowSensor(deviceName);
            this.checkS3Sensor(deviceName);
            this.checkS4Sensor(deviceName);
            
            // 서비스 확인하여 FTMS 지원 여부 판별
            const services = await this.connectedDevice.services();
            for (const service of services) {
                this.logInfo(`Found service: ${service.uuid}`);
                if (service.uuid.toLowerCase() === FTMS_SERVICE_UUID.toLowerCase()) {
                    this._isFTMSSensor = true;
                    break;
                }
            }
            
            // 우선순위에 따라 프로토콜 결정
            this.detectedProtocol = this.determineProtocolByPriority();
            
            this.logSuccess(`Protocol detection completed: ${this.detectedProtocol}`);
            return this.detectedProtocol;
            
        } catch (error) {
            this.logError(`Protocol detection error: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    getDetectedProtocol(): ProtocolType | null {
        return this.detectedProtocol;
    }

    // Parse Mobi protocol data
    parseMobiData(data: Buffer): IndoorBikeData {
        const parsed: IndoorBikeData = {
            raw: data.toString('hex')
        };

        try {
            // Mobi parsing logic based on C# code
            if (data.length > 14) {
                // RPM 데이터 (bytes[9], bytes[10]) - Little Endian
                if (data.length >= 11) {
                    const rpmLow = data[10];
                    const rpmHigh = data[9];
                    const rpm = (rpmHigh << 8) | rpmLow;
                    parsed.instantaneousCadence = rpm;
                    this.logInfo(`Mobi 데이터: RPM = ${rpm}`);
                }

                // 기어 데이터 (bytes[13])
                if (data.length >= 14) {
                    const gearLevel = data[13];
                    parsed.gearLevel = gearLevel;
                    parsed.resistanceLevel = gearLevel; // Use gear as resistance level
                    this.logInfo(`Mobi 데이터: 기어 레벨 = ${gearLevel}`);
                }

                // 배터리 (항상 100%로 고정)
                parsed.batteryLevel = 100;
            }
        } catch (error) {
            this.logError(`Mobi data parsing error: ${error instanceof Error ? error.message : String(error)}`);
        }

        return parsed;
    }

    // Parse CSC (Cycling Speed and Cadence) protocol data
    parseCSCData(data: Buffer): IndoorBikeData {
        const parsed: IndoorBikeData = {
            raw: data.toString('hex')
        };

        try {
            if (data.length >= 1) {
                const flags = data[0];
                let index = 1;

                // Wheel Revolution Data Present (bit 0)
                if (flags & 0x01) {
                    if (data.length >= index + 6) {
                        const wheelRevolutions = data.readUInt32LE(index);
                        const lastWheelEventTime = data.readUInt16LE(index + 4);
                        // Calculate speed from wheel revolutions if wheel circumference is known
                        // For now, just log the raw values
                        this.logInfo(`CSC 데이터: Wheel Revolutions = ${wheelRevolutions}, Time = ${lastWheelEventTime}`);
                        index += 6;
                    }
                }

                // Crank Revolution Data Present (bit 1)
                if (flags & 0x02) {
                    if (data.length >= index + 4) {
                        const crankRevolutions = data.readUInt16LE(index);
                        const lastCrankEventTime = data.readUInt16LE(index + 2);
                        
                        // Calculate cadence (RPM) from crank revolutions
                        // This is a simplified calculation - in reality you'd need to track previous values
                        parsed.instantaneousCadence = crankRevolutions; // Placeholder
                        this.logInfo(`CSC 데이터: Crank Revolutions = ${crankRevolutions}, Time = ${lastCrankEventTime}`);
                        index += 4;
                    }
                }
            }
        } catch (error) {
            this.logError(`CSC data parsing error: ${error instanceof Error ? error.message : String(error)}`);
        }

        return parsed;
    }

    // Reborn authentication methods
    private generateRandomBytes(length: number): Buffer {
        const bytes = Buffer.alloc(length);
        for (let i = 0; i < length; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
        return bytes;
    }

    private calculateChecksum(buffer: Buffer): number {
        let sum = 0;
        for (let i = 0; i < buffer.length - 1; i++) {
            sum += buffer[i];
        }
        return sum & 0xFF;
    }

    private async performRebornAuthentication(): Promise<void> {
        this.logInfo("Performing Reborn authentication...");
        
        // Generate authentication request
        const authRequest = Buffer.alloc(15);
        authRequest[0] = 0xAA;  // Header
        authRequest[1] = 0x0F;  // Length (15 bytes)
        authRequest[2] = 0x8A;  // Command code
        authRequest[3] = 0x03;  // Method
        
        // Generate 10 random bytes
        const randomBytes = this.generateRandomBytes(10);
        randomBytes.copy(authRequest, 4);
        
        // Calculate checksum
        authRequest[14] = this.calculateChecksum(authRequest);
        
        // Store for later verification
        this.rebornAuthBytes = Buffer.from(authRequest);
        
        try {
            // Send authentication request
            await this.connectedDevice!.writeCharacteristicWithoutResponseForService(
                REBORN_SERVICE_UUID,
                REBORN_WRITE_CHAR_UUID,
                authRequest.toString('base64')
            );
            this.logInfo("Reborn authentication request sent");
        } catch (error) {
            this.logError(`Reborn authentication failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    private handleRebornAuthResponse(data: Buffer): void {
        if (!this.rebornAuthBytes) {
            this.logError("No authentication request stored for verification");
            return;
        }

        this.logInfo("Received Reborn authentication response");
        
        // Encryption key from documentation
        const key = Buffer.from([0x15, 0x25, 0x80, 0x13, 0xF0]);
        
        // Calculate expected response
        const expectedResponse = Buffer.alloc(5);
        expectedResponse[0] = (this.rebornAuthBytes[4] + this.rebornAuthBytes[9] + key[0]) & 0xFF;
        expectedResponse[1] = (this.rebornAuthBytes[5] + this.rebornAuthBytes[10] + key[1]) & 0xFF;
        expectedResponse[2] = (this.rebornAuthBytes[6] + this.rebornAuthBytes[11] + key[2]) & 0xFF;
        expectedResponse[3] = (this.rebornAuthBytes[7] + this.rebornAuthBytes[12] + key[3]) & 0xFF;
        expectedResponse[4] = (this.rebornAuthBytes[8] + this.rebornAuthBytes[13] + key[4]) & 0xFF;
        
        // Verify response (assuming response data starts at byte 4)
        if (data.length >= 9 && 
            data[4] === expectedResponse[0] && 
            data[5] === expectedResponse[1] && 
            data[6] === expectedResponse[2] && 
            data[7] === expectedResponse[3] && 
            data[8] === expectedResponse[4]) {
            
            this.logSuccess("Reborn authentication successful");
            this.rebornAuthCompleted = true;
            this.sendRebornAuthSuccess();
        } else {
            this.logError("Reborn authentication failed - invalid response");
            this.sendRebornAuthFailure();
        }
    }

    private async sendRebornAuthSuccess(): Promise<void> {
        const successData = Buffer.from([0xAA, 0x06, 0x80, 0xE1, 0x00, 0x11]);
        try {
            await this.connectedDevice!.writeCharacteristicWithoutResponseForService(
                REBORN_SERVICE_UUID,
                REBORN_WRITE_CHAR_UUID,
                successData.toString('base64')
            );
            this.logInfo("Reborn authentication success response sent");
        } catch (error) {
            this.logError(`Failed to send Reborn auth success: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async sendRebornAuthFailure(): Promise<void> {
        const failData = Buffer.from([0xAA, 0x06, 0x80, 0xE1, 0x01, 0x12]);
        try {
            await this.connectedDevice!.writeCharacteristicWithoutResponseForService(
                REBORN_SERVICE_UUID,
                REBORN_WRITE_CHAR_UUID,
                failData.toString('base64')
            );
            this.logInfo("Reborn authentication failure response sent");
        } catch (error) {
            this.logError(`Failed to send Reborn auth failure: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // Parse Reborn protocol data
    parseRebornData(data: Buffer): IndoorBikeData {
        const parsed: IndoorBikeData = {
            raw: data.toString('hex')
        };

        try {
            // Reborn parsing logic based on documentation
            if (data.length === 16 && data[2] === 0x00 && data[3] === 0x80) {
                // Validate packet length
                if (data.length !== data[1]) {
                    this.logWarning("Reborn packet length mismatch");
                    return parsed;
                }

                // RPM calculation (byte 11)
                if (data[11] > 0) {
                    const oneRoundPerSeconds = 60.0 / data[11];  // 1회전당 초
                    const secondsRPM = 1.0 / oneRoundPerSeconds;  // 초당 회전수
                    const rpm = secondsRPM * 60.0;  // 분당 회전수
                    parsed.instantaneousCadence = Math.round(rpm);
                    this.logInfo(`Reborn 데이터: RPM = ${parsed.instantaneousCadence}`);
                }

                // Gear data (byte 14)
                if (data.length >= 15) {
                    const rawGear = data[14];  // 1~100 range
                    parsed.gearLevel = rawGear;
                    // Convert raw gear to system gear (1~7) - simplified conversion
                    // In real implementation, this would use CSV table
                    const systemGear = Math.min(7, Math.max(1, Math.ceil(rawGear / 14.3))); // 100/7 ≈ 14.3
                    parsed.resistanceLevel = systemGear;
                    this.logInfo(`Reborn 데이터: 기어 = ${rawGear} (시스템 기어: ${systemGear})`);
                }

                // Battery (always 100% as per documentation)
                parsed.batteryLevel = 100;
            }
        } catch (error) {
            this.logError(`Reborn data parsing error: ${error instanceof Error ? error.message : String(error)}`);
        }

        return parsed;
    }    // 프로토콜이 control command를 지원하는지 확인하는 helper 메서드
    private supportsControlCommands(): boolean {
        switch (this.detectedProtocol) {
            case ProtocolType.FTMS:
            case ProtocolType.TACX_NEO:
            case ProtocolType.FITSHOW:
            case ProtocolType.YAFIT_S3:
            case ProtocolType.YAFIT_S4:
                return true;
            case ProtocolType.MOBI:
            case ProtocolType.REBORN:  // REBORN은 인증 외 제어 불가능
            case ProtocolType.CSC:
            default:
                return false;
        }
    }
}


