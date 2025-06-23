import { Device, Characteristic } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { LogManager } from './LogManager';
import { ProtocolType } from './protocols';
import {
    FTMS_SERVICE_UUID, FTMS_CONTROL_POINT_CHAR_UUID,
    REBORN_SERVICE_UUID, REBORN_WRITE_CHAR_UUID,
    REQUEST_CONTROL, RESET, START, STOP, SET_RESISTANCE_LEVEL, SET_TARGET_POWER, SET_SIM_PARAMS
} from './constants';

export class CommandManager {
    private logManager: LogManager;

    constructor(logManager: LogManager) {
        this.logManager = logManager;
    }

    async writeControlPoint(
        device: Device, 
        protocol: ProtocolType, 
        data: Buffer
    ): Promise<Characteristic | null> {
        try {
            this.logManager.logInfo(`Writing to Control Point: ${data.toString('hex')}`);
            let char: Characteristic | null = null;
            
            switch (protocol) {
                case ProtocolType.FTMS:
                case ProtocolType.YAFIT_S3:
                case ProtocolType.YAFIT_S4:
                    char = await device.writeCharacteristicWithResponseForService(
                        FTMS_SERVICE_UUID,
                        FTMS_CONTROL_POINT_CHAR_UUID,
                        data.toString('base64')
                    );
                    break;
                case ProtocolType.REBORN:
                    char = await device.writeCharacteristicWithResponseForService(
                        REBORN_SERVICE_UUID,
                        REBORN_WRITE_CHAR_UUID,
                        data.toString('base64')
                    );
                    break;
                case ProtocolType.TACX:
                case ProtocolType.FITSHOW:
                    this.logManager.logWarning(`Control point implementation not yet available for ${protocol} protocol`);
                    throw new Error(`Control point implementation not yet available for ${protocol} protocol`);
                default:
                    throw new Error(`Unsupported protocol for control commands: ${protocol}`);
            }
            
            this.logManager.logSuccess("Write successful");
            return char;
        } catch (error) {
            this.logManager.logError(`Write Control Point error: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    parseControlPointResponse(data: Buffer): void {
        if (data.length >= 3) {
            const responseOpCode = data[0];
            const requestOpCode = data[1];
            const resultCode = data[2];
            const commandName = this.getOpCodeName(requestOpCode);
            const resultName = this.getResultCodeName(resultCode);
            
            if (responseOpCode === 0x80) {
                if (resultCode === 0x01) {
                    this.logManager.logSuccess(`명령 응답 [성공] - 명령: ${commandName} (0x${requestOpCode.toString(16)}), 결과: ${resultName}`);
                    if (requestOpCode === 0x04) {
                        this.logManager.logSuccess("저항 레벨 설정 성공");
                    } else if (requestOpCode === 0x00) {
                        this.logManager.logSuccess("제어 요청 승인됨");
                    } else if (requestOpCode === 0x01) {
                        this.logManager.logSuccess("기기 리셋 성공");
                    } else if (requestOpCode === 0x07) {
                        this.logManager.logSuccess("기기 시작 성공");
                    } else if (requestOpCode === 0x08) {
                        this.logManager.logSuccess("기기 정지 성공");
                    } else if (requestOpCode === 0x05) {
                        this.logManager.logSuccess("목표 파워 설정 성공");
                    } else if (requestOpCode === 0x11) {
                        this.logManager.logSuccess("시뮬레이션 파라미터 설정 성공");
                    }
                } else {
                    this.logManager.logWarning(`명령 응답 [실패] - 명령: ${commandName} (0x${requestOpCode.toString(16)}), 결과: ${resultName} (0x${resultCode.toString(16)})`);
                }
            } else {
                this.logManager.logWarning(`예상치 못한 Control Point 데이터 포맷: ${data.toString('hex')}`);
            }
        } else {
            this.logManager.logWarning(`잘못된 Control Point 데이터 길이: ${data.toString('hex')}`);
        }
    }

    async requestControl(device: Device, protocol: ProtocolType): Promise<void> {
        this.logManager.logInfo("명령 전송: REQUEST_CONTROL (0x00) - 제어 권한 요청");
        await this.writeControlPoint(device, protocol, REQUEST_CONTROL);
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    async resetMachine(device: Device, protocol: ProtocolType): Promise<void> {
        this.logManager.logInfo("명령 전송: RESET (0x01) - 기기 리셋");
        await this.writeControlPoint(device, protocol, RESET);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    async startMachine(device: Device, protocol: ProtocolType): Promise<void> {
        this.logManager.logInfo("명령 전송: START (0x07) - 기기 시작");
        await this.writeControlPoint(device, protocol, START);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    async stopMachine(device: Device, protocol: ProtocolType): Promise<void> {
        this.logManager.logInfo("명령 전송: STOP (0x08) - 기기 정지");
        await this.writeControlPoint(device, protocol, STOP);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    async setResistance(device: Device, protocol: ProtocolType, level: number): Promise<void> {
        await this.writeControlPoint(device, protocol, SET_RESISTANCE_LEVEL(level));
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    async setTargetPower(device: Device, protocol: ProtocolType, watts: number): Promise<void> {
        await this.writeControlPoint(device, protocol, SET_TARGET_POWER(watts));
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    async setSimulationParameters(
        device: Device, 
        protocol: ProtocolType, 
        windSpeed: number = 0, 
        grade: number = 0, 
        crr: number = 0.004, 
        cw: number = 0.5
    ): Promise<void> {
        await this.writeControlPoint(device, protocol, SET_SIM_PARAMS(windSpeed, grade, crr, cw));
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    getOpCodeName(opCode: number): string {
        switch (opCode) {
            case 0x00: return 'REQUEST_CONTROL';
            case 0x01: return 'RESET';
            case 0x02: return 'SET_TARGET_SPEED';
            case 0x03: return 'SET_TARGET_INCLINATION';
            case 0x04: return 'SET_RESISTANCE_LEVEL';
            case 0x05: return 'SET_TARGET_POWER';
            case 0x06: return 'SET_TARGET_HEART_RATE';
            case 0x07: return 'START';
            case 0x08: return 'STOP';
            case 0x09: return 'PAUSE';
            case 0x11: return 'SET_SIM_PARAMS';
            case 0x10: return 'GET_SUPPORTED_POWER_RANGE';
            case 0x12: return 'GET_SUPPORTED_RESISTANCE_RANGE';
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
} 