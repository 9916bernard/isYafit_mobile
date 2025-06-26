import { Device, Characteristic, Subscription } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import {
  FTMS_SERVICE_UUID, FTMS_FEATURE_CHAR_UUID, FTMS_CONTROL_POINT_CHAR_UUID, FTMS_INDOOR_BIKE_DATA_CHAR_UUID,
  MOBI_SERVICE_UUID, MOBI_DATA_CHAR_UUID,
  REBORN_SERVICE_UUID, REBORN_DATA_CHAR_UUID,
  TACX_SERVICE_UUID, TACX_READ_CHAR_UUID,
  FITSHOW_SERVICE_UUID, FITSHOW_DATA_CHAR_UUID, FITSHOW_BIKE_DATA_CHAR_UUID, FITSHOW_WRITE_CHAR_UUID
} from './constants';
import { ProtocolType } from './protocols';
import { IndoorBikeData } from './types';
import { parseIndoorBikeData, parseMobiData, parseCSCData, parseRebornData, parseTacxData, parseFitShowData } from './parsers';
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
    private allDetectedProtocols: ProtocolType[] = [];

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
            case ProtocolType.YAFIT_S3:
            case ProtocolType.YAFIT_S4:
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
                await this.subscribeToTacxNotifications(onControlPointResponse, onIndoorBikeData);
                break;
            case ProtocolType.FITSHOW:
                await this.subscribeToFitShowNotifications(onControlPointResponse, onIndoorBikeData);
                break;
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

    async pauseMachine(): Promise<void> {
        if (!this.supportsControlCommands()) {
            this.logManager.logWarning(`Control commands not supported for ${this.detectedProtocol} protocol`);
            throw new Error(`Control commands not supported for ${this.detectedProtocol} protocol`);
        }
        await this.commandManager.pauseMachine(this.connectedDevice!, this.detectedProtocol!);
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
            this.logManager.logInfo(`Starting ${this.detectedProtocol} Test Sequence`);
            if (!this.isDeviceActive) {
                this.logManager.logWarning("Device not active, starting connection sequence first");
                await this.requestControl();
                await this.resetMachine();
                await this.startMachine();
            }
            
            // 프로토콜별 테스트 시퀀스
            switch (this.detectedProtocol) {
                case ProtocolType.FITSHOW:
                    this.logManager.logInfo("Setting FitShow resistance level to 16 (mid-range)");
                    await this.setResistance(16);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    this.logManager.logInfo("Setting FitShow resistance level to 32 (max)");
                    await this.setResistance(32);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    this.logManager.logInfo("Setting FitShow resistance level to 1 (min)");
                    await this.setResistance(1);
                    break;
                default:
                    this.logManager.logInfo("Setting resistance level to 100");
                    await this.setResistance(100);
                    await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            this.logManager.logSuccess(`${this.detectedProtocol} Test Sequence Completed - Device remains active`);
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
                case ProtocolType.YAFIT_S3:
                case ProtocolType.YAFIT_S4:
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

    // 실시간 데이터 모드를 위한 새로운 메서드 - 제어 명령 없이 데이터 구독만
    async connectSequenceForRealtimeData(): Promise<boolean> {
        if (!this.connectedDevice) {
            this.logManager.logError("No device connected to run realtime data connection sequence");
            return false;
        }
        try {
            this.logManager.logInfo(`Starting realtime data connection sequence for ${this.detectedProtocol} protocol`);
            switch (this.detectedProtocol) {
                case ProtocolType.FTMS:
                case ProtocolType.YAFIT_S3:
                case ProtocolType.YAFIT_S4:
                    return await this.connectSequenceFTMSRealtimeData();
                case ProtocolType.MOBI:
                    return await this.connectSequenceMobi();
                case ProtocolType.REBORN:
                    return await this.connectSequenceReborn();
                case ProtocolType.TACX:
                    return await this.connectSequenceTacxNeo();
                case ProtocolType.FITSHOW:
                    return await this.connectSequenceFitShowRealtimeData();
                case ProtocolType.CSC:
                    return await this.connectSequenceCSC();
                default:
                    this.logManager.logError("Unsupported protocol for realtime data connection sequence");
                    return false;
            }
        } catch (error) {
            this.logManager.logError(`Error during realtime data connection sequence: ${error instanceof Error ? error.message : String(error)}`);
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

    getAllDetectedProtocols(): ProtocolType[] {
        return this.allDetectedProtocols;
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
            this.logManager.logError("Cannot detect protocol, no device connected");
            throw new Error("No device connected");
        }
        this.detectedProtocol = await this.protocolDetector.detectProtocol(this.connectedDevice);
        this.allDetectedProtocols = this.protocolDetector.detectAllProtocols();
        this.logManager.logInfo(`All detected protocols: ${this.allDetectedProtocols.join(', ')}`);
        return this.detectedProtocol;
    }

    private async initializeProtocol(): Promise<void> {
        if (!this.connectedDevice) return;
        
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
                this.logManager.logInfo("FitShow protocol detected - 32-level resistance control supported");
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

    private async subscribeToTacxNotifications(
        onControlPointResponse: (data: Buffer) => void,
        onIndoorBikeData: (data: IndoorBikeData) => void
    ): Promise<void> {
        if (!this.connectedDevice) throw new Error("Device not connected.");
        
        this.logManager.logInfo("Subscribing to Tacx data notifications");

        this.indoorBikeDataSubscription = this.connectedDevice.monitorCharacteristicForService(
            TACX_SERVICE_UUID,
            TACX_READ_CHAR_UUID,
            (error, characteristic) => {
                if (error) {
                    this.logManager.logError(`Tacx notification error: ${error.message}`);
                    return;
                }
                if (characteristic?.value) {
                    const data = Buffer.from(characteristic.value, 'base64');
                    this.logManager.logInfo(`[Tacx Raw] ${data.toString('hex')}`);
                    
                    // 모든 데이터를 bike data로 처리 (사용자가 직접 제어 성공/실패를 판단)
                    const parsedData = parseTacxData(data);
                    onIndoorBikeData(parsedData);
                }
            }
        );
    }

    private async subscribeToFitShowNotifications(
        onControlPointResponse: (data: Buffer) => void,
        onIndoorBikeData: (data: IndoorBikeData) => void
    ): Promise<void> {
        // FitShow는 CP response가 없으므로 제어 응답 구독 제거
        // C# 코드를 보면 FitShow bike data characteristic을 사용하지만, 로그에서는 FTMS characteristic에서도 데이터를 받음
        // 두 characteristic 모두 시도
        
        this.logManager.logInfo("Starting FitShow data subscription...");
        
        // 1. FitShow bike data characteristic 시도 (C# 코드 기반)
        this.indoorBikeDataSubscription = this.connectedDevice!.monitorCharacteristicForService(
            FITSHOW_SERVICE_UUID,
            FITSHOW_BIKE_DATA_CHAR_UUID, // 0000fff3
            (error, characteristic) => {
                if (error) {
                    console.error("FitShow Bike Data Notification error:", error);
                    this.logManager.logError(`FitShow Bike Data Notification error: ${error.message}`);
                    return;
                }
                if (characteristic?.value) {
                    const buffer = Buffer.from(characteristic.value, 'base64');
                    this.logManager.logInfo(`[FitShow Bike Raw] ${buffer.toString('hex')}`);
                    const parsedData = parseFitShowData(buffer);
                    onIndoorBikeData(parsedData);
                }
            }
        );
        
        // 2. FTMS indoor bike data characteristic도 시도 (로그에서 데이터 수신 확인됨)
        try {
            this.connectedDevice!.monitorCharacteristicForService(
                FTMS_SERVICE_UUID,
                FTMS_INDOOR_BIKE_DATA_CHAR_UUID,
                (error, characteristic) => {
                    if (error) {
                        console.error("FitShow FTMS Data Notification error:", error);
                        return;
                    }
                    if (characteristic?.value) {
                        const buffer = Buffer.from(characteristic.value, 'base64');
                        this.logManager.logInfo(`[FitShow FTMS Raw] ${buffer.toString('hex')}`);
                        const parsedData = parseFitShowData(buffer);
                        onIndoorBikeData(parsedData);
                    }
                }
            );
            this.logManager.logInfo("FitShow FTMS data subscription started");
        } catch (error) {
            this.logManager.logWarning(`FitShow FTMS subscription failed: ${error}`);
        }
        
        this.logManager.logInfo("FitShow data subscriptions completed (both FitShow bike and FTMS characteristics)");
    }

    // --- Connection Sequences ---
    private async connectSequenceFTMS(): Promise<boolean> {
        this.logManager.logInfo("Running FTMS connection sequence");
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

    // 실시간 데이터 모드를 위한 FTMS 연결 시퀀스 - 제어 명령 없이 데이터 구독만
    private async connectSequenceFTMSRealtimeData(): Promise<boolean> {
        this.logManager.logInfo("Running FTMS realtime data connection sequence");
        try {
            this.logManager.logInfo("Starting FTMS Realtime Data Connection Sequence");
            
            // 실시간 데이터 모드에서는 제어 명령을 선택적으로 실행
            // 일부 디바이스에서는 제어 명령이 필요할 수 있음
            try {
                this.logManager.logInfo("Attempting minimal control sequence for realtime data mode");
                await this.requestControl();
                // resetMachine과 startMachine은 건너뛰고 바로 활성화
                this.isDeviceActive = true;
                this.logManager.logSuccess("FTMS Realtime Data Connection Sequence Completed - Device ready for data monitoring");
            } catch (controlError) {
                this.logManager.logWarning(`Control commands failed in realtime data mode: ${controlError instanceof Error ? controlError.message : String(controlError)}`);
                this.logManager.logInfo("Continuing without control commands - device may still provide data");
                this.isDeviceActive = true;
            }
            
            return true;
        } catch (error) {
            this.logManager.logError(`FTMS realtime data connection sequence error: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    private async connectSequenceMobi(): Promise<boolean> {
        this.logManager.logInfo("Mobi protocol connection sequence - read-only mode");
        this.isDeviceActive = true;
        return true;
    }

    private async connectSequenceReborn(): Promise<boolean> {
        if (!this.connectedDevice) {
            this.logManager.logError("No device connected for Reborn auth");
            return false;
        }
        try {
            await this.rebornAuthManager.performRebornAuthentication(this.connectedDevice);
            this.logManager.logInfo("Reborn authentication initiated.");
            this.isDeviceActive = true;
            return true;
        } catch (error) {
            this.logManager.logError(`Reborn connection sequence error: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    private async connectSequenceCSC(): Promise<boolean> {
        this.logManager.logSuccess("CSC sensor connected and ready");
        this.isDeviceActive = true;
        return true;
    }

    private async connectSequenceTacxNeo(): Promise<boolean> {
        this.logManager.logSuccess("Tacx Neo sensor connected and ready");
        this.isDeviceActive = true;
        return true;
    }

    private async connectSequenceFitShow(): Promise<boolean> {
        this.logManager.logInfo("Running FitShow connection sequence...");
        try {
            this.logManager.logInfo("Starting FitShow Connection Sequence");
            
            // FitShow 디바이스 초기화 명령 (C# 코드 기반)
            this.logManager.logInfo("Sending FitShow device init command...");
            try {
                const initCommand = Buffer.from([0x02, 0x44, 0x01, 0x45, 0x03]);
                await this.connectedDevice!.writeCharacteristicWithResponseForService(
                    FITSHOW_SERVICE_UUID,
                    FITSHOW_WRITE_CHAR_UUID,
                    initCommand.toString('base64')
                );
                this.logManager.logSuccess("FitShow device init command sent");
            } catch (error) {
                this.logManager.logWarning(`FitShow device init command failed: ${error}`);
            }
            
            // 3초 대기 후 시작 명령 전송 (C# 코드와 동일)
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // FitShow 디바이스 시작 명령
            this.logManager.logInfo("Sending FitShow device start command...");
            try {
                const startCommand = Buffer.from([0x02, 0x44, 0x02, 0x46, 0x03]);
                await this.connectedDevice!.writeCharacteristicWithResponseForService(
                    FITSHOW_SERVICE_UUID,
                    FITSHOW_WRITE_CHAR_UUID,
                    startCommand.toString('base64')
                );
                this.logManager.logSuccess("FitShow device start command sent");
            } catch (error) {
                this.logManager.logWarning(`FitShow device start command failed: ${error}`);
            }
            
            // 잠시 대기하여 데이터 전송 시작 확인
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            this.logManager.logSuccess("FitShow Connection Sequence Completed - Device is now active and ready for commands");
            this.isDeviceActive = true;
            return true;
        } catch (error) {
            this.logManager.logError(`FitShow connection sequence error: ${error instanceof Error ? error.message : String(error)}`);
            // FitShow는 연결 실패해도 기본적으로 활성화 상태로 설정 (데이터 수신 가능)
            this.isDeviceActive = true;
            return true;
        }
    }

    // 실시간 데이터 모드를 위한 FitShow 연결 시퀀스 - 제어 명령 없이 데이터 구독만
    private async connectSequenceFitShowRealtimeData(): Promise<boolean> {
        this.logManager.logInfo("Running FitShow realtime data connection sequence");
        try {
            this.logManager.logInfo("Starting FitShow Realtime Data Connection Sequence");
            
            // 실시간 데이터 모드에서는 제어 명령을 선택적으로 실행
            try {
                this.logManager.logInfo("Attempting minimal FitShow control sequence for realtime data mode");
                
                // FitShow 디바이스 초기화 명령 (C# 코드 기반)
                this.logManager.logInfo("Sending FitShow device init command...");
                try {
                    const initCommand = Buffer.from([0x02, 0x44, 0x01, 0x45, 0x03]);
                    await this.connectedDevice!.writeCharacteristicWithResponseForService(
                        FITSHOW_SERVICE_UUID,
                        FITSHOW_WRITE_CHAR_UUID,
                        initCommand.toString('base64')
                    );
                    this.logManager.logSuccess("FitShow device init command sent");
                } catch (error) {
                    this.logManager.logWarning(`FitShow device init command failed: ${error}`);
                }
                
                // 3초 대기 후 시작 명령 전송 (C# 코드와 동일)
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // FitShow 디바이스 시작 명령
                this.logManager.logInfo("Sending FitShow device start command...");
                try {
                    const startCommand = Buffer.from([0x02, 0x44, 0x02, 0x46, 0x03]);
                    await this.connectedDevice!.writeCharacteristicWithResponseForService(
                        FITSHOW_SERVICE_UUID,
                        FITSHOW_WRITE_CHAR_UUID,
                        startCommand.toString('base64')
                    );
                    this.logManager.logSuccess("FitShow device start command sent");
                } catch (error) {
                    this.logManager.logWarning(`FitShow device start command failed: ${error}`);
                }
                
                // 잠시 대기하여 데이터 전송 시작 확인
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (controlError) {
                this.logManager.logWarning(`FitShow control commands failed in realtime data mode: ${controlError instanceof Error ? controlError.message : String(controlError)}`);
                this.logManager.logInfo("Continuing without FitShow control commands - device may still provide data");
            }
            
            this.isDeviceActive = true;
            this.logManager.logSuccess("FitShow Realtime Data Connection Sequence Completed - Device ready for data monitoring");
            return true;
        } catch (error) {
            this.logManager.logError(`FitShow realtime data connection sequence error: ${error instanceof Error ? error.message : String(error)}`);
            // FitShow는 연결 실패해도 기본적으로 활성화 상태로 설정 (데이터 수신 가능)
            this.isDeviceActive = true;
            return true;
        }
    }

    private supportsControlCommands(): boolean {
        if (!this.detectedProtocol) return false;
        return this.protocolDetector.supportsControlCommands(this.detectedProtocol);
    }

    destroy() {
        this.logManager.logInfo("FTMS Manager destroying...");
        
        // Clean up all subscriptions
        if (this.controlPointSubscription) {
            this.controlPointSubscription.remove();
            this.controlPointSubscription = null;
        }
        
        if (this.indoorBikeDataSubscription) {
            this.indoorBikeDataSubscription.remove();
            this.indoorBikeDataSubscription = null;
        }
        
        // Disconnect device if connected
        if (this.connectedDevice) {
            this.disconnectDevice().catch(error => {
                this.logManager.logError(`Error during destroy disconnect: ${error instanceof Error ? error.message : String(error)}`);
            });
        }
        
        // Reset all state
        this.connectedDevice = null;
        this.isDeviceActive = false;
        this.detectedProtocol = null;
        this.allDetectedProtocols = [];
        this.ftmsFeatureBits = 0;
        
        // Clear log callback
        this.logManager.setLogCallback(null);
        
        // Destroy bluetooth manager
        this.bluetoothManager.destroy().catch(error => {
            this.logManager.logError(`Error during bluetooth manager destroy: ${error instanceof Error ? error.message : String(error)}`);
        });
        
        this.logManager.logInfo("FTMS Manager destroyed");
    }
}
