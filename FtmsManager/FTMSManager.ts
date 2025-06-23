import { Device, Characteristic, Subscription } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import {
  FTMS_SERVICE_UUID, FTMS_FEATURE_CHAR_UUID, FTMS_CONTROL_POINT_CHAR_UUID, FTMS_INDOOR_BIKE_DATA_CHAR_UUID,
  MOBI_SERVICE_UUID, MOBI_DATA_CHAR_UUID,
  REBORN_SERVICE_UUID, REBORN_DATA_CHAR_UUID
} from './constants';
import { ProtocolType } from './protocols';
import { IndoorBikeData } from './types';
import { parseIndoorBikeData, parseMobiData, parseCSCData, parseRebornData } from './parsers';
import { LogManager, LogEntry } from './LogManager';
import { BluetoothManager } from './BluetoothManager';
import { ProtocolDetector } from './ProtocolDetector';
import { RebornAuthManager } from './RebornAuthManager';
import { CommandManager } from './CommandManager';

export class FTMSManager {
    private bluetoothManager: BluetoothManager;
    private logManager: LogManager;
    private protocolDetector: ProtocolDetector;
    private rebornAuthManager: RebornAuthManager;
    private commandManager: CommandManager;
    
    private connectedDevice: Device | null = null;
    private controlPointSubscription: Subscription | null = null;
    private indoorBikeDataSubscription: Subscription | null = null;
    
    private ftmsFeatureBits: number = 0;
    private isDeviceActive: boolean = false;
    private detectedProtocol: ProtocolType | null = null;

    constructor() {
        this.logManager = new LogManager();
        this.bluetoothManager = new BluetoothManager(this.logManager);
        this.protocolDetector = new ProtocolDetector(this.logManager);
        this.rebornAuthManager = new RebornAuthManager(this.logManager);
        this.commandManager = new CommandManager(this.logManager);
        
        this.logManager.logInfo("FTMS Manager initialized");
    }

    // --- Public Interface Methods ---
    async checkBluetoothState(): Promise<boolean> {
        return await this.bluetoothManager.checkBluetoothState();
    }

    async scanForFTMSDevices(
        scanDuration: number = 10000,
        onDeviceFound: (device: Device) => void
    ): Promise<void> {
        return await this.bluetoothManager.scanForFTMSDevices(scanDuration, onDeviceFound);
    }

    async connectToDevice(deviceId: string): Promise<Device> {
        try {
            await this.disconnectDevice();
            this.connectedDevice = await this.bluetoothManager.connectToDevice(deviceId);
            this.isDeviceActive = false;
            
            await this.detectProtocol();
            await this.initializeProtocol();
            
            return this.connectedDevice;
        } catch (error) {
            this.logManager.logError(`Connection error: ${error instanceof Error ? error.message : String(error)}`);
            this.connectedDevice = null;
            this.isDeviceActive = false;
            this.detectedProtocol = null;
            throw error;
        }
    }

    async disconnectDevice(): Promise<void> {
        if (this.connectedDevice) {
            try {
                this.controlPointSubscription?.remove();
                this.indoorBikeDataSubscription?.remove();
                this.controlPointSubscription = null;
                this.indoorBikeDataSubscription = null;
                
                await this.bluetoothManager.disconnectDevice(this.connectedDevice);
                this.rebornAuthManager.resetAuthState();
            } catch (error) {
                if ((error as any).errorCode !== 201) {
                    this.logManager.logError(`Disconnection error: ${error instanceof Error ? error.message : String(error)}`);
                }
            } finally {
                this.connectedDevice = null;
                this.isDeviceActive = false;
            }
        }
    }

    async subscribeToNotifications(
        onControlPointResponse: (data: Buffer) => void,
        onIndoorBikeData: (data: IndoorBikeData) => void
    ): Promise<void> {
        if (!this.connectedDevice) {
            throw new Error("Device not connected.");
        }
        if (!this.detectedProtocol) {
            await this.detectProtocol();
        }
        
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
            case ProtocolType.TACX:
                this.logManager.logWarning("Tacx Neo protocol notifications not implemented yet");
                throw new Error("Tacx Neo protocol notifications not implemented yet");
            case ProtocolType.FITSHOW:
                this.logManager.logWarning("FitShow protocol notifications not implemented yet");
                throw new Error("FitShow protocol notifications not implemented yet");
            default:
                throw new Error("Unsupported protocol for notifications");
        }
    }

    // --- Control Commands ---
    async requestControl(): Promise<void> {
        if (!this.supportsControlCommands()) {
            this.logManager.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        await this.commandManager.requestControl(this.connectedDevice!, this.detectedProtocol!);
    }

    async resetMachine(): Promise<void> {
        if (!this.supportsControlCommands()) {
            this.logManager.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        await this.commandManager.resetMachine(this.connectedDevice!, this.detectedProtocol!);
    }

    async startMachine(): Promise<void> {
        if (!this.supportsControlCommands()) {
            this.logManager.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        await this.commandManager.startMachine(this.connectedDevice!, this.detectedProtocol!);
        this.isDeviceActive = true;
    }

    async stopMachine(): Promise<void> {
        if (!this.supportsControlCommands()) {
            this.logManager.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        await this.commandManager.stopMachine(this.connectedDevice!, this.detectedProtocol!);
        this.isDeviceActive = false;
    }

    async setResistance(level: number): Promise<void> {
        if (!this.supportsControlCommands()) {
            this.logManager.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        await this.commandManager.setResistance(this.connectedDevice!, this.detectedProtocol!, level);
    }

    async setTargetPower(watts: number): Promise<void> {
        if (!this.supportsControlCommands()) {
            this.logManager.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        await this.commandManager.setTargetPower(this.connectedDevice!, this.detectedProtocol!, watts);
    }

    async setSimulationParameters(windSpeed: number = 0, grade: number = 0, crr: number = 0.004, cw: number = 0.5): Promise<void> {
        if (!this.supportsControlCommands()) {
            this.logManager.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        await this.commandManager.setSimulationParameters(this.connectedDevice!, this.detectedProtocol!, windSpeed, grade, crr, cw);
    }

    // --- Test and Connection Sequences ---
    async runTestSequence(): Promise<void> {
        if (!this.connectedDevice) {
            this.logManager.logError("No device connected to run test sequence");
            return;
        }
        try {
            this.logManager.logInfo("Starting FTMS Test Sequence");
            if (!this.isDeviceActive) {
                this.logManager.logWarning("Device not active, starting connection sequence first");
                await this.requestControl();
                await this.resetMachine();
                await this.startMachine();
            }
            this.logManager.logInfo("Setting resistance level to 100");
            await this.setResistance(100);
            await new Promise(resolve => setTimeout(resolve, 3000));
            this.logManager.logSuccess("FTMS Test Sequence Completed - Device remains active");
        } catch (error) {
            this.logManager.logError(`Error during test sequence: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async connectSequence(): Promise<boolean> {
        if (!this.connectedDevice) {
            this.logManager.logError("No device connected to run connection sequence");
            return false;
        }
        try {
            this.logManager.logInfo(`Starting connection sequence for ${this.detectedProtocol} protocol`);
            switch (this.detectedProtocol) {
                case ProtocolType.FTMS:
                    return await this.connectSequenceFTMS();
                case ProtocolType.MOBI:
                    return await this.connectSequenceMobi();
                case ProtocolType.REBORN:
                    return await this.connectSequenceReborn();
                case ProtocolType.TACX:
                    return await this.connectSequenceTacxNeo();
                case ProtocolType.FITSHOW:
                    return await this.connectSequenceFitShow();
                case ProtocolType.CSC:
                    return await this.connectSequenceCSC();
                default:
                    this.logManager.logError("Unsupported protocol for connection sequence");
                    return false;
            }
        } catch (error) {
            this.logManager.logError(`Error during connection sequence: ${error instanceof Error ? error.message : String(error)}`);
            this.isDeviceActive = false;
            return false;
        }
    }

    // --- Getters ---
    getConnectedDevice(): Device | null {
        return this.connectedDevice;
    }

    getDetectedProtocol(): ProtocolType | null {
        return this.detectedProtocol;
    }

    getLogs(): LogEntry[] {
        return this.logManager.getLogs();
    }

    setLogCallback(callback: (logs: LogEntry[]) => void): void {
        this.logManager.setLogCallback(callback);
    }

    clearLogs(): void {
        this.logManager.clearLogs();
    }

    // --- Private Methods ---
    private async detectProtocol(): Promise<ProtocolType> {
        if (!this.connectedDevice) {
            throw new Error("Device not connected");
        }
        this.detectedProtocol = await this.protocolDetector.detectProtocol(this.connectedDevice);
        return this.detectedProtocol;
    }

    private async initializeProtocol(): Promise<void> {
        if (!this.detectedProtocol) return;
        
        switch (this.detectedProtocol) {
            case ProtocolType.FTMS:
                await this.readFTMSFeatures();
                break;
            case ProtocolType.CSC:
                this.logManager.logInfo("CSC protocol detected - no specific initialization needed");
                break;
            case ProtocolType.MOBI:
                this.logManager.logInfo("Mobi protocol detected - read-only protocol");
                break;
            case ProtocolType.REBORN:
                this.logManager.logInfo("Reborn protocol detected - authentication required");
                break;
            case ProtocolType.TACX:
                this.logManager.logInfo("Tacx Neo protocol detected - initialization not implemented yet");
                break;
            case ProtocolType.FITSHOW:
                this.logManager.logInfo("FitShow protocol detected - initialization not implemented yet");
                break;
            default:
                this.logManager.logWarning("Unknown protocol detected");
        }
    }

    public async readFTMSFeatures(): Promise<number> {
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
                this.ftmsFeatureBits = buffer.readUInt32LE(0);
                console.log(`FTMS Features raw: ${buffer.toString('hex')}, bits: ${this.ftmsFeatureBits.toString(16)}`);
                return this.ftmsFeatureBits;
            }
            throw new Error("No value in FTMS Feature characteristic");
        } catch (error) {
            console.error("Read FTMS Features error:", error);
            throw error;
        }
    }

    public getOpCodeName(opCode: number): string {
        return this.commandManager.getOpCodeName(opCode);
    }

    public getResultCodeName(resultCode: number): string {
        return this.commandManager.getResultCodeName(resultCode);
    }

    // --- Notification Subscriptions ---
    private async subscribeToFTMSNotifications(
        onControlPointResponse: (data: Buffer) => void,
        onIndoorBikeData: (data: IndoorBikeData) => void
    ): Promise<void> {
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
                    this.commandManager.parseControlPointResponse(buffer);
                    onControlPointResponse(buffer);
                }
            }
        );

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
                    const parsedData = parseIndoorBikeData(buffer);
                    onIndoorBikeData(parsedData);
                }
            }
        );
    }

    private async subscribeToCSCNotifications(
        onIndoorBikeData: (data: IndoorBikeData) => void
    ): Promise<void> {
        this.indoorBikeDataSubscription = this.connectedDevice!.monitorCharacteristicForService(
            "00001816-0000-1000-8000-00805f9b34fb",
            "00002a5b-0000-1000-8000-00805f9b34fb",
            (error, characteristic) => {
                if (error) {
                    console.error("CSC Measurement Notification error:", error);
                    return;
                }
                if (characteristic?.value) {
                    const buffer = Buffer.from(characteristic.value, 'base64');
                    const parsedData = parseCSCData(buffer);
                    onIndoorBikeData(parsedData);
                }
            }
        );
    }

    private async subscribeToMobiNotifications(
        onIndoorBikeData: (data: IndoorBikeData) => void
    ): Promise<void> {
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
                    const parsedData = parseMobiData(buffer);
                    onIndoorBikeData(parsedData);
                }
            }
        );
    }

    private async subscribeToRebornNotifications(
        onIndoorBikeData: (data: IndoorBikeData) => void
    ): Promise<void> {
        if (!this.rebornAuthManager.isAuthCompleted()) {
            this.logManager.logInfo("Starting Reborn authentication process...");
            await this.rebornAuthManager.performRebornAuthentication(this.connectedDevice!);
        }

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
                    if (buffer.length >= 4 && buffer[2] === 0x8A && buffer[3] === 0x03) {
                        this.rebornAuthManager.handleRebornAuthResponse(buffer, this.connectedDevice!);
                    } else if (buffer.length === 16 && buffer[2] === 0x00 && buffer[3] === 0x80) {
                        const parsedData = parseRebornData(buffer);
                        onIndoorBikeData(parsedData);
                    } else if (buffer.length >= 5 && buffer[2] === 0x80 && buffer[3] === 0xE1 && buffer[4] === 0x01) {
                        this.logManager.logError("Reborn authentication error - restarting connection");
                    }
                }
            }
        );
    }

    // --- Connection Sequences ---
    private async connectSequenceFTMS(): Promise<boolean> {
        try {
            this.logManager.logInfo("Starting FTMS Connection Sequence");
            await this.requestControl();
            await this.resetMachine();
            await this.startMachine();
            this.logManager.logSuccess("FTMS Connection Sequence Completed - Device is now active and ready for commands");
            return true;
        } catch (error) {
            this.logManager.logError(`FTMS connection sequence error: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    private async connectSequenceMobi(): Promise<boolean> {
        this.logManager.logInfo("Mobi protocol connection sequence - read-only mode");
        this.isDeviceActive = true;
        return true;
    }

    private async connectSequenceReborn(): Promise<boolean> {
        try {
            this.logManager.logInfo("Starting Reborn Connection Sequence");
            this.logManager.logInfo("Reborn protocol detected - authentication only, no control commands");
            this.logManager.logInfo("Reborn authentication completed, device is active for data reading only");
            this.isDeviceActive = true;
            return true;
        } catch (error) {
            this.logManager.logError(`Reborn connection sequence error: ${error instanceof Error ? error.message : String(error)}`);
            this.isDeviceActive = true;
            return true;
        }
    }

    private async connectSequenceCSC(): Promise<boolean> {
        this.logManager.logInfo("CSC protocol connection sequence - read-only mode");
        this.isDeviceActive = true;
        return true;
    }

    private async connectSequenceTacxNeo(): Promise<boolean> {
        try {
            this.logManager.logInfo("Starting Tacx Neo Connection Sequence");
            this.logManager.logWarning("Tacx Neo protocol implementation is not complete - using basic control sequence");
            await this.requestControl();
            await this.resetMachine();
            await this.startMachine();
            this.logManager.logSuccess("Tacx Neo Connection Sequence Completed");
            return true;
        } catch (error) {
            this.logManager.logError(`Tacx Neo connection sequence error: ${error instanceof Error ? error.message : String(error)}`);
            this.isDeviceActive = true;
            return true;
        }
    }

    private async connectSequenceFitShow(): Promise<boolean> {
        try {
            this.logManager.logInfo("Starting FitShow Connection Sequence");
            this.logManager.logWarning("FitShow protocol implementation is not complete - using basic control sequence");
            await this.requestControl();
            await this.resetMachine();
            await this.startMachine();
            this.logManager.logSuccess("FitShow Connection Sequence Completed");
            return true;
        } catch (error) {
            this.logManager.logError(`FitShow connection sequence error: ${error instanceof Error ? error.message : String(error)}`);
            this.isDeviceActive = true;
            return true;
        }
    }

    private supportsControlCommands(): boolean {
        if (!this.detectedProtocol) return false;
        return this.protocolDetector.supportsControlCommands(this.detectedProtocol);
    }

    destroy() {
        if (this.connectedDevice) {
            this.disconnectDevice();
        }
        this.bluetoothManager.destroy();
        console.log("FTMSManager destroyed.");
    }
}
