from asyncio.log import logger


def analyze_test_results(test_results):
    """테스트 결과를 분석하여 호환성 수준을 결정"""
    
    try:
        logger.info("🔍 Starting analyze_test_results()")
        logger.info(f"🔍 test_results type: {type(test_results)}")
        logger.info(f"🔍 test_results keys: {list(test_results.keys()) if test_results else 'None'}")
        
        # test_results가 None이거나 비어있는 경우 안전하게 처리
        if not test_results:
            logger.warning("⚠️ test_results is None or empty, initializing default values")
            test_results = {
                'device_info': {},
                'connection_status': False,
                'protocol_type': '',
                'features_supported': {},
                'data_fields_detected': {},
                'control_commands_tested': {},
                'sim_mode_support': False,
                'resistance_control': False,
                'power_control': False,
                'compatibility_level': '불가능',
                'issues_found': [],
                'reasons': ['테스트 결과를 찾을 수 없습니다.']
            }
            return
        
        # 기본 연결성 확인
        connection_status = test_results.get('connection_status', False)
        logger.info(f"🔍 Connection status: {connection_status}")
        
        if not connection_status:
            test_results['compatibility_level'] = "불가능"
            test_results['reasons'] = ["기기 연결이 실패했습니다. 블루투스 설정을 확인하세요."]
            return
        
        # 1. CSC 센서 UUID 확인 (가장 우선) - 실제 서비스 UUID로 확인
        device_info = test_results.get('device_info') or {}
        logger.info(f"🔍 device_info: {device_info}")
        logger.info(f"🔍 device_info type: {type(device_info)}")
        
        services = device_info.get('services', [])
        logger.info(f"🔍 services: {services}")
        logger.info(f"🔍 services type: {type(services)}")
        
        # services가 None인 경우 처리
        if services is None:
            logger.warning("⚠️ services is None, setting to empty list")
            services = []
        
        # CSC Service UUID: 00001816-0000-1000-8000-00805f9b34fb
        try:
            has_csc_service = any('1816' in str(service).lower() or 'cycling_speed_and_cadence' in str(service).lower() for service in services)
            logger.info(f"🔍 has_csc_service: {has_csc_service}")
        except Exception as e:
            logger.error(f"❌ Error checking CSC service: {e}")
            logger.error(f"❌ services content: {services}")
            has_csc_service = False
        
        # 또는 features_supported에서 CSC 관련 특성 확인 (보조적으로)
        features_supported = test_results.get('features_supported') or {}
        logger.info(f"🔍 features_supported: {features_supported}")
        logger.info(f"🔍 features_supported type: {type(features_supported)}")
        
        try:
            has_csc_features = features_supported.get('CSC Measurement', False) or features_supported.get('CSC Feature', False)
            logger.info(f"🔍 has_csc_features: {has_csc_features}")
        except Exception as e:
            logger.error(f"❌ Error checking CSC features: {e}")
            has_csc_features = False
        
        # CSC 서비스 또는 CSC 특성 중 하나라도 있으면 CSC 센서로 판단
        has_csc_sensor = has_csc_service or has_csc_features
        logger.info(f"🔍 has_csc_sensor: {has_csc_sensor}")

        # 추가: data_fields_detected에서도 속도/케이던스 확인
        detected_fields_early_check = test_results.get('data_fields_detected', {})
        has_essential_data_fields = 'speed' in detected_fields_early_check and 'cadence' in detected_fields_early_check
        logger.info(f"🔍 has_essential_data_fields (early check): {has_essential_data_fields}")
        
        if not (has_csc_sensor or has_essential_data_fields):
            test_results['compatibility_level'] = "불가능"
            test_results['reasons'] = ["필수 정보인 속도/캐던스 센서 또는 데이터가 발견되지 않았습니다."]
            return
        
        # 2. 프로토콜 타입 확인
        protocol_type = test_results.get('protocol_type', '')
        logger.info(f"🔍 protocol_type: {protocol_type}")
        
        # 커스텀 프로토콜의 경우
        if protocol_type in ["MOBI (커스텀)", "REBORN (커스텀)", "TACX (커스텀)"]:
            test_results['compatibility_level'] = "호환 확인 현재 불가"
            test_results['reasons'] = [f"{protocol_type} 프로토콜은 현재 호환성 확인이 불가능합니다."]
            return
        
        # FTMS가 아닌 표준 프로토콜이지만 지원되지 않는 경우
        if protocol_type not in ["FTMS (표준)", "CSC (표준)"]:
            test_results['compatibility_level'] = "불가능"
            test_results['reasons'] = ["지원되지 않는 프로토콜입니다."]
            return
        
        # CSC 프로토콜의 경우 부분 호환성으로 설정
        if protocol_type == "CSC (표준)":
            test_results['compatibility_level'] = "부분 호환"
            test_results['reasons'] = ["CSC 프로토콜은 속도/캐던스 데이터만 제공합니다."]
            return
        
        # FTMS 프로토콜인 경우에만 상세 분석 진행
        detected_fields = test_results.get('data_fields_detected') or {}
        logger.info(f"🔍 detected_fields: {detected_fields}")
        
        has_speed_and_cadence = 'speed' in detected_fields and 'cadence' in detected_fields # Renamed variable
        logger.info(f"🔍 has_speed_and_cadence: {has_speed_and_cadence}") # Updated log to use new variable name
        
        sim_working = test_results.get('sim_mode_support', False)
        logger.info(f"🔍 sim_working: {sim_working}")
        
        # 호환성 수준 결정
        reasons = []
        
        if has_speed_and_cadence and sim_working: # Use new variable name
            test_results['compatibility_level'] = "완벽 호환"
            reasons.append("속도와 캐던스 데이터가 모두 있고, 시뮬레이션 모드가 정상 작동합니다.") # Updated reason
        elif has_speed_and_cadence and not sim_working: # Use new variable name
            issues_found = test_results.get('issues_found') or []
            logger.info(f"🔍 issues_found: {issues_found}")
            
            try:
                if any('Resistance changed without any resistance-related command' in issue for issue in issues_found):
                    test_results['compatibility_level'] = "부분 호환 (수정 후 완벽 호환)"
                    reasons.append("저항이 관련 명령어 없이 자동으로 변합니다. 설정 수정 후 완벽 호환 가능합니다.")
                else:
                    test_results['compatibility_level'] = "부분 호환"
                    reasons.append("속도와 캐던스 데이터는 모두 있지만, 시뮬레이션 모드는 지원하지 않거나 다른 문제가 있을 수 있습니다.") # Updated reason
            except Exception as e:
                logger.error(f"❌ Error checking issues_found: {e}")
                logger.error(f"❌ issues_found content: {issues_found}")
                test_results['compatibility_level'] = "부분 호환"
                reasons.append("속도와 캐던스 데이터는 모두 있지만, 시뮬레이션 모드 확인 중 오류가 발생했습니다.") # Updated reason
        elif not has_speed_and_cadence: # Use new variable name; this means NOT (speed AND cadence)
            test_results['compatibility_level'] = "불가능"
            reasons.append("필수 데이터인 속도와 캐던스 중 하나 또는 둘 다 감지되지 않았습니다.") # Updated reason for clarity
        else: # This else block should ideally not be reached if the logic is exhaustive
            test_results['compatibility_level'] = "불가능"
            reasons.append("기본 요구사항을 만족하지 않습니다.")
        
        test_results['reasons'] = reasons
        logger.info(f"🔍 Final compatibility_level: {test_results['compatibility_level']}")
        logger.info(f"🔍 Final reasons: {test_results['reasons']}")
        
    except Exception as e:
        logger.error(f"❌ Error in analyze_test_results: {e}")
        logger.error(f"❌ Error type: {type(e)}")
        import traceback
        logger.error(f"❌ Traceback: {traceback.format_exc()}")
        
        # 에러 발생 시 안전한 기본값 설정
        test_results['compatibility_level'] = "불가능"
        test_results['reasons'] = [f"분석 중 오류가 발생했습니다: {str(e)}"]