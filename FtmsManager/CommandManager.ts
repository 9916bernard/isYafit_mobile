import { Device, Characteristic } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { LogManager } from './LogManager';
import { ProtocolType } from './protocols';
import {
    FTMS_SERVICE_UUID, FTMS_CONTROL_POINT_CHAR_UUID,
    REBORN_SERVICE_UUID, REBORN_WRITE_CHAR_UUID,
    TACX_SERVICE_UUID, TACX_WRITE_CHAR_UUID,
    FITSHOW_SERVICE_UUID, FITSHOW_WRITE_CHAR_UUID,
    REQUEST_CONTROL, RESET, START, STOP, SET_RESISTANCE_LEVEL, SET_TARGET_POWER, SET_SIM_PARAMS,
    PAUSE
} from './constants';

// --- Tacx Packet Builder ---
const TACX_SYNC_BYTE = 0xA4;
const TACX_MSG_TYPE_ACK = 0x4F;
const TACX_DEFAULT_CHANNEL = 0x05;

function calculateTacxChecksum(data: Buffer): number {
    let checksum = 0;
    for (let i = 0; i < data.length - 1; i++) {
        checksum ^= data[i];
    }
    return checksum;
}

function createTacxPacket(commandId: number, payload: Buffer): Buffer {
    if (payload.length !== 7) {
        console.error(`Tacx payload must be 7 bytes long, but got ${payload.length}`);
        return Buffer.alloc(0);
    }
    const packet = Buffer.alloc(13);
    
    packet.writeUInt8(TACX_SYNC_BYTE, 0);
    packet.writeUInt8(0x09, 1);
    packet.writeUInt8(TACX_MSG_TYPE_ACK, 2);
    packet.writeUInt8(TACX_DEFAULT_CHANNEL, 3);
    packet.writeUInt8(commandId, 4);
    payload.copy(packet, 5);
    
    const checksum = calculateTacxChecksum(packet);
    packet.writeUInt8(checksum, 12);
    
    return packet;
}

// --- Tacx Command Creators ---
function setTacxResistance(level: number): Buffer {
    const resistanceValue = Math.min(255, Math.round(level * 2.0));
    const payload = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, resistanceValue]);
    return createTacxPacket(0x30, payload);
}

function setTacxTargetPower(watts: number): Buffer {
    const target = Math.round(watts * 4);
    const payload = Buffer.from([
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        target & 0xFF,
        (target >> 8) & 0xFF
    ]);
    return createTacxPacket(0x31, payload);
}

function setTacxSimulationParameters(grade: number, crr: number): Buffer {
    const gradeN = Math.round((grade + 200) / 0.01);
    const crrN = Math.round(crr / (5 * Math.pow(10, -5)));

    const payload = Buffer.from([
        0xFF, 0xFF, 0xFF, 0xFF,
        gradeN & 0xFF,
        (gradeN >> 8) & 0xFF,
        crrN
    ]);
    return createTacxPacket(0x33, payload);
}

// --- FitShow Command Creators ---
function setFitShowResistance(level: number): Buffer {
    // FitShow 저항 설정: 1~32단 범위
    const resistanceLevel = Math.min(32, Math.max(1, level));
    return Buffer.from([0x04, resistanceLevel & 0xFF]);
}

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
                    char = await device.writeCharacteristicWithResponseForService(
                        TACX_SERVICE_UUID,
                        TACX_WRITE_CHAR_UUID,
                        data.toString('base64')
                    );
                    break;
                case ProtocolType.FITSHOW:
                    // FitShow는 CP response가 없으므로 즉시 성공으로 처리
                    char = await device.writeCharacteristicWithResponseForService(
                        FITSHOW_SERVICE_UUID,
                        FITSHOW_WRITE_CHAR_UUID,
                        data.toString('base64')
                    );
                    this.logManager.logSuccess("FitShow control command sent successfully (no CP response expected)");
                    break;
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
        if (protocol === ProtocolType.FITSHOW) {
            this.logManager.logInfo("명령 전송: FITSHOW_START (0x02, 0x44, 0x02, 0x46, 0x03) - FitShow 기기 시작");
            const startCommand = Buffer.from([0x02, 0x44, 0x02, 0x46, 0x03]);
            await this.writeControlPoint(device, protocol, startCommand);
        } else {
            this.logManager.logInfo("명령 전송: START (0x07) - 기기 시작");
            await this.writeControlPoint(device, protocol, START);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    async stopMachine(device: Device, protocol: ProtocolType): Promise<void> {
        if (protocol === ProtocolType.FITSHOW) {
            this.logManager.logInfo("명령 전송: FITSHOW_STOP (0x02, 0x44, 0x04, 0x40, 0x03) - FitShow 기기 정지");
            const stopCommand = Buffer.from([0x02, 0x44, 0x04, 0x40, 0x03]);
            await this.writeControlPoint(device, protocol, stopCommand);
        } else {
            this.logManager.logInfo("명령 전송: STOP (0x08) - 기기 정지");
            await this.writeControlPoint(device, protocol, STOP);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    async pauseMachine(device: Device, protocol: ProtocolType): Promise<void> {
        if (protocol === ProtocolType.FITSHOW) {
            this.logManager.logInfo("명령 전송: FITSHOW_PAUSE (0x02, 0x44, 0x03, 0x47, 0x03) - FitShow 기기 일시정지");
            const pauseCommand = Buffer.from([0x02, 0x44, 0x03, 0x47, 0x03]);
            await this.writeControlPoint(device, protocol, pauseCommand);
        } else {
            this.logManager.logInfo("명령 전송: PAUSE (0x09) - 기기 일시정지");
            await this.writeControlPoint(device, protocol, PAUSE);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    async setResistance(device: Device, protocol: ProtocolType, level: number): Promise<void> {
        let command: Buffer;
        if (protocol === ProtocolType.TACX) {
            this.logManager.logInfo(`명령 전송: SET_TACX_RESISTANCE (${level}%)`);
            command = setTacxResistance(level);
        } else if (protocol === ProtocolType.FITSHOW) {
            this.logManager.logInfo(`명령 전송: SET_FITSHOW_RESISTANCE (${level})`);
            command = setFitShowResistance(level);
        } else {
            this.logManager.logInfo(`명령 전송: SET_RESISTANCE_LEVEL (${level})`);
            command = SET_RESISTANCE_LEVEL(level);
        }
        await this.writeControlPoint(device, protocol, command);
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    async setTargetPower(device: Device, protocol: ProtocolType, watts: number): Promise<void> {
        let command: Buffer;
        if (protocol === ProtocolType.TACX) {
            this.logManager.logInfo(`명령 전송: SET_TACX_TARGET_POWER (${watts}W)`);
            command = setTacxTargetPower(watts);
        } else {
            this.logManager.logInfo(`명령 전송: SET_TARGET_POWER (${watts}W)`);
            command = SET_TARGET_POWER(watts);
        }
        await this.writeControlPoint(device, protocol, command);
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
        let command: Buffer;
        if (protocol === ProtocolType.TACX) {
            this.logManager.logInfo(`명령 전송: SET_TACX_SIM_PARAMS (grade: ${grade}%, crr: ${crr})`);
            command = setTacxSimulationParameters(grade, crr);
        } else {
            this.logManager.logInfo(`명령 전송: SET_SIM_PARAMS (grade: ${grade}%)`);
            command = SET_SIM_PARAMS(windSpeed, grade, crr, cw);
        }
        await this.writeControlPoint(device, protocol, command);
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