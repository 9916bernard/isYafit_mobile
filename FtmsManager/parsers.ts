import { Buffer } from 'buffer';
import { IndoorBikeData } from './types';

export function parseIndoorBikeData(data: Buffer): IndoorBikeData {
    const parsed: IndoorBikeData = { raw: data.toString('hex') };
    let index = 0;
    const flags = data.readUInt16LE(index);
    index += 2;
    parsed.flags = flags;
    if (!(flags & 0x0001)) {
        if (data.length >= index + 2) {
            parsed.instantaneousSpeed = data.readUInt16LE(index) / 100;
            index += 2;
        }
    }
    if (flags & 0x0002) {
        if (data.length >= index + 2) {
            parsed.averageSpeed = data.readUInt16LE(index) / 100;
            index += 2;
        }
    }
    if (flags & 0x0004) {
        if (data.length >= index + 2) {
            parsed.instantaneousCadence = data.readUInt16LE(index) / 2;
            index += 2;
        }
    }
    if (flags & 0x0008) {
        if (data.length >= index + 2) {
            parsed.averageCadence = data.readUInt16LE(index) / 2;
            index += 2;
        }
    }
    if (flags & 0x0010) {
        if (data.length >= index + 3) {
            parsed.totalDistance = data.readUIntLE(index, 3);
            index += 3;
        }
    }
    if (flags & 0x0020) {
        if (data.length >= index + 2) {
            parsed.resistanceLevel = data.readInt16LE(index);
            index += 2;
        }
    }
    if (flags & 0x0040) {
        if (data.length >= index + 2) {
            parsed.instantaneousPower = data.readInt16LE(index);
            index += 2;
        }
    }
    if (flags & 0x0080) {
        if (data.length >= index + 2) {
            parsed.averagePower = data.readInt16LE(index);
            index += 2;
        }
    }
    if (flags & 0x0100) {
        if (data.length >= index + 2) {
            parsed.expendedEnergy = data.readUInt16LE(index);
            index += 2;
        }
    }
    if (flags & 0x0200) {
        if (data.length >= index + 1) {
            parsed.heartRate = data.readUInt8(index);
            index += 1;
        }
    }
    if (flags & 0x0400) {
        if (data.length >= index + 1) {
            parsed.metabolicEquivalent = data.readUInt8(index) / 10;
            index += 1;
        }
    }
    if (flags & 0x0800) {
        if (data.length >= index + 2) {
            parsed.elapsedTime = data.readUInt16LE(index);
            index += 2;
        }
    }
    if (flags & 0x1000) {
        if (data.length >= index + 2) {
            parsed.remainingTime = data.readUInt16LE(index);
            index += 2;
        }
    }
    return parsed;
}

export function parseMobiData(data: Buffer): IndoorBikeData {
    const parsed: IndoorBikeData = { raw: data.toString('hex') };
    try {
        if (data.length > 14) {
            if (data.length >= 11) {
                const rpmLow = data[10];
                const rpmHigh = data[9];
                const rpm = (rpmHigh << 8) | rpmLow;
                parsed.instantaneousCadence = rpm;
            }
            if (data.length >= 14) {
                const gearLevel = data[13];
                parsed.gearLevel = gearLevel;
                parsed.resistanceLevel = gearLevel;
            }
            parsed.batteryLevel = 100;
        }
    } catch (error) {
        // Optionally log error
    }
    return parsed;
}

export function parseCSCData(data: Buffer): IndoorBikeData {
    const parsed: IndoorBikeData = { raw: data.toString('hex') };
    try {
        if (data.length >= 1) {
            const flags = data[0];
            let index = 1;
            if (flags & 0x01) {
                if (data.length >= index + 6) {
                    const wheelRevolutions = data.readUInt32LE(index);
                    const lastWheelEventTime = data.readUInt16LE(index + 4);
                    index += 6;
                }
            }
            if (flags & 0x02) {
                if (data.length >= index + 4) {
                    const crankRevolutions = data.readUInt16LE(index);
                    const lastCrankEventTime = data.readUInt16LE(index + 2);
                    parsed.instantaneousCadence = crankRevolutions;
                    index += 4;
                }
            }
        }
    } catch (error) {
        // Optionally log error
    }
    return parsed;
}

export function parseRebornData(data: Buffer): IndoorBikeData {
    const parsed: IndoorBikeData = { raw: data.toString('hex') };
    try {
        if (data.length === 16 && data[2] === 0x00 && data[3] === 0x80) {
            if (data.length !== data[1]) {
                return parsed;
            }
            if (data[11] > 0) {
                const oneRoundPerSeconds = 60.0 / data[11];
                const secondsRPM = 1.0 / oneRoundPerSeconds;
                const rpm = secondsRPM * 60.0;
                parsed.instantaneousCadence = Math.round(rpm);
            }
            if (data.length >= 15) {
                const rawGear = data[14];
                parsed.gearLevel = rawGear;
                const systemGear = Math.min(7, Math.max(1, Math.ceil(rawGear / 14.3)));
                parsed.resistanceLevel = systemGear;
            }
            parsed.batteryLevel = 100;
        }
    } catch (error) {
        // Optionally log error
    }
    return parsed;
}

export function parseTacxData(data: Buffer): IndoorBikeData {
    const parsed: IndoorBikeData = { raw: data.toString('hex') };

    if (data.length !== 13) {
        return parsed;
    }

    const packetType = data[4];

    if (packetType === 0x19) { // RPM Data
        const rpmRaw = data[6];
        if (rpmRaw > 0) {
            const oneRoundPerSeconds = 60.0 / rpmRaw;
            const secondsRPM = 1.0 / oneRoundPerSeconds;
            parsed.instantaneousCadence = secondsRPM * 60.0;
        } else {
            parsed.instantaneousCadence = 0;
        }
    } else if (packetType === 0xFB) { // Gear Data
        const frontGear = data[10];
        const rearGear = data[11];
        const resistance = frontGear - rearGear;

        let totalGear = 1;
        if (resistance < -10) totalGear = 1;
        else if (resistance < 0) totalGear = 2;
        else if (resistance < 7) totalGear = 3;
        else if (resistance < 13) totalGear = 4;
        else if (resistance < 20) totalGear = 5;
        else if (resistance < 27) totalGear = 6;
        else totalGear = 7;
        
        parsed.gearLevel = totalGear;
    }

    return parsed;
} 