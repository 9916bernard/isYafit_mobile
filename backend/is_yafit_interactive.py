#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# WebSocket을 통한 상호작용이 가능한 버전의 is_yafit.py

import asyncio
import sys
import logging
import time
import json
import threading
import io
import os
from typing import List
from datetime import datetime
import queue

# UTF-8 인코딩 설정
sys.stdout = io.TextIOWrapper(sys.stdout.detach(), encoding = 'utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.detach(), encoding = 'utf-8')

# 공통 상수들 import
from constants import *

# 분리된 모듈들 import
from scanner import scan_for_ftms_devices, device_protocols
from device_test import connect_and_test_device
from data_handler import notification_handler

# 분리된 모듈들과 글로벌 변수 공유
import scanner
import device_test  
import data_handler

# ───────────────────────────────────────────────────────────────────
# ① 초기화: yafit_interactive 의 전역 test_results 객체 선언
# ───────────────────────────────────────────────────────────────────
test_results = {
    'device_info': {},
    'connection_status': False,
    'protocol_type': '',
    'features_supported': {},
    'data_fields_detected': {},
    'control_commands_tested': {},
    'support_ranges': {},      # 서포트 범위 정보 저장
    'control_tests': {},       # 컨트롤 포인트 테스트 결과 저장
    'sim_mode_support': False,
    'resistance_control': False,
    'power_control': False,
    'compatibility_level': '',
    'issues_found': [],
    'reasons': []
}

# 디바이스 프로토콜 정보를 저장할 글로벌 딕셔너리
device_protocols = scanner.device_protocols

# 저항 레벨 변화 추적을 위한 변수들
resistance_tracking = {
    'last_resistance': None,
    'expected_resistance': None,
    'resistance_change_detected': False,
    'command_sent_time': None,
    'last_command_type': None,
    'resistance_command_pending': False
}

# ───────────────────────────────────────────────────────────────────
# ② device_test 모듈 쪽에 test_results, logger, data_logger, resistance_tracking를 할당
# ───────────────────────────────────────────────────────────────────
device_test.test_results = test_results
device_test.logger = logging.getLogger(__name__)
device_test.data_logger = logging.getLogger('bike_data')
device_test.resistance_tracking = resistance_tracking

data_handler.test_results = test_results
data_handler.resistance_tracking = resistance_tracking
data_handler.logger = logging.getLogger(__name__)
data_handler.data_logger = logging.getLogger('bike_data')

# device_test.py에서 사용할 wait_for_user_input 함수 공유 (이미 선언된 함수 덮어쓰기)
async def shared_wait_for_user_input(message: str, input_type: str = 'continue', devices = None):
    return await wait_for_user_input(message, input_type, devices)

# device_test 모듈에 wait_for_user_input 함수 공유
device_test.wait_for_user_input = shared_wait_for_user_input

# ───────────────────────────────────────────────────────────────────
# 로그 설정
# ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 상세 데이터 로거 (파일용 - bike info 등 상세 데이터)
data_logger = logging.getLogger('bike_data')
data_logger.setLevel(logging.INFO)

# logs 디렉토리 생성
logs_dir = os.path.join("results", "logs")
os.makedirs(logs_dir, exist_ok=True)

# 임시 로그 파일 핸들러 생성
temp_log_filename = os.path.join(logs_dir, f"temp_bike_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log")
file_handler = logging.FileHandler(temp_log_filename, encoding='utf-8')
file_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
file_handler.setFormatter(file_formatter)

# 데이터 로거에는 파일 핸들러만 추가
data_logger.addHandler(file_handler)
data_logger.propagate = False

# 현재 로그 파일명 추적 변수
current_log_filename = temp_log_filename

# 사용자 입력 관련 자료구조
pending_user_input = None
user_input_event = asyncio.Event()
user_input_result = None
input_queue = queue.Queue()

def request_user_input(message: str, input_type: str = 'continue', devices: List = None):
    """
    프론트엔드에 사용자 입력을 요청하는 함수
    """
    global pending_user_input
    
    input_data = {
        'type': 'USER_INPUT_REQUEST',
        'request_type': input_type,
        'message': message
    }
    
    if devices:
        input_data['devices'] = [{'name': d.name, 'address': d.address} for d in devices]
    
    # JSON 형태로 출력하여 프론트엔드에서 파싱할 수 있게 함
    print(json.dumps(input_data), flush=True)
    pending_user_input = input_data
    
def receive_user_input(input_value: str):
    """
    프론트엔드로부터 사용자 입력을 받는 함수
    """
    global user_input_result, user_input_event, pending_user_input
    
    user_input_result = input_value
    pending_user_input = None
    user_input_event.set()

async def wait_for_user_input(message: str, input_type: str = 'continue', devices: List = None):
    """사용자 입력 대기 (WebSocket 통신용)"""
    global user_input_event, user_input_result
    
    # 이벤트 리셋
    user_input_event.clear()
    user_input_result = None
    
    # 프론트엔드에 입력 요청
    request_user_input(message, input_type, devices)
    
    # 입력이 올 때까지 대기
    await user_input_event.wait()
    
    # 취소 처리
    if user_input_result == 'CANCEL':
        print("⚠️ 사용자가 테스트를 취소했습니다.")
        raise KeyboardInterrupt("User cancelled the test")
    
    return user_input_result

async def send_control_command(client, command_data, command_name, expected_resistance=None):
    """제어 명령을 보내고 로그에 기록하는 헬퍼 함수"""
    global resistance_tracking
    
    data_logger.info(f"Sending {command_name}: {command_data.hex()}")
    
    # 저항 레벨 관련 명령의 경우 예상값 설정
    if expected_resistance is not None:
        resistance_tracking['expected_resistance'] = expected_resistance
        resistance_tracking['command_sent_time'] = time.time()
        resistance_tracking['last_command_type'] = command_name
    
    await client.write_gatt_char(FTMS_CONTROL_POINT_CHAR_UUID, command_data)



def stdin_reader():
    """백그라운드에서 stdin을 읽는 스레드"""
    try:
        while True:
            line = sys.stdin.readline()
            if line == "":
                break                                   # EOF
            stripped = line.rstrip("\n")               # 빈 줄도 허용
            input_queue.put(stripped)
    except Exception as e:
        print(f"DEBUG: stdin_reader exception: {e}", file=sys.stderr)

stdin_thread = threading.Thread(target=stdin_reader, daemon=True)
stdin_thread.start()

async def check_stdin_input():
    """stdin에서 입력이 있는지 주기적으로 확인"""
    while True:
        try:
            if not input_queue.empty():
                user_input = input_queue.get_nowait()
                receive_user_input(user_input)
        except queue.Empty:
            pass
        except Exception as e:
            print(f"DEBUG: Error in check_stdin_input: {e}", file=sys.stderr)
        await asyncio.sleep(0.1)

async def main():
    """메인 함수"""
    print("[YAFIT] 호환성 테스트 프로그램")
    print("이 프로그램은 사이클 기기와 YAFIT 앱의 호환성을 테스트합니다.")
    print("테스트 중에는 지시에 따라 페달을 돌리거나 정지해 주세요.")

    print(f"\n📁 상세 데이터 로그 파일: {current_log_filename}")
    print("   (bike info와 같은 상세 데이터는 로그 파일에 기록됩니다)")
    
    try:
        # 기기 스캔
        print("\n🔍 블루투스 기기를 스캔합니다...")
        devices = await scan_for_ftms_devices(15)
       
        if not devices:
            print("❌ 호환 가능한 기기를 찾을 수 없습니다.")
            print("사이클 기기의 전원이 켜져 있고 블루투스가 활성화되어 있는지 확인하세요.")
            return
       
        # 기기 선택
       
        print(f"\n📱 {len(devices)}개의 호환 기기가 발견되었습니다:")
        for i, device in enumerate(devices):
            print(f"  {i+1}. {device.name or 'Unknown'} ({device.address})")
        while True:
                try:
                    selection_str = await wait_for_user_input(
                        "연결할 기기 번호를 선택하세요:",
                        'device_selection',
                        devices
                    )
                    selection = int(selection_str) - 1
                    if 0 <= selection < len(devices):
                        selected_device = devices[selection]
                        break
                    else:
                        print("❌ 잘못된 번호입니다. 다시 입력하세요.")                
                except ValueError:
                    print("❌ 숫자를 입력하세요.")
         # 선택된 기기 테스트
        print(f"\n🔗 {selected_device.name}에 연결 중...")
        await connect_and_test_device(selected_device)
        
        # 보고서 생성
        print("\n📊 테스트 결과를 분석 중...")
        from report_generate import generate_report  # Import here to avoid circular import
        generate_report(test_results, current_log_filename)
        
    except KeyboardInterrupt:
        print("\n⚠️ 사용자가 테스트를 중단했습니다.")
    except Exception as e:
        print(f"❌ 테스트 중 오류가 발생했습니다: {e}")
        logger.error(f"Error running FTMS test: {e}")

# 명령줄 인자를 통한 사용자 입력 처리
def handle_stdin():
    """표준 입력으로부터 사용자 입력을 받아 처리"""
    try:
        while True:
            line = input().strip()
            if line.startswith('USER_INPUT:'):
                input_value = line[11:]  # 'USER_INPUT:' 제거
                receive_user_input(input_value)
            elif line == 'EXIT':
                break
    except EOFError:
        pass

if __name__ == "__main__":
    async def main_with_stdin():
        # stdin 체크 태스크를 백그라운드에서 실행
        stdin_task = asyncio.create_task(check_stdin_input())
        
        try:
            # 메인 프로그램 실행
            await main()
        finally:
            stdin_task.cancel()
    
    # 프로그램 실행
    asyncio.run(main_with_stdin())
