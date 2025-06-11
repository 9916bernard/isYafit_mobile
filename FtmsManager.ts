import { BleManager, Device, Characteristic, Service, Subscription, BleErrorCode, BleError, State } from 'react-native-ble-plx';
import { Buffer } from 'buffer'; // Ensure 'buffer' is installed as a dependency

// FTMS UUIDs
const FTMS_SERVICE_UUID = "00001826-0000-1000-8000-00805f9b34fb";
const FTMS_FEATURE_CHAR_UUID = "00002acc-0000-1000-8000-00805f9b34fb";
const FTMS_CONTROL_POINT_CHAR_UUID = "00002ad9-0000-1000-8000-00805f9b34fb";
// const FTMS_STATUS_CHAR_UUID = "00002ada-0000-1000-8000-00805f9b34fb"; // Optional
const FTMS_INDOOR_BIKE_DATA_CHAR_UUID = "00002ad2-0000-1000-8000-00805f9b34fb";

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
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class FTMSManager {
    private bleManager: BleManager;
    private connectedDevice: Device | null = null;
    private controlPointSubscription: Subscription | null = null;
    private indoorBikeDataSubscription: Subscription | null = null;
    private bluetoothStateSubscription: Subscription | null = null;
    private currentState: State = State.Unknown;

    private ftmsFeatureBits: number = 0;

    constructor() {
        this.bleManager = new BleManager();
        this.monitorBluetoothState();
    }    private monitorBluetoothState(): void {
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
        console.log("Scanning for FTMS devices...");
        
        // Check Bluetooth state before scanning
        const isBluetoothOn = await this.checkBluetoothState();
        if (!isBluetoothOn) {
            console.error("Bluetooth is powered off. Cannot start scan.");
            throw new Error("Bluetooth is not powered on");
        }
        
        return new Promise((resolve, reject) => {
            try {
                this.bleManager.startDeviceScan([FTMS_SERVICE_UUID], null, (error, device) => {
                    if (error) {
                        console.error("Scan error:", error);
                        this.bleManager.stopDeviceScan();
                        reject(error);
                        return;
                    }
                    if (device) {
                        console.log(`Found FTMS device: ${device.name} (${device.id})`);
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
    }

    async connectToDevice(deviceId: string): Promise<Device> {
        console.log(`Connecting to ${deviceId}...`);
        try {
            await this.disconnectDevice(); // Ensure any previous connection is closed

            const device = await this.bleManager.connectToDevice(deviceId, { timeout: 20000 });
            console.log(`Connected to ${device.name}`);
            this.connectedDevice = device;

            await device.discoverAllServicesAndCharacteristics();
            console.log("Services and characteristics discovered.");

            // Read FTMS Features
            await this.readFTMSFeatures();

            return device;
        } catch (error) {
            console.error("Connection error:", error);
            this.connectedDevice = null;
            throw error;
        }
    }

    async disconnectDevice(): Promise<void> {
        if (this.connectedDevice) {
            try {
                console.log(`Disconnecting from ${this.connectedDevice.name}...`);
                this.controlPointSubscription?.remove();
                this.indoorBikeDataSubscription?.remove();
                this.controlPointSubscription = null;
                this.indoorBikeDataSubscription = null;
                await this.bleManager.cancelDeviceConnection(this.connectedDevice.id);
                console.log("Disconnected.");
            } catch (error) {
                // Ignore cancellation errors if device is already disconnected
                if ((error as BleError).errorCode !== BleErrorCode.DeviceDisconnected) {
                    console.error("Disconnection error:", error);
                }
            } finally {
                this.connectedDevice = null;
            }
        }
    }

    private async writeControlPoint(data: Buffer): Promise<Characteristic | null> {
        if (!this.connectedDevice) {
            console.error("Device not connected.");
            return null;
        }
        try {
            console.log(`Writing to Control Point: ${data.toString('hex')}`);
            const char = await this.connectedDevice.writeCharacteristicWithResponseForService(
                FTMS_SERVICE_UUID,
                FTMS_CONTROL_POINT_CHAR_UUID,
                data.toString('base64')
            );
            console.log("Write successful.");
            return char;
        } catch (error) {
            console.error("Write Control Point error:", error);
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

        // Control Point Notifications
        this.controlPointSubscription = this.connectedDevice.monitorCharacteristicForService(
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
        console.log("Subscribed to Control Point notifications");

        // Indoor Bike Data Notifications
        this.indoorBikeDataSubscription = this.connectedDevice.monitorCharacteristicForService(
            FTMS_SERVICE_UUID,
            FTMS_INDOOR_BIKE_DATA_CHAR_UUID,
            (error, characteristic) => {
                if (error) {
                    console.error("Indoor Bike Data Notification error:", error);
                    return;
                }
                if (characteristic?.value) {
                    const buffer = Buffer.from(characteristic.value, 'base64');
                    // console.log(`Indoor Bike Data: ${buffer.toString('hex')}`);
                    const parsedData = this.parseIndoorBikeData(buffer);
                    onIndoorBikeData(parsedData);
                }
            }
        );
        console.log("Subscribed to Indoor Bike Data notifications");
    }

    parseControlPointResponse(data: Buffer): void {
        if (data.length >= 3) {
            const responseOpCode = data[0]; // Should be 0x80 for response
            const requestOpCode = data[1];
            const resultCode = data[2];

            if (responseOpCode === 0x80) {
                if (resultCode === 0x01) { // Success
                    console.log(`✅ Control point operation successful for opcode: 0x${requestOpCode.toString(16)}`);
                    if (requestOpCode === 0x04) { // SET_RESISTANCE_LEVEL
                        console.log("🔧 Resistance level set successfully");
                    }
                    // Add more specific success messages based on requestOpCode
                } else {
                    console.warn(`❌ Control point operation failed - Opcode: 0x${requestOpCode.toString(16)}, Result: 0x${resultCode.toString(16)}`);
                }
            } else {
                console.warn(`Received unexpected Control Point data format: ${data.toString('hex')}`);
            }
        } else {
            console.warn(`Received short Control Point data: ${data.toString('hex')}`);
        }
    }

    parseIndoorBikeData(data: Buffer): IndoorBikeData {
        const parsed: IndoorBikeData = { raw: data.toString('hex') };
        let index = 0;

        const flags = data.readUInt16LE(index);
        index += 2;
        parsed.flags = flags;

        // console.log(`\n\nBike Data Flags: ${flags.toString(16)}\n`);
        // console.log("------------ Bike Info ------------");
        // console.log("raw data: " + data.toString('hex'));
        // console.log(`Data length: ${data.length}, Current index: ${index}, Remaining bytes: ${data.slice(index).toString('hex') || 'None'}`);

        // Instantaneous Speed (bit 0 == 0 when present)
        if (!(flags & 0x0001)) { // More Data field, if 0, speed is present
            if (data.length >= index + 2) {
                parsed.instantaneousSpeed = data.readUInt16LE(index) / 100; // km/h
                // console.log(`Instantaneous Speed: ${parsed.instantaneousSpeed?.toFixed(2)} km/h`);
                index += 2;
            }
        }

        // Average Speed (bit 1 == 1)
        if (flags & 0x0002) {
            if (data.length >= index + 2) {
                parsed.averageSpeed = data.readUInt16LE(index) / 100; // km/h
                // console.log(`Average Speed: ${parsed.averageSpeed?.toFixed(2)} km/h`);
                index += 2;
            }
        }

        // Instantaneous Cadence (bit 2 == 1)
        if (flags & 0x0004) {
            if (data.length >= index + 2) {
                parsed.instantaneousCadence = data.readUInt16LE(index) / 2; // rpm
                // console.log(`Instantaneous Cadence: ${parsed.instantaneousCadence?.toFixed(1)} rpm`);
                index += 2;
            }
        }

        // Average Cadence (bit 3 == 1)
        if (flags & 0x0008) {
            if (data.length >= index + 2) {
                parsed.averageCadence = data.readUInt16LE(index) / 2; // rpm
                // console.log(`Average Cadence: ${parsed.averageCadence?.toFixed(1)} rpm`);
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
                // console.log(`Resistance Level: ${parsed.resistanceLevel}`);
                index += 2;
            }
        }

        // Instantaneous Power (bit 6 == 1)
        if (flags & 0x0040) {
            if (data.length >= index + 2) {
                parsed.instantaneousPower = data.readInt16LE(index); // Watts
                // console.log(`Instantaneous Power: ${parsed.instantaneousPower} W`);
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
    }

    // --- Control Commands ---
    async requestControl(): Promise<void> {
        console.log("Requesting control...");
        await this.writeControlPoint(REQUEST_CONTROL);
        await delay(500); // Time for device to respond
    }

    async resetMachine(): Promise<void> {
        console.log("Sending Reset command...");
        await this.writeControlPoint(RESET);
        await delay(1000);
    }

    async startMachine(): Promise<void> {
        console.log("Sending Start command...");
        await this.writeControlPoint(START);
        await delay(1000);
    }

    async stopMachine(): Promise<void> {
        console.log("Sending Stop command...");
        await this.writeControlPoint(STOP); // Stop command might have parameters for pause etc.
        await delay(1000);
    }

    async setResistance(level: number): Promise<void> {
        console.log(`Sending Set Resistance Level command (${level})`);
        await this.writeControlPoint(SET_RESISTANCE_LEVEL(level));
        await delay(500);
    }

    async setTargetPower(watts: number): Promise<void> {
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
        // Check if Simulation Parameters setting is supported (Target Setting Features, bit 5)
        console.log(`Sending Set Simulation Parameters command (Wind: ${windSpeed}, Grade: ${grade}%, CRR: ${crr}, CW: ${cw})`);
        // Using the default fixed values from Python for simplicity here, or the dynamic one:
        // await this.writeControlPoint(DEFAULT_SIM_PARAMS);
        await this.writeControlPoint(SET_SIM_PARAMS(windSpeed, grade, crr, cw));
        await delay(500);
    }

    // Example test sequence
    async runTestSequence(): Promise<void> {
        if (!this.connectedDevice) {
            console.error("No device connected to run test sequence.");
            return;
        }
        try {
            console.log("\n\nStarting FTMS Test Sequence...\n");

            await this.requestControl();
            await this.resetMachine();
            await this.startMachine();

            await this.setResistance(100); // Example resistance
            await delay(3000); // Keep it for a while

            // Example: Set target power if supported
            // await this.setTargetPower(100); // 100 Watts
            // await delay(3000);

            // Example: Set simulation parameters
            // await this.setSimulationParameters(0, 20, 0, 0); // 20% grade
            // await delay(3000);

            await this.stopMachine();

            console.log("\nFTMS Test Sequence Completed.\n");
        } catch (error) {
            console.error("Error during test sequence:", error);
        }
    }    getConnectedDevice(): Device | null {
        return this.connectedDevice;
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
}

// --- Example Usage (Conceptual - to be used within a React Native component) ---
/*
const ftmsManager = new FTMSManager();

async function main() {
    try {
        // 1. Scan for devices
        let targetDevice: Device | null = null;
        console.log("Scanning...");
        await ftmsManager.scanForFTMSDevices(5000, (device) => {
            console.log(`Device found: ${device.name} - ${device.id}`);
            // Implement logic to select a device, e.g., based on name or show a list to user
            if (device.name?.includes("YourBikeName")) { // Replace with actual bike name or selection logic
                targetDevice = device;
                ftmsManager.bleManager.stopDeviceScan(); // Stop scan once target is found
            }
        });

        if (!targetDevice) {
            console.log("No target FTMS device found.");
            return;
        }

        // 2. Connect to the selected device
        await ftmsManager.connectToDevice(targetDevice.id);

        // 3. Subscribe to notifications
        await ftmsManager.subscribeToNotifications(
            (cpResponse) => {
                console.log("App: CP Response:", cpResponse.toString('hex'));
            },
            (bikeData) => {
                console.log("App: Bike Data:", JSON.stringify(bikeData, null, 2));
            }
        );

        // 4. Run test sequence or send commands as needed
        await ftmsManager.runTestSequence();

        // Keep alive for a bit to receive data
        await delay(10000);


    } catch (error) {
        console.error("Main error:", error);
    } finally {
        await ftmsManager.disconnectDevice();
        ftmsManager.destroy();
    }
}

// To run this example, you'd typically call main() from a React Native component's useEffect or a button press.
// Ensure BLE permissions are handled in your React Native app.
// main(); // Do not call directly here, integrate into RN app lifecycle.
*/
