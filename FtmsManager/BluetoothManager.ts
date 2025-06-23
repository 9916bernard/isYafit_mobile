import { BleManager, Device, State, Subscription } from 'react-native-ble-plx';
import { LogManager } from './LogManager';
import { FTMS_SERVICE_UUID, MOBI_SERVICE_UUID, REBORN_SERVICE_UUID } from './constants';

export class BluetoothManager {
    private bleManager: BleManager;
    private bluetoothStateSubscription: Subscription | null = null;
    private currentState: State = State.Unknown;
    private logManager: LogManager;

    constructor(logManager: LogManager) {
        this.bleManager = new BleManager();
        this.logManager = logManager;
        this.monitorBluetoothState();
    }

    private monitorBluetoothState(): void {
        this.bluetoothStateSubscription = this.bleManager.onStateChange((state) => {
            console.log(`Bluetooth state changed to: ${state}`);
            this.currentState = state;
        }, true);
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
        const isBluetoothOn = await this.checkBluetoothState();
        if (!isBluetoothOn) {
            console.error("Bluetooth is powered off. Cannot start scan.");
            throw new Error("Bluetooth is not powered on");
        }

        return new Promise((resolve, reject) => {
            try {
                const serviceUUIDs = [
                    FTMS_SERVICE_UUID,
                    "00001816-0000-1000-8000-00805f9b34fb", // CSC Service
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
    }

    async connectToDevice(deviceId: string): Promise<Device> {
        this.logManager.logInfo(`Connecting to device ${deviceId}...`);
        try {
            const device = await this.bleManager.connectToDevice(deviceId, { timeout: 20000 });
            this.logManager.logSuccess(`Connected to ${device.name}`);
            await device.discoverAllServicesAndCharacteristics();
            this.logManager.logInfo("Services and characteristics discovered");
            return device;
        } catch (error) {
            this.logManager.logError(`Connection error: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    async disconnectDevice(device: Device): Promise<void> {
        if (device) {
            try {
                this.logManager.logInfo(`Disconnecting from ${device.name}...`);
                await this.bleManager.cancelDeviceConnection(device.id);
                this.logManager.logSuccess("Disconnected successfully");
            } catch (error) {
                if ((error as any).errorCode !== 201) {
                    this.logManager.logError(`Disconnection error: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }
    }

    getBleManager(): BleManager {
        return this.bleManager;
    }

    getCurrentState(): State {
        return this.currentState;
    }

    destroy(): void {
        if (this.bluetoothStateSubscription) {
            this.bluetoothStateSubscription.remove();
            this.bluetoothStateSubscription = null;
        }
        if (this.bleManager) {
            this.bleManager.destroy();
            console.log("BluetoothManager destroyed.");
            (this as any).bleManager = null;
        }
    }
} 