import { Buffer } from 'buffer';

// FTMS UUIDs
export const FTMS_SERVICE_UUID = "00001826-0000-1000-8000-00805f9b34fb";
export const FTMS_FEATURE_CHAR_UUID = "00002acc-0000-1000-8000-00805f9b34fb";
export const FTMS_CONTROL_POINT_CHAR_UUID = "00002ad9-0000-1000-8000-00805f9b34fb";
export const FTMS_INDOOR_BIKE_DATA_CHAR_UUID = "00002ad2-0000-1000-8000-00805f9b34fb";

// Mobi UUIDs
export const MOBI_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
export const MOBI_DATA_CHAR_UUID = "0000ffe4-0000-1000-8000-00805f9b34fb";

// Reborn UUIDs
export const REBORN_SERVICE_UUID = "00010203-0405-0607-0809-0a0b0c0d1910";
export const REBORN_DATA_CHAR_UUID = "00010203-0405-0607-0809-0a0b0c0d2b10";
export const REBORN_WRITE_CHAR_UUID = "00010203-0405-0607-0809-0a0b0c0d2b11";

// Tacx UUIDs
export const TACX_SERVICE_UUID = "6e40fec1-b5a3-f393-e0a9-e50e24dcca9e";
export const TACX_READ_CHAR_UUID = "6e40fec2-b5a3-f393-e0a9-e50e24dcca9e";
export const TACX_WRITE_CHAR_UUID = "6e40fec3-b5a3-f393-e0a9-e50e24dcca9e";

// FitShow UUIDs
export const FITSHOW_SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb";
export const FITSHOW_DATA_CHAR_UUID = "0000fff1-0000-1000-8000-00805f9b34fb";
export const FITSHOW_WRITE_CHAR_UUID = "0000fff2-0000-1000-8000-00805f9b34fb";
export const FITSHOW_BIKE_DATA_CHAR_UUID = "0000fff3-0000-1000-8000-00805f9b34fb";

// 표준 프로토콜 UUIDs (우선순위 낮음)
export const NUS_SERVICE_UUID = "6e40fec1-b5a3-f393-e0a9-e50e24dcca9e";
export const NUS_READ_CHAR_UUID = "6e40fec2-b5a3-f393-e0a9-e50e24dcca9e";
export const NUS_WRITE_CHAR_UUID = "6e40fec3-b5a3-f393-e0a9-e50e24dcca9e";

export const HRS_SERVICE_UUID = "0000180d-0000-1000-8000-00805f9b34fb";
export const HRS_MEASUREMENT_CHAR_UUID = "00002a37-0000-1000-8000-00805f9b34fb";
export const HRS_CONTROL_CHAR_UUID = "00002a39-0000-1000-8000-00805f9b34fb";

export const CPS_SERVICE_UUID = "00001818-0000-1000-8000-00805f9b34fb";
export const CPS_MEASUREMENT_CHAR_UUID = "00002a63-0000-1000-8000-00805f9b34fb";
export const CPS_FEATURE_CHAR_UUID = "00002a65-0000-1000-8000-00805f9b34fb";
export const CPS_SENSOR_LOCATION_CHAR_UUID = "00002a5d-0000-1000-8000-00805f9b34fb";

export const BMS_SERVICE_UUID = "0000180f-0000-1000-8000-00805f9b34fb";
export const BMS_LEVEL_CHAR_UUID = "00002a19-0000-1000-8000-00805f9b34fb";

export const DIS_SERVICE_UUID = "0000180a-0000-1000-8000-00805f9b34fb";
export const DIS_MANUFACTURER_CHAR_UUID = "00002a29-0000-1000-8000-00805f9b34fb";
export const DIS_MODEL_CHAR_UUID = "00002a24-0000-1000-8000-00805f9b34fb";
export const DIS_SERIAL_CHAR_UUID = "00002a25-0000-1000-8000-00805f9b34fb";
export const DIS_FIRMWARE_CHAR_UUID = "00002a26-0000-1000-8000-00805f9b34fb";
export const DIS_HARDWARE_CHAR_UUID = "00002a27-0000-1000-8000-00805f9b34fb";
export const DIS_SOFTWARE_CHAR_UUID = "00002a28-0000-1000-8000-00805f9b34fb";

// FTMS Control Point Commands
export const REQUEST_CONTROL = Buffer.from([0x00]);
export const RESET = Buffer.from([0x01]);
export const START = Buffer.from([0x07]);
export const STOP = Buffer.from([0x08]);
export const PAUSE = Buffer.from([0x09]);

export const SET_RESISTANCE_LEVEL = (level: number): Buffer => Buffer.from([0x04, level & 0xFF]);
export const SET_TARGET_POWER = (watts: number): Buffer => Buffer.from([0x05, watts & 0xFF, (watts >> 8) & 0xFF]);
export const SET_SIM_PARAMS = (windSpeed: number, grade: number, crr: number, cw: number): Buffer => {
    const windSpeedBytes = Buffer.alloc(2);
    windSpeedBytes.writeInt16LE(Math.round(windSpeed * 1000), 0); // m/s with a resolution of 0.001

    const gradeBytes = Buffer.alloc(2);
    gradeBytes.writeInt16LE(Math.round(grade * 100), 0); // Percentage with a resolution of 0.01

    const crrBytes = Buffer.alloc(1);
    crrBytes.writeUInt8(Math.round(crr * 20000), 0); // Dimensionless with a resolution of 0.00005

    const cwBytes = Buffer.alloc(1);
    cwBytes.writeUInt8(Math.round(cw * 100), 0); // kg/m with a resolution of 0.01

    return Buffer.from([
        0x11, // Opcode for Set Indoor Bike Simulation Parameters
        windSpeedBytes[0], windSpeedBytes[1],
        gradeBytes[0], gradeBytes[1],
        crrBytes[0],
        cwBytes[0]
    ]);
};

export const DEFAULT_SIM_PARAMS = Buffer.from([
    0x11,        // Opcode
    0x00, 0x00,  // Wind Speed = 0
    0xD0, 0x07,  // Grade = 2000 (20.00%)  (0x07D0 little endian)
    0x00,        // Rolling Resistance Coefficient = 0
    0x00         // Wind Resistance Coefficient = 0
]);

export const CSC_SERVICE_UUID = "00001816-0000-1000-8000-00805f9b34fb"; 