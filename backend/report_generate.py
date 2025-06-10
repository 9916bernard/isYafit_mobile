from asyncio.log import logger
from datetime import datetime
import json
import os
from analyze_result import analyze_test_results


def generate_report(test_results, current_log_filename):
    try:
        logger.info("🔍 Starting generate_report()")
        
        analyze_test_results(test_results)
        
        device_info = test_results.get("device_info", {})
        logger.info(f"🔍 device_info in generate_report: {device_info}")
        
        device_name = device_info.get("name")
        logger.info(f"🔍 device_name: {device_name}, type: {type(device_name)}")
        
        # device_name이 None인 경우 처리
        if device_name is None:
            device_name = "unknown_device"
            logger.warning("⚠️ device_name is None, using 'unknown_device'")
        
        safe_name = "".join(c for c in device_name if c.isalnum() or c in "-_") or "unknown_device"
        logger.info(f"🔍 safe_name: {safe_name}")
        
        time_str = datetime.now().strftime("%H-%M")
        
        # Create reports directory if it doesn't exist
        reports_dir = os.path.join("results", "reports")
        os.makedirs(reports_dir, exist_ok=True)
        
        report_filename = os.path.join(reports_dir, f"{safe_name}_{time_str}_report.txt")
        
        # 안전한 값 추출
        device_name_safe = test_results.get('device_info', {}).get('name') or 'Unknown'
        device_address_safe = test_results.get('device_info', {}).get('address') or 'Unknown'
        protocol_type_safe = test_results.get('protocol_type') or 'Unknown'
        connection_status = test_results.get('connection_status', False)
        compatibility_level = test_results.get('compatibility_level') or 'Unknown'
        
        logger.info(f"🔍 Safe values extracted successfully")
        
        report_content = f"""
YAFIT 호환성 테스트 보고서
=================================
테스트 시간: {datetime.now():%Y-%m-%d %H:%M:%S}

[기기 정보]
기기명: {device_name_safe}
주소: {device_address_safe}
프로토콜: {protocol_type_safe}

[연결 상태]
연결 성공: {'✅ 성공' if connection_status else '❌ 실패'}

[지원 기능]
"""
        
        # features_supported가 None이거나 비어있는 경우 처리
        features_supported = test_results.get("features_supported") or {}
        logger.info(f"🔍 features_supported in report: {features_supported}")
        
        try:
            if features_supported:
                for k, v in features_supported.items():
                    if k is not None and v is not None:
                        report_content += f"{k}: {'✅' if v else '❌'}\n"
            else:
                report_content += "기능 정보를 읽을 수 없습니다.\n"
        except Exception as e:
            logger.error(f"❌ Error processing features_supported: {e}")
            report_content += "기능 정보 처리 중 오류가 발생했습니다.\n"
          # 서포트 범위 정보 추가
        report_content += f"""

[서포트 범위]
"""
        support_ranges = test_results.get('support_ranges') or {}
        logger.info(f"🔍 support_ranges in report: {support_ranges}")
        
        try:
            if support_ranges:
                if 'speed' in support_ranges:
                    speed_range = support_ranges['speed']
                    report_content += f"속도 범위: {speed_range['min']:.2f} - {speed_range['max']:.2f} km/h (증분: {speed_range['increment']:.2f} km/h)\n"
                
                if 'incline' in support_ranges:
                    incline_range = support_ranges['incline']
                    report_content += f"경사도 범위: {incline_range['min']:.1f}% - {incline_range['max']:.1f}% (증분: {incline_range['increment']:.1f}%)\n"
                
                if 'resistance' in support_ranges:
                    resistance_range = support_ranges['resistance']
                    report_content += f"저항 범위: {resistance_range['min']} - {resistance_range['max']} (증분: {resistance_range['increment']})\n"
                
                if 'power' in support_ranges:
                    power_range = support_ranges['power']
                    report_content += f"파워 범위: {power_range['min']} - {power_range['max']} watts (증분: {power_range['increment']} watts)\n"
            else:
                report_content += "서포트 범위 정보를 불러올 수 없습니다.\n"
        except Exception as e:
            logger.error(f"❌ Error processing support_ranges: {e}")
            report_content += "서포트 범위 정보 처리 중 오류가 발생했습니다.\n"
        
        # 추가 컨트롤 기능 정보 추가
        report_content += f"""

[추가 컨트롤 기능]
"""
        control_tests = test_results.get('control_tests') or {}
        logger.info(f"🔍 control_tests in report: {control_tests}")
        try:
            if control_tests:
                for cmd, result in control_tests.items():
                    is_ok = result == "OK"
                    icon = "✅" if is_ok else "❌"
                    status = "성공" if is_ok else "실패"
                    report_content += f"{cmd} - {status} {icon}\n"
            else:
                report_content += "컨트롤 기능 테스트 결과를 불러올 수 없습니다.\n"
        except Exception as e:
            logger.error(f"❌ Error processing control_tests: {e}")
            report_content += "컨트롤 기능 테스트 결과 처리 중 오류가 발생했습니다.\n"
                
        report_content += f"""

[검출된 데이터 필드]
"""
          # 검출된 데이터 필드 출력 - None 체크 추가 및 필드 순서 정리
        data_fields = test_results.get('data_fields_detected') or {}
        logger.info(f"🔍 data_fields in report: {data_fields}")
          # 데이터 필드 표시 이름과 실제 키 값 매핑
        field_mapping = {
            "Instantaneous Speed": "speed",
            "Instantaneous Cadence": "cadence",
            "Average Speed": "avg_speed",
            "Average Cadence": "avg_cadence",
            "Total Distance": "distance",
            "Resistance Level": "resistance",
            "Instantaneous Power": "power",
            "Average Power": "avg_power",
            "Expended Energy": "energy",
            "Heart Rate": "heart_rate",
            "Metabolic Equivalent": "met",
            "Elapsed Time": "elapsed_time",
            "Remaining Time": "remaining_time"
        }
        
        # 표시 순서 (Instantaneous Speed, Instantaneous Cadence를 먼저 보여주기 위함)
        field_order = [
            "Instantaneous Speed",
            "Instantaneous Cadence",
            "Average Speed",
            "Average Cadence",
            "Total Distance",
            "Resistance Level",
            "Instantaneous Power",
            "Average Power",
            "Expended Energy",
            "Heart Rate",
            "Metabolic Equivalent",
            "Elapsed Time",
            "Remaining Time"
        ]
        
        try:
            if data_fields:
                # 우선 순위가 높은 필드부터 출력 (Instantaneous Speed, Instantaneous Cadence)
                for priority_field_name in field_order[:2]:
                    field_key = field_mapping.get(priority_field_name)
                    if field_key in data_fields and data_fields[field_key] is not None:
                        report_content += f"{priority_field_name}: {data_fields[field_key]}\n"
                    else:
                        report_content += f"{priority_field_name}: 미검출\n"
                
                # 구분선 추가
                report_content += "----------------\n"
                
                # 그 외 필드 출력
                for other_field_name in field_order[2:]:
                    field_key = field_mapping.get(other_field_name)
                    if field_key in data_fields and data_fields[field_key] is not None:
                        report_content += f"{other_field_name}: {data_fields[field_key]}\n"
                    else:
                        report_content += f"{other_field_name}: 미검출\n"
            else:
                report_content += "검출된 데이터가 없습니다.\n"
        except Exception as e:
            logger.error(f"❌ Error processing data_fields: {e}")
            report_content += "데이터 필드 처리 중 오류가 발생했습니다.\n"
        
        report_content += f"""
[호환성 수준]
🎯 결과: {compatibility_level}

[이유]
"""
        
        # reasons가 None이거나 비어있는 경우 처리
        reasons = test_results.get("reasons") or []
        logger.info(f"🔍 reasons in report: {reasons}")
        logger.info(f"🔍 reasons type: {type(reasons)}")
        
        try:
            if reasons and isinstance(reasons, list):
                for reason in reasons:
                    if reason is not None:
                        report_content += f"💡 {reason}\n"
            else:
                report_content += "추가 이유가 없습니다.\n"
        except Exception as e:
            logger.error(f"❌ Error processing reasons: {e}")
            logger.error(f"❌ reasons content: {reasons}")
            report_content += "이유 처리 중 오류가 발생했습니다.\n"
        
        report_content += """

=================================
테스트 완료
"""
        
        try:
            with open(report_filename, "w", encoding="utf-8") as f:
                f.write(report_content)
            logger.info(f"✅ Report file written successfully: {report_filename}")
        except Exception as e:
            logger.error(f"❌ Error writing report file: {e}")        # 프론트엔드에서 사용할 JSON 데이터 준비
        
        # 컨트롤 테스트 결과를 boolean 값으로 변환하여 front UI 토글에 표시되게 함
        control_tests_boolean = {}
        if control_tests:
            for cmd, result in control_tests.items():
                control_tests_boolean[cmd] = (result == "OK")
        
        json_payload = {
            "device_info": {
                "name": device_name_safe,
                "address": device_address_safe
            },
            "connection_status": connection_status,
            "protocol_type": protocol_type_safe,
            "features_supported": features_supported,
            "data_fields_detected": data_fields,
            "support_ranges": support_ranges,
            "control_tests": control_tests_boolean,  # boolean 값으로 변환된 컨트롤 테스트 결과
            "compatibility_level": compatibility_level,
            "reasons": reasons
        }
        
        payload = {
            "type": "REPORT",
            "filename": report_filename,
            "logfile": current_log_filename,
            "content": json.dumps(json_payload),  # JSON 문자열로 변환하여 전송
            "text_content": report_content  # 원래의 텍스트 콘텐츠도 함께 전송
        }
        print(json.dumps(payload), flush=True)
        return report_filename
        
    except Exception as e:
        logger.error(f"❌ Error in generate_report: {e}")
        logger.error(f"❌ Error type: {type(e)}")
        import traceback
        logger.error(f"❌ Traceback: {traceback.format_exc()}")
          # 에러 발생 시에도 기본 보고서 생성        # 오류 발생 시에도 최소한의 JSON 형식 데이터 제공        # 에러 경우에도 control_tests_boolean 형태로 제공
        control_tests_boolean = {}
        error_json = json.dumps({
            "device_info": {
                "name": "Error",
                "address": "Unknown"
            },
            "connection_status": False,
            "protocol_type": "Unknown",
            "compatibility_level": "불가능",
            "control_tests": control_tests_boolean,  # 빈 컨트롤 테스트 결과를 boolean 형태로 추가
            "reasons": [f"보고서 생성 중 오류가 발생했습니다: {str(e)}"]
        })
        
        error_payload = {
            "type": "REPORT",
            "filename": "error_report.txt",
            "logfile": current_log_filename,
            "content": error_json,
            "text_content": f"보고서 생성 중 오류가 발생했습니다: {str(e)}"
        }
        print(json.dumps(error_payload), flush=True)
        return "error_report.txt"