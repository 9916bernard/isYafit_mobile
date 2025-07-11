import { Device } from 'react-native-ble-plx';
import { ProtocolType } from './protocols';
import { LogManager } from './LogManager';
import { 
    FTMS_SERVICE_UUID, 
    TACX_SERVICE_UUID,
    NUS_SERVICE_UUID,
    HRS_SERVICE_UUID,
    CPS_SERVICE_UUID,
    BMS_SERVICE_UUID,
    DIS_SERVICE_UUID,
    CSC_SERVICE_UUID
} from './constants';

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
    
    // 새로운 표준 프로토콜 감지 플래그들 (우선순위 낮음)
    private _isNUSSensor: boolean = false;
    private _isHRSSensor: boolean = false;
    private _isCPSSensor: boolean = false;
    private _isBMSSensor: boolean = false;
    private _isDISSensor: boolean = false;
    private _isCSCSensor: boolean = false;

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

    // 새로운 표준 프로토콜 감지 메서드들 (우선순위 낮음)
    private checkNUSSensor(device: Device): boolean {
        this._isNUSSensor = device?.serviceUUIDs?.includes(NUS_SERVICE_UUID) ?? false;
        return this._isNUSSensor;
    }

    private checkHRSSensor(device: Device): boolean {
        this._isHRSSensor = device?.serviceUUIDs?.includes(HRS_SERVICE_UUID) ?? false;
        return this._isHRSSensor;
    }

    private checkCPSSensor(device: Device): boolean {
        const hasCPS = device?.serviceUUIDs?.includes(CPS_SERVICE_UUID) ?? false;
        this._isCPSSensor = hasCPS;
        
        // CPS 감지 디버깅 로그 추가
        this.logManager.logInfo(`CPS Detection Debug:`);
        this.logManager.logInfo(`  Device name: ${device.name}`);
        this.logManager.logInfo(`  Device ID: ${device.id}`);
        this.logManager.logInfo(`  Service UUIDs: ${device?.serviceUUIDs?.join(', ') || 'None'}`);
        this.logManager.logInfo(`  CPS Service UUID: ${CPS_SERVICE_UUID}`);
        this.logManager.logInfo(`  CPS detected: ${hasCPS}`);
        
        return hasCPS;
    }

    private checkBMSSensor(device: Device): boolean {
        this._isBMSSensor = device?.serviceUUIDs?.includes(BMS_SERVICE_UUID) ?? false;
        return this._isBMSSensor;
    }

    private checkDISSensor(device: Device): boolean {
        this._isDISSensor = device?.serviceUUIDs?.includes(DIS_SERVICE_UUID) ?? false;
        return this._isDISSensor;
    }

    private checkCSCSensor(device: Device): boolean {
        this._isCSCSensor = device?.serviceUUIDs?.includes(CSC_SERVICE_UUID) ?? false;
        return this._isCSCSensor;
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
        
        // 새로운 표준 프로토콜 플래그들 초기화
        this._isNUSSensor = false;
        this._isHRSSensor = false;
        this._isCPSSensor = false;
        this._isBMSSensor = false;
        this._isDISSensor = false;
        this._isCSCSensor = false;
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
        if (this._isCSCSensor) detected.push(ProtocolType.CSC);

        // 새로운 표준 프로토콜들 (우선순위 낮음)
        if (this._isNUSSensor) detected.push(ProtocolType.NUS);
        if (this._isHRSSensor) detected.push(ProtocolType.HRS);
        if (this._isCPSSensor) {
            detected.push(ProtocolType.CPS);
            this.logManager.logInfo("CPS protocol added to detected protocols");
        }
        if (this._isBMSSensor) detected.push(ProtocolType.BMS);
        if (this._isDISSensor) detected.push(ProtocolType.DIS);

        // Fallback to CSC if no other protocol is detected
        if (detected.length === 0) {
            detected.push(ProtocolType.CSC);
        }
        
        this.logManager.logInfo(`All detected protocols: ${detected.join(', ')}`);
        return detected;
    }

    private determineProtocolByPriority(): ProtocolType {
        // CPS를 최우선으로 선택 (실시간 데이터 테스트용)
        if (this._isCPSSensor) {
            this.logManager.logInfo("Detected CPS sensor - using CPS protocol (highest priority)");
            return ProtocolType.CPS;
        }
        
        // FTMS가 있으면 우선적으로 선택 (완전한 Indoor Cycle 기능)
        if (this._isFTMSSensor) {
            this.logManager.logInfo("Detected FTMS sensor - using standard FTMS protocol");
            return ProtocolType.FTMS;
        }
        

        
        // 커스텀 프로토콜들 (기존 우선순위)
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
        }
        
                // CSC가 있으면 우선적으로 선택 (FTMS 다음)
        if (this._isCSCSensor) {
            this.logManager.logInfo("Detected CSC sensor - using CSC protocol");
            return ProtocolType.CSC;
                }
        // CSC (기존 fallback)
        this.logManager.logInfo("No specific protocol detected - using CSC protocol as fallback");
        return ProtocolType.CSC;
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
            
            // CPS 센서 체크 추가
            this.checkCPSSensor(device);
            
            const services = await device.services();
            for (const service of services) {
                this.logManager.logInfo(`Found service: ${service.uuid}`);
                if (service.uuid.toLowerCase() === FTMS_SERVICE_UUID.toLowerCase()) {
                    this._isFTMSSensor = true;
                }
                if (service.uuid.toLowerCase() === TACX_SERVICE_UUID.toLowerCase()) {
                    this._isTacxNeoSensor = true;
                }
                if (service.uuid.toLowerCase() === CSC_SERVICE_UUID.toLowerCase()) {
                    this._isCSCSensor = true;
                }
                
                // 새로운 표준 프로토콜들 감지 (우선순위 낮음)
                if (service.uuid.toLowerCase() === NUS_SERVICE_UUID.toLowerCase()) {
                    this._isNUSSensor = true;
                }
                if (service.uuid.toLowerCase() === HRS_SERVICE_UUID.toLowerCase()) {
                    this._isHRSSensor = true;
                }
                if (service.uuid.toLowerCase() === CPS_SERVICE_UUID.toLowerCase()) {
                    this._isCPSSensor = true;
                    this.logManager.logInfo(`CPS service detected in service scan: ${service.uuid}`);
                }
                if (service.uuid.toLowerCase() === BMS_SERVICE_UUID.toLowerCase()) {
                    this._isBMSSensor = true;
                }
                if (service.uuid.toLowerCase() === DIS_SERVICE_UUID.toLowerCase()) {
                    this._isDISSensor = true;
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
            case ProtocolType.CPS:
                return false;
            default:
                return false;
        }
    }
} 