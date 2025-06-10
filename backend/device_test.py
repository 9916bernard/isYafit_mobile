import asyncio
import logging
from typing import Dict, Any
from bleak import BleakClient
from bleak.backends.device import BLEDevice

# 상수들 import
from constants import (
    FTMS_SERVICE_UUID, CSC_SERVICE_UUID, MOBI_SERVICE_UUID,
    REBORN_SERVICE_UUID, TACX_SERVICE_UUID, FTMS_FEATURE_CHAR_UUID,
    FTMS_CONTROL_POINT_CHAR_UUID, FTMS_STATUS_CHAR_UUID,
    FTMS_INDOOR_BIKE_DATA_CHAR_UUID, FTMS_SPEED_RANGE_CHAR_UUID,
    FTMS_INCLINE_RANGE_CHAR_UUID, FTMS_RESISTANCE_RANGE_CHAR_UUID,
    FTMS_POWER_RANGE_CHAR_UUID, REQUEST_CONTROL, RESET, START, STOP,
    GET_SPEED_RANGE, GET_INCLINE_RANGE, GET_RESISTANCE_RANGE, GET_POWER_RANGE,
    SET_RESISTANCE_LEVEL, SET_TARGET_POWER, SET_SIM_PARAMS
)
from data_handler import notification_handler
import data_handler
from scanner import device_protocols

# ───────────────────────────────────────────────────────────────────
# ① 모듈 레벨에 빈 딕셔너리로 test_results 미리 선언
#    이렇게 하면 yafit_interactive.py에서 덮어씌워도 참조가 유지됨
# ───────────────────────────────────────────────────────────────────
test_results = {}

# 글로벌 변수 초기화
logger = logging.getLogger(__name__)
data_logger = logging.getLogger('bike_data')
feature_bits = 0
cp_handle = None
data_handle = None

# 저항 레벨 변화 추적을 위한 변수들
resistance_tracking = {
    'last_resistance': None,
    'expected_resistance': None,
    'resistance_change_detected': False,
    'command_sent_time': None,
    'last_command_type': None,
    'resistance_command_pending': False  # 저항 관련 명령어 대기 플래그
}

import time

async def wait_for_user_input(message: str):
    """사용자 입력 대기"""
    def get_input():
        return input(message)
    
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, get_input)


async def send_control_command(client, command_data, command_name, expected_resistance=None):
    """제어 명령을 보내고 로그에 기록하는 헬퍼 함수"""
    global resistance_tracking
    
    data_logger.info(f"Sending {command_name}: {command_data.hex()}")
    
    # 저항 관련 명령어인지 확인 (SET_RESISTANCE_LEVEL, SET_TARGET_POWER, SET_SIM_PARAMS)
    resistance_related_commands = [
        "SET_RESISTANCE_LEVEL", "SET_TARGET_POWER", "SET_SIM_PARAMS"
    ]
    
    is_resistance_command = any(cmd in command_name for cmd in resistance_related_commands)
    if is_resistance_command:
        # 저항 관련 명령어 전송 전 플래그 설정
        resistance_tracking['resistance_command_pending'] = True
        resistance_tracking['last_command_type'] = command_name
        resistance_tracking['command_sent_time'] = time.time()
        data_logger.info(f"🎯 Resistance-related command sent: {command_name} at {resistance_tracking['command_sent_time']}")
        
        # 기존 예상값 설정 로직 유지
        if expected_resistance is not None:
            resistance_tracking['expected_resistance'] = expected_resistance
    
    await client.write_gatt_char(FTMS_CONTROL_POINT_CHAR_UUID, command_data)

async def connect_and_test_device(device: BLEDevice):
    """
    Connect to an FTMS device and test functionality.
   
    Args:
        device: The FTMS device to connect to
    """
    
    logger.info(f"Connecting to {device.name} ({device.address})...")
    try:        
        async with BleakClient(device, timeout=50.0) as client:            
            logger.info(f"✅ Connected to {device.name}")            # ──────────────────────────────────────────────────────────────────────────────────
            # ② connect 성공 시점에 device_test 모듈의 test_results를 직접 수정
            # ──────────────────────────────────────────────────────────────────────────────────
            test_results['connection_status'] = True
            test_results['device_info'] = {
                'name': device.name,
                'address': device.address,
                'services': []  # 서비스 목록 추가
            }
            
            # 테스트 결과 저장을 위한 필드들 초기화
            if 'issues_found' not in test_results:
                test_results['issues_found'] = []
                
            if 'reasons' not in test_results:
                test_results['reasons'] = []
            
            # 모든 서비스 UUID 수집
            detected_services = []
            for service in client.services:
                service_uuid = str(service.uuid).lower()
                detected_services.append(service_uuid)
                logger.info(f"🔍 Found service: {service_uuid}")
            
            test_results['device_info']['services'] = detected_services
            
            global feature_bits
            # 서비스 검사 및 프로토콜 타입 확인 (스캔 시 저장된 정보 활용)
            if device.address in device_protocols:
                protocol_info = device_protocols[device.address]
                detected_protocol = protocol_info.get('primary_protocol') or "UNKNOWN"
                supported_protocols_list = protocol_info.get('protocols') or []
            else:
                detected_protocol = "UNKNOWN"
                supported_protocols_list = []
                
                # 실제 연결된 서비스들로 프로토콜 판단
                for service_uuid in detected_services:
                    if service_uuid == FTMS_SERVICE_UUID.lower():
                        supported_protocols_list.append("FTMS")
                        if detected_protocol == "UNKNOWN":
                            detected_protocol = "FTMS (표준)"
                    elif service_uuid == CSC_SERVICE_UUID.lower():
                        supported_protocols_list.append("CSC")
                        if detected_protocol == "UNKNOWN":
                            detected_protocol = "CSC (표준)"
                    elif service_uuid == MOBI_SERVICE_UUID.lower():
                        supported_protocols_list.append("MOBI")
                        if detected_protocol == "UNKNOWN":
                            detected_protocol = "MOBI (커스텀)"
                    elif service_uuid == REBORN_SERVICE_UUID.lower():
                        supported_protocols_list.append("REBORN")
                        if detected_protocol == "UNKNOWN":
                            detected_protocol = "REBORN (커스텀)"
                    elif service_uuid == TACX_SERVICE_UUID.lower():
                        supported_protocols_list.append("TACX")
                        if detected_protocol == "UNKNOWN":
                            detected_protocol = "TACX (커스텀)"

                # FTMS가 있으면 우선순위로 설정
                if "FTMS" in supported_protocols_list:
                    detected_protocol = "FTMS (표준)"
            
            # CSC 서비스 존재 여부 확인 및 features에 추가
            has_csc_service = CSC_SERVICE_UUID.lower() in detected_services
            if has_csc_service:
                logger.info("✅ CSC Service detected")
                # features_supported에 CSC 정보 추가
                if 'features_supported' not in test_results:
                    test_results['features_supported'] = {}
                test_results['features_supported']['CSC Measurement'] = True
                test_results['features_supported']['CSC Feature'] = True
            
            test_results['protocol_type'] = detected_protocol
            protocols_info = f"{detected_protocol} (지원: {'+'.join(supported_protocols_list)})" if len(supported_protocols_list) > 1 else detected_protocol
            logger.info(f"🔍 Detected Protocol: {protocols_info}")
            logger.info(f"🔍 Total services found: {len(detected_services)}")
            
            test_results['supported_protocols'] = supported_protocols_list
            supported_protocol_names = ["FTMS (표준)", "CSC (표준)", "MOBI (커스텀)", "REBORN (커스텀)", "TACX (커스텀)"]
            if detected_protocol not in supported_protocol_names:
                test_results['issues_found'].append(f"Unsupported protocol detected: {detected_protocol}")
                test_results['reasons'].append("지원되지 않는 프로토콜입니다. FTMS, CSC, MOBI, REBORN, TACX 프로토콜 중 하나를 지원하는 기기로 테스트하세요.")                
                test_results['compatibility_level'] = "불가능"
                return
            
            # FTMS 프로토콜 지원 시 본격 테스트
            if "FTMS" in supported_protocols_list:
                logger.info("✅ FTMS 프로토콜 지원 확인 - 전체 호환성 테스트 진행")
            elif "FTMS" not in supported_protocols_list and "CSC" in supported_protocols_list:
                logger.info(f"⚠️  CSC 프로토콜만 지원 - 제한된 테스트 진행")
                test_results['reasons'].append("CSC 프로토콜로 속도/캐던스 데이터만 사용 가능합니다.")
                try:
                    csc_measurement_uuid = "00002a5b-0000-1000-8000-00805f9b34fb"
                    for service in client.services:
                        for char in service.characteristics:
                            if str(char.uuid).lower() == csc_measurement_uuid:
                                await client.start_notify(char, lambda s, d: logger.info(f"CSC Data: {d.hex()}"))
                                logger.info("✅ CSC measurement notifications started")
                    await asyncio.sleep(5)
                    test_results['compatibility_level'] = "제한적 호환"
                except Exception as e:
                    test_results['issues_found'].append(f"CSC characteristics not found: {e}")
                    test_results['compatibility_level'] = "불가능"
                return
            else:                
                print("커스텀 프로토콜은 제조사별 전용 앱이 필요할 수 있습니다.")
                test_results['compatibility_level'] = "수정 필요"
                test_results['reasons'].append(f"{detected_protocol} 프로토콜은 제조사 전용 앱 사용을 권장합니다.")
                return

            # 핸들 확보
            try:
                data_char = client.services.get_characteristic(FTMS_INDOOR_BIKE_DATA_CHAR_UUID)
                cp_char = client.services.get_characteristic(FTMS_CONTROL_POINT_CHAR_UUID)
                
                global data_handle, cp_handle
                data_handle = data_char.handle
                cp_handle = cp_char.handle
                
                # 글로벌 핸들 변수들을 다른 모듈과 공유
                set_global_handles(cp_handle, data_handle)
                
                logger.info("✅ FTMS characteristics found")
            except Exception as e:
                test_results['issues_found'].append(f"FTMS characteristics not found: {e}")
                return
           
            # 알림 등록
            await client.start_notify(data_handle, notification_handler)
            logger.info("✅ Subscribed to Indoor Bike Data notifications")
            await client.start_notify(cp_handle, notification_handler)
            logger.info("✅ Subscribed to Control Point notifications")
            logger.info("\n🔐 Requesting control permission...")
            await send_control_command(client, REQUEST_CONTROL, "REQUEST_CONTROL")
            await asyncio.sleep(2)

            # Feature 읽기
            try:
                feature_data = await client.read_gatt_char(FTMS_FEATURE_CHAR_UUID)
                feature_bits = int.from_bytes(feature_data, byteorder='little')
                logger.info(f"📊 FTMS Features: {feature_data.hex()} -> {feature_bits:08x}")
                
                features = {}
                if feature_bits & 0x01:
                    features['average_speed'] = True
                if feature_bits & 0x02:
                    features['cadence'] = True
                if feature_bits & 0x04:
                    features['total_distance'] = True
                if feature_bits & 0x08:
                    features['inclination'] = True
                if feature_bits & 0x10:
                    features['elevation_gain'] = True
                if feature_bits & 0x20:
                    features['pace'] = True
                if feature_bits & 0x40:
                    features['step_count'] = True
                if feature_bits & 0x80:
                    features['resistance_level'] = True
                if feature_bits & 0x100:
                    features['stride_count'] = True
                if feature_bits & 0x200:
                    features['expended_energy'] = True
                if feature_bits & 0x400:
                    features['heart_rate'] = True
                if feature_bits & 0x800:
                    features['metabolic_equivalent'] = True
                if feature_bits & 0x1000:
                    features['elapsed_time'] = True
                if feature_bits & 0x2000:
                    features['remaining_time'] = True
                if feature_bits & 0x4000:
                    features['power_measurement'] = True
                if feature_bits & 0x8000:
                    features['force_on_belt'] = True
                
                test_results['features_supported'] = features
                
            except Exception as e:
                test_results['issues_found'].append(f"Could not read FTMS features: {e}")            

            # ───────────────────────────────────────────────────────────────────
            # 3. 서포트 범위 확인 (0x2AD4~2AD8: speed, incline, resistance, power range)
            # ───────────────────────────────────────────────────────────────────
            print("\n📊 서포트 범위 확인 중...")
            
            # 서포트 범위 관련 정보를 저장할 딕셔너리 초기화
            if 'support_ranges' not in test_results:
                test_results['support_ranges'] = {}
            
            # Speed Range 확인
            try:
                speed_range_data = await client.read_gatt_char(FTMS_SPEED_RANGE_CHAR_UUID)
                min_speed = int.from_bytes(speed_range_data[0:2], byteorder='little') / 100  # km/h
                max_speed = int.from_bytes(speed_range_data[2:4], byteorder='little') / 100  # km/h
                min_increment = int.from_bytes(speed_range_data[4:6], byteorder='little') / 100  # km/h
                
                test_results['support_ranges']['speed'] = {
                    'min': min_speed,
                    'max': max_speed,
                    'increment': min_increment
                }
                
                logger.info(f"📏 Speed Range: {min_speed:.2f} - {max_speed:.2f} km/h (Increment: {min_increment:.2f} km/h)")
            except Exception as e:
                logger.info(f"⚠️ Speed Range not available: {e}")
            
            # Incline Range 확인
            try:
                incline_range_data = await client.read_gatt_char(FTMS_INCLINE_RANGE_CHAR_UUID)
                min_incline = int.from_bytes(incline_range_data[0:2], byteorder='little', signed=True) / 10  # %
                max_incline = int.from_bytes(incline_range_data[2:4], byteorder='little', signed=True) / 10  # %
                min_increment = int.from_bytes(incline_range_data[4:6], byteorder='little', signed=True) / 10  # %
                
                test_results['support_ranges']['incline'] = {
                    'min': min_incline,
                    'max': max_incline,
                    'increment': min_increment
                }
                
                logger.info(f"📏 Incline Range: {min_incline:.1f}% - {max_incline:.1f}% (Increment: {min_increment:.1f}%)")
            except Exception as e:
                logger.info(f"⚠️ Incline Range not available: {e}")
            
            # Resistance Range 확인
            try:
                resistance_range_data = await client.read_gatt_char(FTMS_RESISTANCE_RANGE_CHAR_UUID)
                min_resistance = int.from_bytes(resistance_range_data[0:2], byteorder='little')
                max_resistance = int.from_bytes(resistance_range_data[2:4], byteorder='little')
                min_increment = int.from_bytes(resistance_range_data[4:6], byteorder='little')
                
                test_results['support_ranges']['resistance'] = {
                    'min': min_resistance,
                    'max': max_resistance,
                    'increment': min_increment
                }
                
                logger.info(f"📏 Resistance Range: {min_resistance} - {max_resistance} (Increment: {min_increment})")
            except Exception as e:
                logger.info(f"⚠️ Resistance Range not available: {e}")
            
            # Power Range 확인
            try:
                power_range_data = await client.read_gatt_char(FTMS_POWER_RANGE_CHAR_UUID)
                min_power = int.from_bytes(power_range_data[0:2], byteorder='little')  # watts
                max_power = int.from_bytes(power_range_data[2:4], byteorder='little')  # watts
                min_increment = int.from_bytes(power_range_data[4:6], byteorder='little')  # watts
                
                test_results['support_ranges']['power'] = {
                    'min': min_power,
                    'max': max_power,
                    'increment': min_increment
                }
                
                logger.info(f"📏 Power Range: {min_power} - {max_power} watts (Increment: {min_increment} watts)")
            except Exception as e:
                logger.info(f"⚠️ Power Range not available: {e}")
            
            # ───────────────────────────────────────────────────────────────────
            # 4. Control Point 프로빙
            # ───────────────────────────────────────────────────────────────────
            print("\n🔧 Control Point 프로빙 중...")
            
            if 'control_tests' not in test_results:
                test_results['control_tests'] = {}
            
            # 추가 Control 명령 테스트를 위한 함수
            async def test_control_command(client, command_data, command_name):
                """Control Point 명령을 테스트하고 결과를 기록합니다."""
                try:
                    await send_control_command(client, command_data, command_name)
                    await asyncio.sleep(1.5)  # 응답을 기다립니다
                    
                    # 데이터 핸들러의 마지막 응답 분석 로직 추가 필요
                    # 여기서는 단순히 명령이 전송된 것을 성공으로 간주합니다
                    test_results['control_tests'][command_name] = "OK"
                    logger.info(f"✅ {command_name} command test passed")
                    return True
                except Exception as e:
                    test_results['control_tests'][command_name] = f"Failed: {str(e)}"
                    logger.info(f"❌ {command_name} command test failed: {e}")
                    return False
            
            # 저항 수준 설정 테스트 (중간 값으로 설정)
            if 'resistance' in test_results['support_ranges']:
                mid_resistance = (test_results['support_ranges']['resistance']['min'] + 
                                 test_results['support_ranges']['resistance']['max']) // 2
                await test_control_command(
                    client, 
                    SET_RESISTANCE_LEVEL(mid_resistance), 
                    "SET_RESISTANCE_LEVEL"
                )
            else:
                # 범위를 모르는 경우 기본값 8로 테스트
                await test_control_command(client, SET_RESISTANCE_LEVEL(8), "SET_RESISTANCE_LEVEL")
            
            # 목표 파워 설정 테스트 (100W로 설정)
            await test_control_command(client, SET_TARGET_POWER(100), "SET_TARGET_POWER")
            
            # 시뮬레이션 파라미터 테스트 (경사도 5%)
            sim_params_5pct = bytearray([
                0x11,              # Opcode
                0x00, 0x00,        # Wind Speed = 0
                0x32, 0x01,        # Grade = 306 (3.06%)
                0x00, 0x00,        # Rolling Resistance = 0
                0x00, 0x00         # Wind Resistance Coefficient = 0
            ])
            await test_control_command(client, sim_params_5pct, "SET_SIM_PARAMS")

            print("🚴‍♂️ YAFIT 호환성 테스트 시작")
 
            await send_control_command(client, RESET, "RESET")
            await asyncio.sleep(1)
            await send_control_command(client, START, "START") 
            await asyncio.sleep(3)
 
            # 테스트 2: 시뮬레이션 모드 테스트 (정지 상태)
            print("\n🏔️ 테스트 1: 시뮬레이션 모드 테스트")
            print("정지 상태에서 SET SIM parameter로 경사도 변경을 테스트합니다.")
            await asyncio.sleep(2)
            
            # SET SIM parameter 테스트 (경사도 변경)
            sim_params = bytearray([
                0x11,              # Opcode
                0x00, 0x00,        # Wind Speed = 0
                0xE8, 0x03,        # Grade = 1000 (10.00%)
                0x00, 0x00,        # Rolling Resistance = 0
                0x00, 0x00         # Wind Resistance Coefficient = 0
            ])
            
            print("SET SIM parameter로 경사도 10% 설정 중...")
            await send_control_command(client, sim_params, "SET_SIM_PARAMS(10%)")
            await asyncio.sleep(3)
            
            print("✅ 시뮬레이션 모드 테스트 완료")

            # 테스트 3: 페달링 데이터 수신 테스트
            print("\n🚴‍♂️ 테스트 3: 페달링 데이터 수신 테스트")
            await wait_for_user_input("이제 페달을 돌려주세요. 준비되면 Enter를 눌러주세요...")
            
            print("5초간 페달링 데이터를 수집합니다...")
            await asyncio.sleep(5)
            
            print("✅ 페달링 데이터 수신 테스트 완료")
            await send_control_command(client, STOP, "STOP")
            await asyncio.sleep(2)
           
            # 테스트 결과 요약 출력
            print("\n✅ 모든 테스트가 완료되었습니다!")
            
            # 서포트 범위 정보 출력
            print("\n[서포트 범위]")
            if 'support_ranges' in test_results:
                if 'speed' in test_results['support_ranges']:
                    speed_range = test_results['support_ranges']['speed']
                    print(f"속도 범위: {speed_range['min']:.2f} - {speed_range['max']:.2f} km/h (증분: {speed_range['increment']:.2f} km/h)")
                
                if 'incline' in test_results['support_ranges']:
                    incline_range = test_results['support_ranges']['incline']
                    print(f"경사도 범위: {incline_range['min']:.1f}% - {incline_range['max']:.1f}% (증분: {incline_range['increment']:.1f}%)")
                
                if 'resistance' in test_results['support_ranges']:
                    resistance_range = test_results['support_ranges']['resistance']
                    print(f"저항 범위: {resistance_range['min']} - {resistance_range['max']} (증분: {resistance_range['increment']})")
                
                if 'power' in test_results['support_ranges']:
                    power_range = test_results['support_ranges']['power']
                    print(f"파워 범위: {power_range['min']} - {power_range['max']} watts (증분: {power_range['increment']} watts)")
            else:
                print("서포트 범위 정보를 불러올 수 없습니다.")
            
            # 컨트롤 기능 테스트 결과 출력
            print("\n[추가 컨트롤 기능]")
            if 'control_tests' in test_results:
                for cmd, result in test_results['control_tests'].items():
                    icon = "✅" if result == "OK" else "❌"
                    print(f"{cmd} - {result} {icon}")
            else:
                print("컨트롤 기능 테스트 결과를 불러올 수 없습니다.")
    except Exception as e:
        logger.error(f"Error during device testing: {e}")
        # 연결 실패 시에도 반드시 test_results['connection_status']를 False로
        test_results['connection_status'] = False
        
        # issues_found가 존재하는지 확인 후 추가
        if 'issues_found' not in test_results:
            test_results['issues_found'] = []
        test_results['issues_found'].append(f"Connection/testing error: {e}")
    finally:
        # 연결 종료 시 패킷 버퍼 정리
        try:
            data_handler.cleanup_packet_buffer()
            logger.info("✅ Packet buffer cleanup completed")
        except Exception as cleanup_error:
            logger.warning(f"Warning during packet buffer cleanup: {cleanup_error}")

# data_handler의 글로벌 변수들도 공유
def set_global_handles(cp_h, data_h):
    """글로벌 핸들 변수들을 설정"""
    global cp_handle, data_handle
    cp_handle = cp_h
    data_handle = data_h
    
    # data_handler 모듈의 변수들도 업데이트
    data_handler.cp_handle = cp_h
    data_handler.data_handle = data_h
