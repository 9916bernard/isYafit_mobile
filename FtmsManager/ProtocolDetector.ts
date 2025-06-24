import { Device } from 'react-native-ble-plx';
import { ProtocolType } from './protocols';
import { LogManager } from './LogManager';
import { FTMS_SERVICE_UUID, TACX_SERVICE_UUID } from './constants';

export class ProtocolDetector {
    private logManager: LogManager;
    
    // Protocol detection flags
    private _isMobiSensor: boolean = false;
    private _isRebornSensor: boolean = false;
    private _isTacxNeoSensor: boolean = false;
    private _isFSSensor: boolean = false;
    private _isS3Sensor: boolean = false;
    private _isS4Sensor: boolean = false;
    private _isFTMSSensor: boolean = false;

    constructor(logManager: LogManager) {
        this.logManager = logManager;
    }

    // --- Sensor Type Detection Methods ---
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

    private checkFTMSSensor(device: Device): boolean {
        this._isFTMSSensor = device?.serviceUUIDs?.includes(FTMS_SERVICE_UUID) ?? false;
        return this._isFTMSSensor;
    }

    public isMobiSensor(): boolean {
        return this._isMobiSensor;
    }

    private resetSensorFlags(): void {
        this._isMobiSensor = false;
        this._isRebornSensor = false;
        this._isTacxNeoSensor = false;
        this._isFSSensor = false;
        this._isS3Sensor = false;
        this._isS4Sensor = false;
        this._isFTMSSensor = false;
    }

    public detectAllProtocols(): ProtocolType[] {
        const detected: ProtocolType[] = [];
        if (this._isMobiSensor) detected.push(ProtocolType.MOBI);
        if (this._isRebornSensor) detected.push(ProtocolType.REBORN);
        if (this._isTacxNeoSensor) detected.push(ProtocolType.TACX);
        if (this._isFSSensor) detected.push(ProtocolType.FITSHOW);
        if (this._isS3Sensor) detected.push(ProtocolType.YAFIT_S3);
        if (this._isS4Sensor) detected.push(ProtocolType.YAFIT_S4);
        if (this._isFTMSSensor) detected.push(ProtocolType.FTMS);

        // Fallback to CSC if no other protocol is detected
        if (detected.length === 0) {
            detected.push(ProtocolType.CSC);
        }
        return detected;
    }

    private determineProtocolByPriority(): ProtocolType {
        if (this.isMobiSensor()) {
            this.logManager.logInfo("Detected Mobi sensor - using Mobi protocol");
            return ProtocolType.MOBI;
        } else if (this._isRebornSensor) {
            this.logManager.logInfo("Detected Reborn sensor - using Reborn protocol");
            return ProtocolType.REBORN;
        } else if (this._isTacxNeoSensor) {
            this.logManager.logInfo("Detected Tacx Neo sensor - using Tacx Neo protocol");
            return ProtocolType.TACX;
        } else if (this._isFSSensor) {
            this.logManager.logInfo("Detected FitShow sensor - using FitShow protocol");
            return ProtocolType.FITSHOW;
        } else if (this._isS3Sensor) {
            this.logManager.logInfo("Detected YafitS3 sensor - using FTMS protocol");
            return ProtocolType.YAFIT_S3;
        } else if (this._isS4Sensor) {
            this.logManager.logInfo("Detected YafitS4 sensor - using FTMS protocol");
            return ProtocolType.YAFIT_S4;
        } else if (this._isFTMSSensor) {
            this.logManager.logInfo("Detected FTMS sensor - using standard FTMS protocol");
            return ProtocolType.FTMS;
        } else {
            this.logManager.logInfo("No specific protocol detected - using CSC protocol as fallback");
            return ProtocolType.CSC;
        }
    }

    async detectProtocol(device: Device): Promise<ProtocolType> {
        try {
            this.logManager.logInfo("Detecting device protocol using priority system...");
            this.resetSensorFlags();
            
            const deviceName = device.name || "";
            this.logManager.logInfo(`Device name: ${deviceName}`);
            
            this.checkMobiSensor(deviceName);
            this.checkRebornSensor(deviceName);
            this.checkTacxNeoSensor(deviceName);
            this.checkFitShowSensor(deviceName);
            this.checkS3Sensor(deviceName);
            this.checkS4Sensor(deviceName);
            
            const services = await device.services();
            for (const service of services) {
                this.logManager.logInfo(`Found service: ${service.uuid}`);
                if (service.uuid.toLowerCase() === FTMS_SERVICE_UUID.toLowerCase()) {
                    this._isFTMSSensor = true;
                }
                if (service.uuid.toLowerCase() === TACX_SERVICE_UUID.toLowerCase()) {
                    this._isTacxNeoSensor = true;
                }
            }
            
            const detectedProtocol = this.determineProtocolByPriority();
            this.logManager.logSuccess(`Protocol detection completed: ${detectedProtocol}`);
            return detectedProtocol;
        } catch (error) {
            this.logManager.logError(`Protocol detection error: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    supportsControlCommands(protocol: ProtocolType): boolean {
        switch (protocol) {
            case ProtocolType.FTMS:
            case ProtocolType.TACX:
            case ProtocolType.FITSHOW:
            case ProtocolType.YAFIT_S3:
            case ProtocolType.YAFIT_S4:
                return true;
            case ProtocolType.MOBI:
            case ProtocolType.REBORN:
            case ProtocolType.CSC:
            default:
                return false;
        }
    }
} 