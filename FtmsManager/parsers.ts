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
    } catch (_error) {
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
                    const _wheelRevolutions = data.readUInt32LE(index);
                    const _lastWheelEventTime = data.readUInt16LE(index + 4);
                    index += 6;
                }
            }
            if (flags & 0x02) {
                if (data.length >= index + 4) {
                    const crankRevolutions = data.readUInt16LE(index);
                    const _lastCrankEventTime = data.readUInt16LE(index + 2);
                    parsed.instantaneousCadence = crankRevolutions;
                    index += 4;
                }
            }
        }
    } catch (_error) {
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
    } catch (_error) {
        // Optionally log error
    }
    return parsed;
}

export function parseTacxData(data: Buffer): IndoorBikeData {
    const parsed: IndoorBikeData = { raw: data.toString('hex') };
    if (data.length < 5) return parsed;

    const messageType = data[4];
    switch(messageType) {
        case 0x19: // RPM data
            parsed.instantaneousCadence = data[6];
            break;
        case 0xFB: // Gear/Resistance data
            const frontGear = data[10];
            const rearGear = data[11];
            // console.log(frontGear, rearGear); // log was here
            parsed.resistanceLevel = frontGear - rearGear;
            break;
    }
    return parsed;
}

// FitShow는 실제로는 자체 데이터 형식을 사용함 (C# 코드 기반)
export function parseFitShowData(data: Buffer): IndoorBikeData {
    const parsed: IndoorBikeData = { raw: data.toString('hex') };
    
    try {
        // console.log(`[FitShow Debug] Raw data length: ${data.length}, hex: ${data.toString('hex')}`); // log was here
        
        if (data.length < 12) {
            // console.log(`[FitShow Debug] Data too short: ${data.length} bytes, need at least 12 bytes`); // log was here
            return parsed;
        }
        
        // FitShow 실제 데이터 형식 (C# 코드 기반)
        // bytes[2, 3]        Instantaneous Speed
        // bytes[4, 5] / 2    Instantaneous Cadence  
        // bytes[9, 10]       Resistance Level
        // bytes[11]          Instantaneous Power
        
        // Speed (bytes[2, 3]) - km/h
        const speed = (data[2] + (data[3] * 0xFF)) * 0.01;
        parsed.instantaneousSpeed = speed;
        
        // Cadence (bytes[4, 5] / 2) - RPM
        const cadence = (data[4] + (data[5] * 0xFF)) * 0.5;
        parsed.instantaneousCadence = cadence;
        
        // Resistance (bytes[9, 10]) - level
        const resistance = (data[9] + (data[10] * 0xFF)) * 0.1;
        parsed.resistanceLevel = resistance;
        
        // Power (bytes[11]) - watts
        const power = data[11];
        parsed.instantaneousPower = power;
        
        // 배터리는 항상 100%로 고정
        parsed.batteryLevel = 100;
        
        // console.log(`[FitShow Debug] Parsed - Speed: ${speed} km/h, Cadence: ${cadence} RPM, Resistance: ${resistance}, Power: ${power}W`); // log was here
        
    } catch (error) {
        // console.error('[FitShow Debug] Parsing error:', error); // log was here
    }
    
    return parsed;
}

// 새로운 표준 프로토콜 파서들 (우선순위 낮음)

export function parseHRSData(data: Buffer): IndoorBikeData {
    const parsed: IndoorBikeData = { raw: data.toString('hex') };
    try {
        if (data.length >= 2) {
            const flags = data[0];
            let index = 1;
            
            if (flags & 0x01) {
                // Heart Rate Value Format bit
                if (data.length >= index + 1) {
                    parsed.heartRate = data.readUInt8(index);
                    index += 1;
                }
            } else {
                // 16-bit Heart Rate Value Format
                if (data.length >= index + 2) {
                    parsed.heartRate = data.readUInt16LE(index);
                    index += 2;
                }
            }
            
            // Energy Expended Status bit
            if (flags & 0x08) {
                if (data.length >= index + 2) {
                    parsed.expendedEnergy = data.readUInt16LE(index);
                }
            }
        }
    } catch (_error) {
        // Optionally log error
    }
    return parsed;
}

export function parseCPSData(data: Buffer): IndoorBikeData {
    const parsed: IndoorBikeData = { raw: data.toString('hex') };
    try {
        if (data.length < 4) return parsed;
        let index = 0;
        // Flags (2 bytes, little-endian)
        const flags = data.readUInt16LE(index);
        parsed.flags = flags;
        index += 2;

        // Instantaneous Power (sint16, 2 bytes, always present)
        if (data.length >= index + 2) {
            parsed.instantaneousPower = data.readInt16LE(index); // watt
            index += 2;
        } else {
            return parsed;
        }

        // Pedal Power Balance (uint8, 1 byte, present if bit 0 of Flags is set)
        if (flags & 0x0001) {
            if (data.length >= index + 1) {
                // 단위: 1/2 percent
                parsed.pedalPowerBalance = data.readUInt8(index) / 2;
                index += 1;
            }
        }

        // Accumulated Torque (uint16, 2 bytes, present if bit 2 of Flags is set)
        if (flags & 0x0004) {
            if (data.length >= index + 2) {
                // 단위: 1/32 Nm
                parsed.accumulatedTorque = data.readUInt16LE(index) / 32;
                index += 2;
            }
        }

        // Wheel Revolution Data (struct, 6 bytes, present if bit 4 of Flags is set)
        if (flags & 0x0010) {
            if (data.length >= index + 6) {
                parsed.cumulativeWheelRevolutions = data.readUInt32LE(index);
                parsed.lastWheelEventTime = data.readUInt16LE(index + 4); // 1/1024s
                index += 6;
            }
        }

        // Crank Revolution Data (struct, 4 bytes, present if bit 5 of Flags is set)
        if (flags & 0x0020) {
            //console.log('[CPS] Crank Revolution Data flag(bit5) is set.');
            if (data.length >= index + 4) {
                parsed.cumulativeCrankRevolutions = data.readUInt16LE(index);
                parsed.lastCrankEventTime = data.readUInt16LE(index + 2); // 1/1024s
                // instantaneousCadence 계산 (단일 패킷 기준, 실제로는 이전 값과 비교 필요하지만, 단일 패킷에서는 불가)
                // 만약 lastCrankEventTime이 0이 아니면, 임시로 (cumulativeCrankRevolutions / (lastCrankEventTime / 1024)) * 60
                if (parsed.lastCrankEventTime > 0) {
                    const timeInSeconds = parsed.lastCrankEventTime / 1024.0;
                    if (timeInSeconds > 0) {
                        parsed.instantaneousCadence = Math.round((parsed.cumulativeCrankRevolutions / timeInSeconds) * 60);
                    }
                }
                index += 4;
                //console.log('[CPS] Crank Revolution Data block parsed.');
            } else {
                //console.log('[CPS] Crank Revolution Data flag set but not enough data.');
            }
        } else {
            //console.log('[CPS] Crank Revolution Data flag(bit5) is NOT set.');
        }

        // Extreme Force Magnitudes (struct, 4 bytes, present if bit 6 of Flags is set)
        if (flags & 0x0040) {
            if (data.length >= index + 4) {
                parsed.maxForceMagnitude = data.readInt16LE(index); // N
                parsed.minForceMagnitude = data.readInt16LE(index + 2); // N
                index += 4;
            }
        }

        // Extreme Torque Magnitudes (struct, 4 bytes, present if bit 7 of Flags is set)
        if (flags & 0x0080) {
            if (data.length >= index + 4) {
                parsed.maxTorqueMagnitude = data.readInt16LE(index); // Nm
                parsed.minTorqueMagnitude = data.readInt16LE(index + 2); // Nm
                index += 4;
            }
        }

        // Extreme Angles (struct, 3 bytes, present if bit 8 of Flags is set)
        if (flags & 0x0100) {
            if (data.length >= index + 3) {
                const val = data.readUIntLE(index, 3); // 24bit
                // 12bit씩 분리
                parsed.maxAngle = (val >> 12) & 0xFFF; // degree
                parsed.minAngle = val & 0xFFF; // degree
                index += 3;
            }
        }

        // Top Dead Spot Angle (uint16, 2 bytes, present if bit 9 of Flags is set)
        if (flags & 0x0200) {
            if (data.length >= index + 2) {
                parsed.topDeadSpotAngle = data.readUInt16LE(index); // degree
                index += 2;
            }
        }

        // Bottom Dead Spot Angle (uint16, 2 bytes, present if bit 10 of Flags is set)
        if (flags & 0x0400) {
            if (data.length >= index + 2) {
                parsed.bottomDeadSpotAngle = data.readUInt16LE(index); // degree
                index += 2;
            }
        }

        // Accumulated Energy (uint16, 2 bytes, present if bit 11 of Flags is set)
        if (flags & 0x0800) {
            if (data.length >= index + 2) {
                // 단위: kilojoule
                parsed.accumulatedEnergy = data.readUInt16LE(index); // kJ
                index += 2;
            }
        }
    } catch (_error) {
        // Optionally log error
    }
    return parsed;
}

export function parseBMSData(data: Buffer): IndoorBikeData {
    const parsed: IndoorBikeData = { raw: data.toString('hex') };
    try {
        if (data.length >= 1) {
            parsed.batteryLevel = data.readUInt8(0);
        }
    } catch (_error) {
        // Optionally log error
    }
    return parsed;
}

export function parseDISData(data: Buffer): IndoorBikeData {
    const parsed: IndoorBikeData = { raw: data.toString('hex') };
    // DIS는 장치 정보만 제공하므로 실제 운동 데이터는 없음
    // 하지만 raw 데이터는 기록
    return parsed;
}

export function parseNUSData(data: Buffer): IndoorBikeData {
    const parsed: IndoorBikeData = { raw: data.toString('hex') };
    // NUS는 일반적인 UART 통신이므로 구체적인 파싱은 제조사별로 다름
    // 기본적으로는 raw 데이터만 기록
    return parsed;
} 