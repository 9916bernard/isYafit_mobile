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
    MOBI = 'MOBI'
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
    
    // Logging system
    private logs: LogEntry[] = [];
    private logCallback: ((logs: LogEntry[]) => void) | null = null;constructor() {
        this.bleManager = new BleManager();
        this.monitorBluetoothState();
        this.clearLogs();
        this.logInfo("FTMS Manager initialized");
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
            try {
                // Scan for multiple protocol UUIDs
                const serviceUUIDs = [
                    FTMS_SERVICE_UUID,
                    "00001816-0000-1000-8000-00805f9b34fb", // CSC Service UUID
                    MOBI_SERVICE_UUID
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
            await this.detectProtocol();
            
            // Protocol-specific initialization
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
            const char = await this.connectedDevice.writeCharacteristicWithResponseForService(
                FTMS_SERVICE_UUID,
                FTMS_CONTROL_POINT_CHAR_UUID,
                data.toString('base64')
            );
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
        }

        // Subscribe based on detected protocol
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
        if (this.detectedProtocol !== ProtocolType.FTMS) {
            this.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        this.logInfo("명령 전송: REQUEST_CONTROL (0x00) - 제어 권한 요청");
        await this.writeControlPoint(REQUEST_CONTROL);
        await delay(500); // Time for device to respond
    }

    async resetMachine(): Promise<void> {
        if (this.detectedProtocol !== ProtocolType.FTMS) {
            this.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        this.logInfo("명령 전송: RESET (0x01) - 기기 리셋");
        await this.writeControlPoint(RESET);
        await delay(1000);
    }    
    
    async startMachine(): Promise<void> {
        if (this.detectedProtocol !== ProtocolType.FTMS) {
            this.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        this.logInfo("명령 전송: START (0x07) - 기기 시작");
        await this.writeControlPoint(START);
        this.isDeviceActive = true; // Set device as active
        await delay(1000);
    }

    async stopMachine(): Promise<void> {
        if (this.detectedProtocol !== ProtocolType.FTMS) {
            this.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        this.logInfo("명령 전송: STOP (0x08) - 기기 정지");
        await this.writeControlPoint(STOP); // Stop command might have parameters for pause etc.
        this.isDeviceActive = false; // Set device as inactive
        await delay(1000);
    }

    async setResistance(level: number): Promise<void> {
        if (this.detectedProtocol !== ProtocolType.FTMS) {
            this.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        console.log(`Sending Set Resistance Level command (${level})`);
        await this.writeControlPoint(SET_RESISTANCE_LEVEL(level));
        await delay(500);
    }

    async setTargetPower(watts: number): Promise<void> {
        if (this.detectedProtocol !== ProtocolType.FTMS) {
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
    }

    async setSimulationParameters(windSpeed: number = 0, grade: number = 0, crr: number = 0.004, cw: number = 0.5): Promise<void> {
        if (this.detectedProtocol !== ProtocolType.FTMS) {
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
            this.logInfo("Starting FTMS Connection Sequence");

            await this.requestControl();
            await this.resetMachine();
            await this.startMachine();
            // Note: isDeviceActive is set to true in startMachine()
            
            this.logSuccess("FTMS Connection Sequence Completed - Device is now active and ready for commands");
            return true;
        } catch (error) {
            this.logError(`Error during connection sequence: ${error instanceof Error ? error.message : String(error)}`);
            this.isDeviceActive = false;
            return false;
        }
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
    }

    // Protocol detection method
    async detectProtocol(): Promise<ProtocolType> {
        if (!this.connectedDevice) {
            throw new Error("Device not connected");
        }        try {
            this.logInfo("Detecting device protocol (Priority: FTMS > CSC > MOBI)...");
            const services = await this.connectedDevice.services();
            
            // First pass: Check for FTMS (highest priority)
            for (const service of services) {
                this.logInfo(`Found service: ${service.uuid}`);
                
                if (service.uuid.toLowerCase() === FTMS_SERVICE_UUID.toLowerCase()) {
                    this.detectedProtocol = ProtocolType.FTMS;
                    this.logSuccess("Detected FTMS protocol (highest priority) - will use FTMS");
                    return ProtocolType.FTMS;
                }
            }
            
            // Second pass: Check for CSC only if FTMS not found
            for (const service of services) {
                if (service.uuid.toLowerCase() === "00001816-0000-1000-8000-00805f9b34fb") {
                    this.detectedProtocol = ProtocolType.CSC;
                    this.logSuccess("Detected CSC protocol (FTMS not found) - will use CSC");
                    return ProtocolType.CSC;
                }
            }
            
            // Third pass: Check for Mobi only if FTMS and CSC not found
            for (const service of services) {
                if (service.uuid.toLowerCase() === MOBI_SERVICE_UUID.toLowerCase()) {
                    this.detectedProtocol = ProtocolType.MOBI;
                    this.logSuccess("Detected Mobi protocol (FTMS and CSC not found) - will use Mobi");
                    return ProtocolType.MOBI;
                }
            }
            
            throw new Error("No supported protocol detected");
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
}


