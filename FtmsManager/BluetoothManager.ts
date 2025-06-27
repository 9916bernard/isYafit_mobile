import { BleManager, Device, State, Subscription } from 'react-native-ble-plx';
import { LogManager } from './LogManager';
import { FTMS_SERVICE_UUID, MOBI_SERVICE_UUID, REBORN_SERVICE_UUID } from './constants';

export class BluetoothManager {
    private bleManager: BleManager;
    private bluetoothStateSubscription: Subscription | null = null;
    private currentState: State = State.Unknown;
    private logManager: LogManager;
    private isScanning: boolean = false;
    private connectedDevice: Device | null = null;

    constructor(logManager: LogManager) {
        this.bleManager = new BleManager();
        this.logManager = logManager;
        this.monitorBluetoothState();
    }

    private monitorBluetoothState(): void {
        this.bluetoothStateSubscription = this.bleManager.onStateChange((state) => {
            // console.log(`Bluetooth state changed to: ${state}`);
            this.currentState = state;
        }, true);
    }

    async checkBluetoothState(): Promise<boolean> {
        const state = await this.bleManager.state();
        // console.log(`Current Bluetooth state: ${state}`);
        this.currentState = state;
        return state === State.PoweredOn;
    }

    async scanForFTMSDevices(
        scanDuration: number = 10000,
        onDeviceFound: (device: Device) => void
    ): Promise<void> {
        // console.log("Scanning for fitness devices (FTMS, CSC, Mobi)...");
        const isBluetoothOn = await this.checkBluetoothState();
        if (!isBluetoothOn) {
            console.error("Bluetooth is powered off. Cannot start scan.");
            throw new Error("Bluetooth is not powered on");
        }

        this.isScanning = true;
        return new Promise((resolve, reject) => {
            try {
                const serviceUUIDs = [
                    FTMS_SERVICE_UUID,
                    "00001816-0000-1000-8000-00805f9b34fb", // CSC Service
                    MOBI_SERVICE_UUID,
                    REBORN_SERVICE_UUID
                ];
                
                this.bleManager.startDeviceScan(serviceUUIDs, null, (error, foundDevice) => {
                    if (error) {
                        console.error("Scan error:", error);
                        this.bleManager.stopDeviceScan();
                        this.isScanning = false;
                        reject(error);
                        return;
                    }
                    if (foundDevice) {
                        // console.log(`Found fitness device: ${foundDevice.name} (${foundDevice.id})`);
                        onDeviceFound(foundDevice);
                    }
                });

                setTimeout(() => {
                    this.bleManager.stopDeviceScan();
                    this.isScanning = false;
                    // console.log("Scan finished.");
                    resolve();
                }, scanDuration);
            } catch (e) {
                this.isScanning = false;
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
            this.connectedDevice = device;
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
                this.connectedDevice = null;
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

    async destroy(): Promise<void> {
        this.logManager.logInfo("BluetoothManager destroying...");
        
        try {
            // Stop scanning if active
            if (this.isScanning) {
                this.bleManager.stopDeviceScan();
                this.isScanning = false;
            }
            
            // Disconnect any connected devices
            if (this.connectedDevice) {
                await this.disconnectDevice(this.connectedDevice);
            }
            
            // Clean up bluetooth state subscription
            if (this.bluetoothStateSubscription) {
                this.bluetoothStateSubscription.remove();
                this.bluetoothStateSubscription = null;
            }
            
            // Destroy BLE manager
            this.bleManager.destroy();
            
            this.logManager.logInfo("BluetoothManager destroyed");
        } catch (error) {
            this.logManager.logError(`Error during BluetoothManager destroy: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
} 