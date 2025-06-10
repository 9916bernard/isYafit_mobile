import asyncio
import logging
from typing import List
from bleak import BleakScanner
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData

# 상수들 import
from constants import (
    FTMS_SERVICE_UUID, CSC_SERVICE_UUID, MOBI_SERVICE_UUID, 
    REBORN_SERVICE_UUID, TACX_SERVICE_UUID
)

# 로거 설정
logger = logging.getLogger(__name__)

# 글로벌 변수
device_protocols = {}

#스캔
async def scan_for_ftms_devices(timeout: int = 15) -> List[BLEDevice]:
    """
    Scan for FTMS devices.
   
    Args:
        timeout: Scan timeout in seconds
       
    Returns:
        List of discovered FTMS devices
    """
    logger.info(f"Scanning for FTMS devices for {timeout} seconds...")
   
    ftms_devices = []
     #수정 : 아래의 프로토콜들은 accept
    #     1. FTMS (표준 프로토콜 사용)
    #    - Fitness Machine (UUID : 00001826-0000-1000-8000-00805f9b34fb)
    # 2. 센서 (표준 프로토콜 사용)
    #    -  Cycling Speed and Cadence (UUID : 00001816-0000-1000-8000-00805f9b34fb)
    # 3. 커스텀 방식 (전용 프로토콜 사용)
    #    - mobi 바이크 (UUID : 0000ffe0-0000-1000-8000-00805f9b34fb , 전용 프로토콜 사용)
    #    - Reborn 바이크 (UUID : 00010203-0405-0607-0809-0a0b0c0d1910 , 전용 프로토콜 사용)
    #    - 탁스 바이크 (UUID : 6e40fec1-b5a3-f393-e0a9-e50e24dcca9e , 전용 프로토콜 사용)    # selected device 가 위의 프로토콜중 하나면 report 에 연동 부분 OK 로 적기
    
    supported_services = [FTMS_SERVICE_UUID, CSC_SERVICE_UUID, MOBI_SERVICE_UUID, REBORN_SERVICE_UUID, TACX_SERVICE_UUID]
    
    def detection_callback(device: BLEDevice, advertisement_data: AdvertisementData):
        device_services = [str(uuid).lower() for uuid in advertisement_data.service_uuids]
        
        # 지원되는 서비스가 있는지 확인
        has_supported_service = any(service_uuid.lower() in device_services for service_uuid in supported_services)
        
        if has_supported_service and device not in ftms_devices:
            ftms_devices.append(device)
            
            # 프로토콜 타입 식별 (FTMS 우선순위로 확인)
            if FTMS_SERVICE_UUID.lower() in device_services:
                protocol_type = "FTMS (표준)"
            elif MOBI_SERVICE_UUID.lower() in device_services:
                protocol_type = "MOBI (커스텀)"
            elif REBORN_SERVICE_UUID.lower() in device_services:
                protocol_type = "REBORN (커스텀)"
            elif TACX_SERVICE_UUID.lower() in device_services:
                protocol_type = "TACX (커스텀)"
            elif CSC_SERVICE_UUID.lower() in device_services:
                protocol_type = "CSC (표준)"
            else:
                protocol_type = "기타"
              # 다중 프로토콜 지원 기기 감지
            supported_protocols = []
            if FTMS_SERVICE_UUID.lower() in device_services:
                supported_protocols.append("FTMS")
            if CSC_SERVICE_UUID.lower() in device_services:
                supported_protocols.append("CSC")
            if MOBI_SERVICE_UUID.lower() in device_services:
                supported_protocols.append("MOBI")
            if REBORN_SERVICE_UUID.lower() in device_services:
                supported_protocols.append("REBORN")
            if TACX_SERVICE_UUID.lower() in device_services:
                supported_protocols.append("TACX")
            
            # protocols_str 생성 (항상 정의되도록)
            protocols_str = "+".join(supported_protocols) if len(supported_protocols) > 1 else protocol_type
            logger.info(f"Found compatible device: {device.name} ({device.address}) - {protocols_str}")
                
            # 기기에 프로토콜 정보 저장 (글로벌 딕셔너리 사용)
            device_protocols[device.address] = {
                'protocols': supported_protocols,
                'primary_protocol': protocol_type,
                'protocols_str': protocols_str
            }
   
    scanner = BleakScanner(detection_callback=detection_callback)
    await scanner.start()
    await asyncio.sleep(timeout)
    await scanner.stop()
   
    return ftms_devices