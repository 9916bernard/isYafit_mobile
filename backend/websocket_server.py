#!/usr/bin/env python3
"""
WebSocket 서버 - Frontend와 Backend FTMS 기능을 연결
"""

import asyncio
import json
import logging
import websockets
import threading
from typing import Dict, Any, Optional
import time
from datetime import datetime

# Backend 모듈들 import
from scanner import scan_for_ftms_devices, device_protocols
from device_test import connect_and_test_device
from data_handler import notification_handler, test_results, resistance_tracking
import data_handler
from constants import *

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FTMSWebSocketServer:
    def __init__(self):
        self.connected_clients = set()
        self.current_client = None
        self.devices = []
        self.connected_device = None
        self.device_data = {
            'speed': 0,
            'cadence': 0,
            'power': 0,
            'resistance': 0,
            'target_power': 0,
            'connected': False,
            'scanning': False
        }
        self.real_time_data = {}
        
    async def register_client(self, websocket):
        """클라이언트 등록"""
        self.connected_clients.add(websocket)
        self.current_client = websocket
        logger.info(f"Client connected: {websocket.remote_address}")
        
        # 초기 상태 전송
        await self.send_to_client(websocket, {
            'type': 'connection_status',
            'connected': self.device_data['connected'],
            'data': self.device_data
        })

    async def unregister_client(self, websocket):
        """클라이언트 등록 해제"""
        self.connected_clients.discard(websocket)
        if self.current_client == websocket:
            self.current_client = None
        logger.info(f"Client disconnected: {websocket.remote_address}")

    async def send_to_client(self, websocket, message):
        """클라이언트에게 메시지 전송"""
        try:
            await websocket.send(json.dumps(message))
        except websockets.exceptions.ConnectionClosed:
            await self.unregister_client(websocket)
        except Exception as e:
            logger.error(f"Error sending message to client: {e}")

    async def broadcast_to_all(self, message):
        """모든 클라이언트에게 브로드캐스트"""
        if self.connected_clients:
            await asyncio.gather(
                *[self.send_to_client(client, message) for client in self.connected_clients.copy()],
                return_exceptions=True
            )

    async def handle_scan_devices(self):
        """장치 스캔 처리"""
        try:
            self.device_data['scanning'] = True
            await self.broadcast_to_all({
                'type': 'scan_status',
                'scanning': True,
                'message': 'Scanning for FTMS devices...'
            })
            
            # 실제 스캔 수행
            devices = await scan_for_ftms_devices(15)
            self.devices = devices
            
            device_list = []
            for device in devices:
                protocol_info = device_protocols.get(device.address, {})
                device_list.append({
                    'name': device.name or 'Unknown',
                    'address': device.address,
                    'protocol': protocol_info.get('primary_protocol', 'Unknown'),
                    'protocols_str': protocol_info.get('protocols_str', 'Unknown')
                })
            
            self.device_data['scanning'] = False
            await self.broadcast_to_all({
                'type': 'devices_found',
                'devices': device_list,
                'scanning': False
            })
            
        except Exception as e:
            logger.error(f"Scan error: {e}")
            self.device_data['scanning'] = False
            await self.broadcast_to_all({
                'type': 'error',
                'message': f'Scan error: {str(e)}',
                'scanning': False
            })

    async def handle_connect_device(self, device_address):
        """장치 연결 처리"""
        try:
            # 주소로 장치 찾기
            selected_device = None
            for device in self.devices:
                if device.address == device_address:
                    selected_device = device
                    break
            
            if not selected_device:
                await self.broadcast_to_all({
                    'type': 'error',
                    'message': 'Device not found'
                })
                return
            
            await self.broadcast_to_all({
                'type': 'connection_status',
                'message': f'Connecting to {selected_device.name}...',
                'connecting': True
            })
            
            # 실제 연결 및 테스트 (별도 스레드에서 실행)
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._connect_device_sync, selected_device)
            
        except Exception as e:
            logger.error(f"Connection error: {e}")
            await self.broadcast_to_all({
                'type': 'error',
                'message': f'Connection error: {str(e)}'
            })

    def _connect_device_sync(self, device):
        """동기적으로 장치 연결 (별도 스레드에서 실행)"""
        try:
            # 새 이벤트 루프 생성
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            # 연결 및 테스트
            loop.run_until_complete(connect_and_test_device(device))
            
            # 연결 성공
            self.connected_device = device
            self.device_data['connected'] = True
            
            # 메인 루프에서 클라이언트에게 알림
            asyncio.run_coroutine_threadsafe(
                self.broadcast_to_all({
                    'type': 'connection_status',
                    'connected': True,
                    'device': {
                        'name': device.name,
                        'address': device.address
                    },
                    'message': f'Connected to {device.name}'
                }), 
                self.main_loop
            )
            
            # 실시간 데이터 모니터링 시작
            asyncio.run_coroutine_threadsafe(
                self.start_data_monitoring(),
                self.main_loop
            )
            
        except Exception as e:
            logger.error(f"Connection failed: {e}")
            asyncio.run_coroutine_threadsafe(
                self.broadcast_to_all({
                    'type': 'error',
                    'message': f'Connection failed: {str(e)}'
                }),
                self.main_loop
            )

    async def start_data_monitoring(self):
        """실시간 데이터 모니터링 시작"""
        while self.device_data['connected']:
            try:
                # data_handler의 test_results에서 실시간 데이터 가져오기
                detected_fields = test_results.get('data_fields_detected', {})
                
                # 데이터 업데이트
                if 'speed' in detected_fields:
                    self.device_data['speed'] = detected_fields['speed']
                if 'cadence' in detected_fields:
                    self.device_data['cadence'] = detected_fields['cadence']
                if 'power' in detected_fields:
                    self.device_data['power'] = detected_fields['power']
                if 'resistance' in detected_fields:
                    self.device_data['resistance'] = detected_fields['resistance']
                
                # 클라이언트에게 실시간 데이터 전송
                await self.broadcast_to_all({
                    'type': 'real_time_data',
                    'data': self.device_data.copy(),
                    'timestamp': datetime.now().isoformat()
                })
                
                await asyncio.sleep(1)  # 1초마다 업데이트
                
            except Exception as e:
                logger.error(f"Data monitoring error: {e}")
                await asyncio.sleep(5)

    async def handle_control_command(self, command, params):
        """제어 명령 처리"""
        try:
            if not self.device_data['connected']:
                await self.broadcast_to_all({
                    'type': 'error',
                    'message': 'No device connected'
                })
                return
            
            if command == 'set_target_power':
                power = params.get('power', 100)
                self.device_data['target_power'] = power
                # 실제 명령 전송 로직 추가 필요
                await self.broadcast_to_all({
                    'type': 'command_result',
                    'command': 'set_target_power',
                    'success': True,
                    'power': power
                })
            
            elif command == 'set_resistance':
                level = params.get('level', 1)
                # 실제 명령 전송 로직 추가 필요
                await self.broadcast_to_all({
                    'type': 'command_result',
                    'command': 'set_resistance',
                    'success': True,
                    'level': level
                })
                
        except Exception as e:
            logger.error(f"Control command error: {e}")
            await self.broadcast_to_all({
                'type': 'error',
                'message': f'Control command error: {str(e)}'
            })

    async def handle_message(self, websocket, message):
        """클라이언트 메시지 처리"""
        try:
            data = json.loads(message)
            command = data.get('command')
            params = data.get('params', {})
            
            logger.info(f"Received command: {command}")
            
            if command == 'scan_devices':
                await self.handle_scan_devices()
            elif command == 'connect_device':
                device_address = params.get('address')
                await self.handle_connect_device(device_address)
            elif command in ['set_target_power', 'set_resistance']:
                await self.handle_control_command(command, params)
            else:
                await self.send_to_client(websocket, {
                    'type': 'error',
                    'message': f'Unknown command: {command}'
                })
                
        except json.JSONDecodeError:
            await self.send_to_client(websocket, {
                'type': 'error',
                'message': 'Invalid JSON message'
            })
        except Exception as e:
            logger.error(f"Message handling error: {e}")
            await self.send_to_client(websocket, {
                'type': 'error',
                'message': f'Error: {str(e)}'
            })

    async def websocket_handler(self, websocket, path):
        """WebSocket 연결 핸들러"""
        await self.register_client(websocket)
        try:
            async for message in websocket:
                await self.handle_message(websocket, message)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            await self.unregister_client(websocket)

    async def start_server(self):
        """WebSocket 서버 시작"""
        self.main_loop = asyncio.get_event_loop()
        
        logger.info("Starting FTMS WebSocket Server on ws://localhost:9001")
        server = await websockets.serve(
            self.websocket_handler,
            "localhost",
            9001,
            ping_interval=20,
            ping_timeout=10
        )
        
        logger.info("WebSocket server started successfully")
        await server.wait_closed()

async def main():
    server = FTMSWebSocketServer()
    await server.start_server()

if __name__ == "__main__":
    asyncio.run(main())
