 
# FTMS 및 기타 프로토콜 UUID
FTMS_SERVICE_UUID = "00001826-0000-1000-8000-00805f9b34fb"
CSC_SERVICE_UUID = "00001816-0000-1000-8000-00805f9b34fb"  # Cycling Speed and Cadence
MOBI_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb"  # mobi 바이크
REBORN_SERVICE_UUID = "00010203-0405-0607-0809-0a0b0c0d1910"  # Reborn 바이크
TACX_SERVICE_UUID = "6e40fec1-b5a3-f393-e0a9-e50e24dcca9e"  # 탁스 바이크

FTMS_FEATURE_CHAR_UUID = "00002acc-0000-1000-8000-00805f9b34fb"
FTMS_CONTROL_POINT_CHAR_UUID = "00002ad9-0000-1000-8000-00805f9b34fb"
FTMS_STATUS_CHAR_UUID = "00002ada-0000-1000-8000-00805f9b34fb"
FTMS_INDOOR_BIKE_DATA_CHAR_UUID = "00002ad2-0000-1000-8000-00805f9b34fb"

# Support range characteristic UUIDs
FTMS_SPEED_RANGE_CHAR_UUID = "00002ad4-0000-1000-8000-00805f9b34fb"
FTMS_INCLINE_RANGE_CHAR_UUID = "00002ad5-0000-1000-8000-00805f9b34fb"
FTMS_RESISTANCE_RANGE_CHAR_UUID = "00002ad6-0000-1000-8000-00805f9b34fb"
FTMS_POWER_RANGE_CHAR_UUID = "00002ad8-0000-1000-8000-00805f9b34fb"

# FTMS Control Point Commands
REQUEST_CONTROL = bytearray([0x00])
RESET = bytearray([0x01])
START = bytearray([0x07])
STOP = bytearray([0x08])
GET_SPEED_RANGE = bytearray([0x10])
GET_INCLINE_RANGE = bytearray([0x11])
GET_RESISTANCE_RANGE = bytearray([0x12])
GET_POWER_RANGE = bytearray([0x13])
# 우리가 보내는 명령 값까지 정해져있는 상태
SET_RESISTANCE_LEVEL = lambda level: bytearray([0x04, level & 0xFF])  # 0x04 08 => level이 이렇게 들어오면 => 저항값 8단계
SET_TARGET_POWER = lambda watts: bytearray([0x05, watts & 0xFF, (watts >> 8) & 0xFF])
SET_SIM_PARAMS = bytearray([
    0x11,              # Opcode
    0x00, 0x00,        # Wind Speed = 0
    0xD0, 0x07,        # Grade = 2000 (20.00%)
    0x00, 0x00,        # Rolling Resistance = 0
    0x00, 0x00         # Wind Resistance Coefficient = 0
])
