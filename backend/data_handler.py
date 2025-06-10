import logging

# 상수와 글로벌 변수들 import 
import logging

# 글로벌 변수들
test_results = {}
resistance_tracking = {}
cp_handle = None
data_handle = None
logger = logging.getLogger(__name__)
data_logger = logging.getLogger('bike_data')

# 패킷 머지를 위한 글로벌 변수들
packet_buffer = {
    'data': None,
    'flags': None,
    'detected_fields': {}
}

def can_merge_packets(flags1, flags2):
    """
    두 패킷이 머지 가능한지 확인
    - flags가 겹치지 않아야 함 (비트 AND 연산 결과가 0)
    """
    if flags1 is None or flags2 is None:
        return False
    
    # 플래그가 겹치는지 확인 (비트 AND가 0이면 겹치지 않음)
    flags_overlap = (flags1 & flags2) != 0
    
    data_logger.info(f"Merge check - Flags1: 0x{flags1:04x}, Flags2: 0x{flags2:04x}, Flags overlap: {flags_overlap}")
    
    return not flags_overlap

def merge_packet_data(data1, flags1, fields1, data2, flags2, fields2):
    """
    두 패킷의 데이터를 머지하여 하나의 논리적 패킷으로 만듦
    두 번째 패킷의 데이터 부분을 첫 번째 패킷 뒤에 붙임
    """
    # 머지된 플래그 생성
    merged_flags = flags1 | flags2
    
    # 첫 번째 패킷의 플래그를 머지된 플래그로 업데이트
    merged_data = bytearray(data1)
    merged_data[0:2] = merged_flags.to_bytes(2, byteorder='little')
    
    # 두 번째 패킷의 데이터 부분(플래그 제외)을 뒤에 붙임
    if len(data2) > 2:
        merged_data.extend(data2[2:])
    
    data_logger.info(f"Merging packets - Original flags: 0x{flags1:04x} + 0x{flags2:04x} = 0x{merged_flags:04x}")
    data_logger.info(f"Original packet1: {data1.hex()}")
    data_logger.info(f"Original packet2: {data2.hex()}")
    data_logger.info(f"Merged packet: {merged_data.hex()}")
    
    return bytes(merged_data), merged_flags

def process_indoor_bike_data(data, flags):
    """
    Indoor Bike Data 패킷을 파싱하여 검출된 필드들을 반환
    """
    index = 2
    detected_fields = {}
    
    data_logger.info("------------ Bike Info ------------")
    data_logger.info("raw data: " + data.hex())
    data_logger.info(f"Data length: {len(data)}, Current index: {index}, Remaining bytes: {data[index:].hex() if index < len(data) else 'None'}")
    
    #More Data 0x01 => bit 0 == 0 일때 Instant Speed 존재
    if (flags & 0x01) == 0:
        if index + 2 <= len(data):
            speed = int.from_bytes(data[index:index+2], byteorder='little') / 100
            data_logger.info(f"Instantaneous Speed: {speed:.2f} km/h")
            detected_fields['speed'] = speed
            index += 2

    # Average Speed (bit 1 == 1일 때 필드 존재)
    if flags & 0x02:
        if index + 2 <= len(data):
            avg_speed = int.from_bytes(data[index:index+2], byteorder='little') / 100
            data_logger.info(f"Average Speed: {avg_speed:.2f} km/h")
            detected_fields['avg_speed'] = avg_speed
            index += 2

    # Instantaneous Cadence (bit 2 == 1일 때 필드 존재)
    if flags & 0x04:
        if index + 2 <= len(data):
            cadence = int.from_bytes(data[index:index+2], byteorder='little') / 2
            data_logger.info(f"Instantaneous Cadence: {cadence:.1f} rpm")
            detected_fields['cadence'] = cadence
            index += 2            
    
    # Average Cadence (bit 3 == 1일 때 필드 존재)
    if flags & 0x08:
        if index + 2 <= len(data):
            avg_cadence = int.from_bytes(data[index:index+2], byteorder='little') / 2
            data_logger.info(f"Average Cadence: {avg_cadence:.1f} rpm")
            detected_fields['avg_cadence'] = avg_cadence
            index += 2

    # Total Distance (bit 4 == 1일 때 필드 존재)
    if flags & 0x10:
        if index + 3 <= len(data):
            total_distance = int.from_bytes(data[index:index+3], byteorder='little') / 10
            data_logger.info(f"Total Distance: {total_distance:.1f} m")
            detected_fields['distance'] = total_distance
            index += 3            
    
    # Resistance Level (bit 5 == 1일 때)
    if flags & 0x20:
        if index + 2 <= len(data):
            resistance = int.from_bytes(data[index:index+2], byteorder='little', signed=True)
            data_logger.info(f"Resistance Level: {resistance}")
            detected_fields['resistance'] = resistance
            # 저항 레벨 변화 추적
            if resistance_tracking['last_resistance'] is not None:
                if resistance != resistance_tracking['last_resistance']:
                    resistance_tracking['resistance_change_detected'] = True
                    data_logger.info(f"Resistance changed: {resistance_tracking['last_resistance']} -> {resistance}")
                    
                    # 저항 관련 명령어가 있었는지 확인
                    if resistance_tracking.get('resistance_command_pending', False):
                        # 저항 관련 명령어 후의 변화 - 성공으로 간주
                        command_type = resistance_tracking.get('last_command_type', 'Unknown')
                        data_logger.info(f"✅ Resistance change detected after resistance-related command - SUCCESS")
                        logger.info(f"🎯 Resistance control working: {command_type} : Resistance: {resistance_tracking['last_resistance']} -> {resistance}")
                        
                        # 저항 제어 성공으로 설정
                        if 'SET_RESISTANCE_LEVEL' in command_type:
                            test_results['resistance_control'] = True
                            logger.info(f"✅ SET_RESISTANCE_LEVEL confirmed - resistance control successful")
                        elif 'SET_SIM_PARAMS' in command_type:
                            test_results['sim_mode_support'] = True
                            logger.info(f"✅ SET_SIM_PARAMS confirmed - simulation mode successful")
                        
                        # 플래그 리셋
                        resistance_tracking['resistance_command_pending'] = False
                        resistance_tracking['last_command_type'] = None
                        
                    else:
                        # 명령어 없이 저항 변화 - 경고
                        data_logger.info("⚠️ WARNING: Resistance changed without any resistance-related command!")
                        logger.warning(f"⚠️ Unexpected resistance change: {resistance_tracking['last_resistance']} -> {resistance}")
            
            resistance_tracking['last_resistance'] = resistance
            index += 2

    # Instantaneous Power (bit 6 == 1일 때)
    if flags & 0x40:
        if index + 2 <= len(data):
            power = int.from_bytes(data[index:index+2], byteorder='little', signed=True)
            data_logger.info(f"Instantaneous Power: {power} W")
            detected_fields['power'] = power
            index += 2

    # Average Power (bit 7 == 1일 때)
    if flags & 0x80:
        if index + 2 <= len(data):
            avg_power = int.from_bytes(data[index:index+2], byteorder='little', signed=True)
            data_logger.info(f"Average Power: {avg_power} W")
            detected_fields['avg_power'] = avg_power
            index += 2

    # 추가 필드들도 계속 처리...
    if flags & 0x100:
        if index + 2 <= len(data):
            expended_energy = int.from_bytes(data[index:index+2], byteorder='little')
            data_logger.info(f"Expended Energy: {expended_energy} kJ")
            detected_fields['energy'] = expended_energy
            index += 2

    if flags & 0x200:
        if index + 1 <= len(data):
            heart_rate = data[index]
            data_logger.info(f"Heart Rate: {heart_rate} bpm")
            detected_fields['heart_rate'] = heart_rate
            index += 1

    if flags & 0x400:
        if index + 2 <= len(data):
            met = int.from_bytes(data[index:index+2], byteorder='little') / 100
            data_logger.info(f"Metabolic Equivalent: {met:.2f} METs")
            detected_fields['met'] = met
            index += 2

    if flags & 0x800:
        if index + 2 <= len(data):
            elapsed_time = int.from_bytes(data[index:index+2], byteorder='little')
            data_logger.info(f"Elapsed Time: {elapsed_time} s")
            detected_fields['elapsed_time'] = elapsed_time
            index += 2

    if flags & 0x1000:
        if index + 2 <= len(data):
            remaining_time = int.from_bytes(data[index:index+2], byteorder='little')
            data_logger.info(f"Remaining Time: {remaining_time} s")
            detected_fields['remaining_time'] = remaining_time
            index += 2
    
    return detected_fields

#이제 구독 후 핸들 , sender data 파라미터
def notification_handler(sender, data):
    """Handle incoming notifications from the device."""
    global test_results, resistance_tracking, packet_buffer
    try:
        # 이 부분이 control point 명령의 답장을 받아보는곳
        if sender.handle == cp_handle:
            if len(data) >= 3:
                response_code = data[0]  # 0x80
                request_opcode = data[1]  # 원래 명령 코드
                result_code = data[2]     # 성공/실패
                
                # 제어 명령 테스트 결과 저장
                command_name = {
                    0x00: "REQUEST_CONTROL",
                    0x01: "RESET", 
                    0x04: "SET_RESISTANCE_LEVEL",
                    0x05: "SET_TARGET_POWER",
                    0x07: "START",
                    0x08: "STOP",
                    0x11: "SET_SIM_PARAMS"
                }.get(request_opcode, f"UNKNOWN_0x{request_opcode:02x}")
                  # 제어 응답을 로그에 기록
                data_logger.info(f"Control Response: {data.hex()} - Command: {command_name}, Result: {'SUCCESS' if result_code == 0x01 else 'FAILED'}")
                test_results['control_commands_tested'][command_name] = (result_code == 0x01)
                
                if result_code == 0x01:  # Success
                    logger.info(f"✅ Control point operation successful for opcode: 0x{request_opcode:02x}")                      # 저항 관련 명령어 성공 시 플래그 설정
                    if request_opcode in [0x04, 0x05, 0x11]:  # SET_RESISTANCE_LEVEL, SET_TARGET_POWER, SET_SIM_PARAMS
                        resistance_tracking['resistance_command_pending'] = True
                        resistance_tracking['last_command_type'] = command_name
                        data_logger.info(f"🎯 Resistance-related command successful: {command_name}")
                          # 저항 관련 명령어는 실제 저항 변화를 기다림 - 즉시 success로 설정하지 않음
                        if request_opcode == 0x04:  # SET_RESISTANCE_LEVEL
                            logger.info(f"🔧 Resistance level command accepted - waiting for actual resistance change")
                        elif request_opcode == 0x05:  # SET_TARGET_POWER
                            # SET_TARGET_POWER도 실제 저항 변화를 확인
                            logger.info(f"🔧 Target power command accepted - waiting for actual resistance change")
                        elif request_opcode == 0x11:  # SET_SIM_PARAMS
                            logger.info(f"🔧 Simulation parameters command accepted - waiting for actual resistance change")
                    else:
                        # 저항 관련이 아닌 명령어는 기존 방식대로 즉시 처리
                        logger.info(f"🔧 Control command processed successfully")
                        
                else:
                    logger.warning(f"❌ Control point operation failed - Opcode: 0x{request_opcode:02x}, Result: 0x{result_code:02x}")          # 여기가 이제 bike data - 패킷 머지 로직 적용
        elif sender.handle == data_handle:
            flags = int.from_bytes(data[0:2], byteorder='little')
            data_logger.info(f"\n\nBike Data Flags: {flags:04x}\n")
            
            # 현재 패킷 처리
            current_fields = process_indoor_bike_data(data, flags)
            
            # 패킷 머지 로직
            should_merge = False
            merged_fields = current_fields
            
            if packet_buffer['data'] is not None:
                # 이전 패킷이 존재하면 머지 가능한지 확인
                if can_merge_packets(packet_buffer['flags'], flags):
                    data_logger.info("🔗 Merging packets due to non-overlapping flags")
                    #logger.info("🔗 Merging two indoor bike data packets into one logical packet")
                    
                    merged_data, merged_flags = merge_packet_data(
                        packet_buffer['data'], packet_buffer['flags'], packet_buffer['detected_fields'],
                        data, flags, current_fields
                    )
                    
                    # 머지된 패킷을 다시 파싱
                    merged_fields = process_indoor_bike_data(merged_data, merged_flags)
                    should_merge = True
                else:
                    # 머지할 수 없으면 이전 패킷을 먼저 처리
                    data_logger.info("Cannot merge packets - processing previous packet first")
                    finalize_packet_processing(packet_buffer['detected_fields'])
            
            if should_merge:
                # 머지된 패킷 처리
                data_logger.info("📦 Processing merged logical packet")
                data_logger.info(f"Merged packet contains {len(merged_fields)} fields: {list(merged_fields.keys())}")
                finalize_packet_processing(merged_fields)
                
                # 버퍼 클리어
                packet_buffer['data'] = None
                packet_buffer['flags'] = None
                packet_buffer['detected_fields'] = {}
            else:
                # 현재 패킷을 버퍼에 저장 (다음 패킷과 머지 가능한지 확인하기 위해)
                packet_buffer['data'] = data
                packet_buffer['flags'] = flags
                packet_buffer['detected_fields'] = current_fields
                
                data_logger.info("📦 Packet buffered for potential merging")

    except Exception as e:
        logger.error(f"Error processing notification: {e}")
        test_results['issues_found'].append(f"Notification processing error: {e}")

def finalize_packet_processing(detected_fields):
    """
    최종 패킷 처리 - 머지되었든 단일 패킷이든 동일하게 처리
    """
    global test_results
    
    # 테스트 결과에 검출된 필드들 업데이트
    test_results['data_fields_detected'].update(detected_fields)
    
    # # 데이터 필드 검증: 중요한 필드들이 모두 0인 경우 경고
    # important_fields = ['speed', 'cadence', 'power']
    # zero_count = 0
    # total_important_fields = 0
    
    # for field in important_fields:
    #     if field in detected_fields:
    #         total_important_fields += 1
    #         if detected_fields[field] == 0.0 or detected_fields[field] == 0:
    #             zero_count += 1
    
    # # resistance를 제외한 모든 중요 필드가 0인 경우
    # if total_important_fields > 0 and zero_count == total_important_fields:
    #     warning_msg = "검출된 중요 데이터 필드(속도, 캐던스, 파워)가 모두 0입니다. 페달을 제때 돌리셨나요?"
    #     if warning_msg not in test_results.get('reasons', []):
    #         test_results.setdefault('reasons', []).append(warning_msg)
    #         logger.warning(f"⚠️ {warning_msg}")
    
    data_logger.info("------------------------------------\n")

def cleanup_packet_buffer():
    """
    연결 종료 시 버퍼된 패킷이 있으면 마지막으로 처리
    """
    global packet_buffer
    
    if packet_buffer['data'] is not None:
        data_logger.info("🧹 Processing final buffered packet during cleanup")
        logger.info("🧹 Cleaning up: processing final buffered packet")
        finalize_packet_processing(packet_buffer['detected_fields'])
        
        # 버퍼 클리어
        packet_buffer['data'] = None
        packet_buffer['flags'] = None
        packet_buffer['detected_fields'] = {}