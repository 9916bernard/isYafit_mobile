// TestReportScreen.tsx - FTMS Detailed Test Report Component
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert, // Added for copy confirmation
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard'; // Added for clipboard functionality
import { TestResults, formatRangeInfo } from '../FtmsTestReport';
import { useSafeAreaStyles, Colors } from '../styles/commonStyles';

interface TestReportScreenProps {
  results: TestResults;
  onClose: () => void;
}

const TestReportScreen: React.FC<TestReportScreenProps> = ({ results, onClose }) => {
  const safeAreaStyles = useSafeAreaStyles();
  
  // Function to share the test report
  const handleShare = async () => {
    try {
      const jsonReport = JSON.stringify(results, null, 2);
      
      // Create a human-readable report
      const deviceName = results.deviceInfo.name || 'Unknown Device';
      const protocols = results.supportedProtocols.join(', ');
      const compatibility = results.compatibilityLevel || 'Not determined';
      
      const textReport = `
IsYafit FTMS 호환성 테스트 보고서

장치: ${deviceName} (${results.deviceInfo.address})
프로토콜: ${protocols}
호환성: ${compatibility}
테스트 일자: ${new Date(results.testCompletedTimestamp || Date.now()).toLocaleString()}

${results.reasons && results.reasons.length > 0 ? '판정 사유:\n' + results.reasons.map(r => `- ${r}`).join('\n') : ''}

${results.issuesFound && results.issuesFound.length > 0 ? '\n발견된 문제점:\n' + results.issuesFound.map(i => `- ${i}`).join('\n') : ''}
      `;
      
      await Share.share({
        title: `IsYafit 호환성 보고서 - ${deviceName}`,
        message: textReport,
      });
    } catch (error) {
      console.error('Error sharing report:', error);
    }
  };
  const renderControlTests = () => {
    if (!results.controlTests || Object.keys(results.controlTests).length === 0) {
      return (
        <Text style={styles.noDataText}>제어 테스트 데이터 없음</Text>
      );
    }

    // 명령 타입별 한글 설명
    const commandTypeLabels: { [key: string]: string } = {
      'SET_RESISTANCE_LEVEL': '저항 레벨 설정',
      'SET_TARGET_POWER': '목표 파워 설정',
      'SET_SIM_PARAMS': '경사도 시뮬레이션'
    };

    return (
      <>
        {Object.entries(results.controlTests).map(([name, test]) => {
          // 한글 명령어 레이블 가져오기
          const commandLabel = commandTypeLabels[name] || name;
          
          return (
            <View key={name} style={styles.controlTestItem}>
              <View style={styles.controlTestHeader}>
                <View style={styles.commandTypeContainer}>
                  <Text style={styles.commandTypeLabel}>{commandLabel}</Text>
                  <Text style={styles.controlTestName}>{name}</Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  {
                    backgroundColor: test.status === 'OK' ? '#4CAF50' : 
                                    test.status === 'Failed' ? '#F44336' : 
                                    test.status === 'Pending' ? '#FF9800' : '#607D8B'
                  }
                ]}>
                  <Text style={styles.statusText}>{
                    test.status === 'OK' ? '성공' :
                    test.status === 'Failed' ? '실패' :
                    test.status === 'Pending' ? '대기 중' : test.status
                  }</Text>
                </View>
              </View>
              
              {test.details && (
                <Text style={styles.controlTestDetails}>{test.details}</Text>
              )}
              
              <View style={styles.testInfoRow}>
                <Text style={styles.controlTestTimestamp}>
                  테스트 시간: {new Date(test.timestamp).toLocaleTimeString()}
                </Text>
                
                {/* 상태에 따른 아이콘 표시 */}
                <Text style={[
                  styles.testStatusIcon, 
                  {color: test.status === 'OK' ? '#4CAF50' : test.status === 'Failed' ? '#F44336' : '#FF9800'}
                ]}>
                  {test.status === 'OK' ? '✓' : test.status === 'Failed' ? '✗' : '⟳'}
                </Text>
              </View>
            </View>
          );
        })}
      </>
    );
  };

  const renderDataFields = () => {
    if (!results.dataFields || Object.values(results.dataFields).filter(f => f.detected).length === 0) {
      return (
        <Text style={styles.noDataText}>데이터 필드가 감지되지 않음</Text>
      );
    }

    return (
      <View style={styles.dataFieldsTable}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, { flex: 1.5 }]}>이름</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1 }]}>감지</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1 }]}>최소값</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1 }]}>최대값</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1 }]}>현재값</Text>
        </View>

        {Object.entries(results.dataFields).map(([name, field]) => (
          <View key={name} style={styles.tableRow}>
            <Text style={[styles.tableCell, { flex: 1.5 }]}>{name}</Text>
            <Text style={[styles.tableCell, { flex: 1, color: field.detected ? '#4CAF50' : '#F44336' }]}>
              {field.detected ? '✓' : '✗'}
            </Text>
            <Text style={[styles.tableCell, { flex: 1 }]}>
              {field.minValue !== undefined ? field.minValue.toString() : '-'}
            </Text>
            <Text style={[styles.tableCell, { flex: 1 }]}>
              {field.maxValue !== undefined ? field.maxValue.toString() : '-'}
            </Text>
            <Text style={[styles.tableCell, { flex: 1 }]}>
              {field.currentValue !== undefined ? field.currentValue.toString() : '-'}
            </Text>
          </View>
        ))}
      </View>
    );
  };
  const renderResistanceChanges = () => {
    if (!results.resistanceChanges || results.resistanceChanges.length === 0) {
      return (
        <Text style={styles.noDataText}>저항 변화 데이터 없음</Text>
      );
    }

    return (
      <View style={styles.resistanceChangesTable}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>시간</Text>
          <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>유형</Text>
          <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>이전값</Text>
          <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>현재값</Text>
          <Text style={[styles.tableHeaderCell, { flex: 2 }]}>변경 원인</Text>
        </View>

        {results.resistanceChanges.map((change, index) => {
          // 명령어에 따른 스타일 적용
          const isCommandChange = change.command && change.command !== '자동 변경';
          const textColor = isCommandChange ? '#00c663' : '#fff';
          const bgColor = isCommandChange ? 'rgba(0, 198, 99, 0.1)' : 'transparent';
          
          return (
            <View 
              key={index} 
              style={[
                styles.tableRow, 
                { backgroundColor: bgColor }
              ]}
            >
              <Text style={[styles.tableCell, { flex: 1.2 }]}>
                {new Date(change.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
              </Text>
              <Text style={[styles.tableCell, { flex: 0.8 }]}>{change.paramType}</Text>
              <Text style={[styles.tableCell, { flex: 0.8 }]}>
                {change.oldValue !== undefined ? change.oldValue.toString() : '-'}
              </Text>
              <Text style={[styles.tableCell, { flex: 0.8, color: textColor }]}>{change.newValue}</Text>
              <Text style={[styles.tableCell, { flex: 2, color: textColor, fontWeight: isCommandChange ? 'bold' : 'normal' }]}>
                {change.command || '자동 변경'}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  const [showFullLog, setShowFullLog] = React.useState(false);

  // Function to copy interaction logs
  const handleCopyLogs = () => {
    if (results.interactionLogs && results.interactionLogs.length > 0) {
      try {
        const logString = results.interactionLogs.join('\n');
        Clipboard.setString(logString);
        Alert.alert("성공", "상호작용 로그가 클립보드에 복사되었습니다.");
      } catch (error) {
        console.error('Failed to copy logs:', error);
        Alert.alert("오류", "로그 복사에 실패했습니다.");
      }
    } else {
      Alert.alert("정보", "복사할 로그가 없습니다.");
    }
  };
  return (
    <View style={safeAreaStyles.safeContainerMinPadding}>
      <ScrollView style={styles.scrollViewContainer}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>FTMS 테스트 보고서</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>닫기</Text>
            </TouchableOpacity>
          </View>

          {/* Share Button */}
          <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
            <Text style={styles.shareButtonText}>보고서 공유</Text>
          </TouchableOpacity>

          {/* Device Info Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>장치 정보</Text>
            <View style={styles.deviceInfoContainer}>
              <Text style={styles.deviceName}>
                {results.deviceInfo.name || 'Unknown Device'}
              </Text>
              <Text style={styles.deviceAddress}>{results.deviceInfo.address}</Text>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>프로토콜:</Text>
                <Text style={styles.infoValue}>
                  {results.deviceInfo.protocol || '알 수 없음'}
                </Text>
              </View>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>지원 프로토콜:</Text>
                <Text style={styles.infoValue}>
                  {results.supportedProtocols.join(', ') || '없음'}
                </Text>
              </View>

              <View style={[styles.infoRow, styles.compatibilityRow]}>
                <Text style={styles.infoLabel}>호환성:</Text>
                <View style={[
                  styles.compatibilityBadge,
                  {
                    backgroundColor: 
                      results.compatibilityLevel === '완전 호환' ? '#4CAF50' :
                      results.compatibilityLevel === '제한적 호환' ? '#FF9800' :
                      results.compatibilityLevel === '수정 필요' ? '#2196F3' : '#F44336'
                  }
                ]}>
                  <Text style={styles.compatibilityText}>
                    {results.compatibilityLevel || '평가 불가'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Compatibility Reasons */}
          {results.reasons && results.reasons.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>호환성 판정 사유</Text>
              <View style={styles.reasonsContainer}>
                {results.reasons.map((reason, index) => (
                  <Text key={index} style={styles.reasonText}>• {reason}</Text>
                ))}
              </View>
            </View>
          )}

          {/* Issues Found */}
          {results.issuesFound && results.issuesFound.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>문제점</Text>
              <View style={styles.issuesContainer}>
                {results.issuesFound.map((issue, index) => (
                  <Text key={index} style={styles.issueText}>• {issue}</Text>
                ))}
              </View>
            </View>
          )}

          {/* Support Ranges */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>지원 범위</Text>
            {results.supportRanges && Object.keys(results.supportRanges).length > 0 ? (
              <View style={styles.rangesContainer}>
                {results.supportRanges.speed && (
                  <Text style={styles.rangeText}>
                    {formatRangeInfo(results.supportRanges.speed, 'speed')}
                  </Text>
                )}
                {results.supportRanges.incline && (
                  <Text style={styles.rangeText}>
                    {formatRangeInfo(results.supportRanges.incline, 'incline')}
                  </Text>
                )}
                {results.supportRanges.resistance && (
                  <Text style={styles.rangeText}>
                    {formatRangeInfo(results.supportRanges.resistance, 'resistance')}
                  </Text>
                )}
                {results.supportRanges.power && (
                  <Text style={styles.rangeText}>
                    {formatRangeInfo(results.supportRanges.power, 'power')}
                  </Text>
                )}
              </View>
            ) : (
              <Text style={styles.noDataText}>지원 범위 데이터 없음</Text>
            )}
          </View>

          {/* Features */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>지원 기능</Text>
            {results.features && Object.keys(results.features).length > 0 ? (
              <View style={styles.featuresContainer}>
                {Object.entries(results.features).map(([name, supported]) => (
                  <View key={name} style={styles.featureItem}>
                    <Text style={[
                      styles.featureText,
                      { color: supported ? '#4CAF50' : '#ccc' }
                    ]}>
                      {supported ? '✓' : '✗'} {name}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.noDataText}>지원 기능 데이터 없음</Text>
            )}
          </View>

          {/* Data Fields */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>감지된 데이터 필드</Text>
            {renderDataFields()}
          </View>

          {/* Control Tests */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>제어 테스트 결과</Text>
            <View style={styles.controlTestsContainer}>
              {renderControlTests()}
            </View>
          </View>

          {/* Resistance Changes Log */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>저항 변화 로그</Text>
            {renderResistanceChanges()}
          </View>

          {/* Interaction Logs Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>상호작용 로그</Text>
            {results.interactionLogs && results.interactionLogs.length > 0 ? (
              <>
                <View style={styles.logActionsContainer}>
                  <TouchableOpacity
                    style={styles.toggleLogButton}
                    onPress={() => setShowFullLog(!showFullLog)}
                  >
                    <Text style={styles.toggleLogButtonText}>
                      {showFullLog ? '로그 숨기기' : `전체 로그 보기 (${results.interactionLogs.length} 항목)`}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.copyLogButton}
                    onPress={handleCopyLogs}
                  >
                    <Text style={styles.copyLogButtonText}>로그 복사</Text>
                  </TouchableOpacity>
                </View>
                {showFullLog && (
                  <ScrollView style={styles.logScrollContainer} nestedScrollEnabled={true}>
                    <View style={styles.logContainer}>
                      {results.interactionLogs.map((log, index) => (
                        <Text key={index} style={styles.logEntry}>
                          {(() => {
                            // 명령 전송 로그 (파란색)
                            if (log.includes('명령 전송:')) {
                              return <Text style={{fontWeight: 'bold', color: '#2196F3'}}>{log}</Text>;
                            }
                            // 명령 응답 성공 로그 (녹색)
                            else if (log.includes('명령 응답 [성공]') || log.includes('SUCCESS')) {
                              return <Text style={{fontWeight: 'bold', color: '#00c663'}}>{log}</Text>;
                            }
                            // 명령 응답 실패 로그 (빨간색)
                            else if (log.includes('명령 응답 [실패]') || log.includes('FAIL')) {
                              return <Text style={{fontWeight: 'bold', color: '#F44336'}}>{log}</Text>;
                            }
                            // 바이크 데이터 로그 (하늘색)
                            else if (log.includes('바이크 데이터:')) {
                              return <Text style={{color: '#03A9F4'}}>{log}</Text>;
                            }
                            // 저항 변경 로그 (보라색)
                            else if (log.includes('Resistance changed')) {
                              return <Text style={{fontWeight: 'bold', color: '#9C27B0'}}>{log}</Text>;
                            }
                            // 일반 로그 (기본 색상)
                            return log;
                          })()}
                        </Text>
                      ))}
                    </View>
                  </ScrollView>
                )}
              </>
            ) : (
              <Text style={styles.noDataText}>상호작용 로그 없음</Text>
            )}
          </View>

          {/* Test Metadata */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>테스트 정보</Text>
            <View style={styles.metadataContainer}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>테스트 완료 여부:</Text>
                <Text style={[
                  styles.infoValue, 
                  { color: results.testCompleted ? '#4CAF50' : '#F44336' }
                ]}>
                  {results.testCompleted ? '완료' : '미완료'}
                </Text>
              </View>
              {results.testCompletedTimestamp && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>완료 시간:</Text>
                  <Text style={styles.infoValue}>
                    {new Date(results.testCompletedTimestamp).toLocaleString()}
                  </Text>
                </View>
              )}
              {results.reportId && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>보고서 ID:</Text>
                  <Text style={styles.infoValue}>{results.reportId}</Text>
                </View>
              )}
            </View>
          </View>
        </View>      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1a2029', // Changed to match app theme
  },
  scrollViewContainer: {
    flex: 1,
  },
  container: {
    padding: 15,
    backgroundColor: '#1a2029', // Changed to match app theme
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#242c3b', // Changed to match app theme
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff', // Changed to white
  },
  closeButton: {
    padding: 8,
    backgroundColor: '#242c3b', // Changed to match app theme
    borderRadius: 5,
  },
  closeButtonText: {
    color: '#ffffff', // Changed to white
    fontSize: 16,
  },
  shareButton: {
    backgroundColor: '#00c663', // Changed to app green
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  shareButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 20,
    backgroundColor: '#242c3b', // Changed to match app theme
    padding: 15,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#00c663', // Changed to app green
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151', // Slightly lighter than background
    paddingBottom: 8,
  },
  deviceInfoContainer: {
    paddingVertical: 10,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff', // Changed to white
    marginBottom: 4,
  },
  deviceAddress: {
    fontSize: 14,
    color: '#9ca3af', // Changed to match app theme
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#374151', // Changed to match app theme
  },
  infoLabel: {
    fontSize: 15,
    color: '#9ca3af', // Changed to match app theme
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 15,
    color: '#ffffff', // Changed to white
    textAlign: 'right',
  },
  compatibilityRow: {
    marginTop: 8,
  },
  compatibilityBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
    minWidth: 100,
    alignItems: 'center',
  },
  compatibilityText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  reasonsContainer: {
    marginTop: 5,
  },
  reasonText: {
    fontSize: 14,
    color: '#ffffff', // Changed to white
    marginBottom: 5,
    lineHeight: 20,
  },
  issuesContainer: {
    marginTop: 5,
  },
  issueText: {
    fontSize: 14,
    color: '#ef4444', // Keep red for issues but use a darker shade
    marginBottom: 5,
    lineHeight: 20,
  },
  rangesContainer: {
    marginTop: 5,
  },
  rangeText: {
    fontSize: 14,
    color: '#ffffff', // Changed to white
    marginBottom: 4,
  },
  featuresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 5,
  },
  featureItem: {
    marginRight: 15,
    marginBottom: 8,
  },
  featureText: {
    fontSize: 14,
  },
  noDataText: {
    color: '#9ca3af', // Changed to match app theme
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 10,
  },
  dataFieldsTable: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#374151', // Changed to match app theme
    borderRadius: 5,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1a2029', // Changed to match app theme
    paddingVertical: 8,
    paddingHorizontal: 5,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  tableHeaderCell: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#00c663', // Changed to app green
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#374151', // Changed to match app theme
  },
  tableCell: {
    fontSize: 13,
    color: '#ffffff', // Changed to white
    textAlign: 'center',
  },
  controlTestsContainer: {
    marginTop: 5,
  },
  controlTestItem: {
    backgroundColor: '#1a2029', // Changed to match app theme
    padding: 12,
    borderRadius: 6,
    marginBottom: 10,
  },
  controlTestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  commandTypeContainer: {
    flex: 1,
  },
  commandTypeLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff', // Changed to white
  },
  controlTestName: {
    fontSize: 12,
    color: '#9ca3af', // Changed to match app theme
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  controlTestDetails: {
    fontSize: 13,
    color: '#9ca3af', // Changed to match app theme
    marginBottom: 8,
    fontStyle: 'italic',
  },
  testInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
  },
  controlTestTimestamp: {
    fontSize: 12,
    color: '#9ca3af', // Changed to match app theme
  },
  testStatusIcon: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  resistanceChangesTable: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#374151', // Changed to match app theme
    borderRadius: 5,
  },
  metadataContainer: {
    backgroundColor: '#1a2029',
    borderRadius: 8,
    padding: 12,
  },
  logScrollContainer: {
    maxHeight: 400,
    borderColor: '#374151', // Changed to match app theme
    borderWidth: 1,
    borderRadius: 5,
    marginTop: 10,
  },
  logContainer: {
    padding: 10,
    backgroundColor: '#1a2029', // Changed to match app theme
  },
  logEntry: {
    fontSize: 13,
    color: '#ffffff', // Changed to white
    marginBottom: 6,
    fontFamily: 'monospace',
  },
  logActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  toggleLogButton: {
    backgroundColor: '#00c663', // Changed to app green
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 5,
    alignItems: 'center',
    flex: 1,
    marginRight: 5,
  },
  toggleLogButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  copyLogButton: {
    backgroundColor: '#242c3b', // Changed to darker theme color
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 5,
    alignItems: 'center',
    flex: 1,
    marginLeft: 5,
  },
  copyLogButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
});

export default TestReportScreen;
