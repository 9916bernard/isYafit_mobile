// TestReportScreen.tsx - FTMS Detailed Test Report Component
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Share,
} from 'react-native';
import { TestResults, formatRangeInfo } from './FtmsTestReport';

interface TestReportScreenProps {
  results: TestResults;
  onClose: () => void;
}

const TestReportScreen: React.FC<TestReportScreenProps> = ({ results, onClose }) => {
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
                {new Date(change.timestamp).toLocaleTimeString()}
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>FTMS 호환성 테스트 보고서</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Text style={styles.shareButtonText}>공유</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.container}>
        {/* Device Information */}
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
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1a2029',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2d3748',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00c663',
  },
  headerButtons: {
    flexDirection: 'row',
  },
  shareButton: {
    backgroundColor: '#2d3748',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginRight: 8,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  closeButton: {
    backgroundColor: '#444',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  commandTypeContainer: {
    flexDirection: 'column',
    flex: 1,
  },
  commandTypeLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00c663',
    marginBottom: 2,
  },
  container: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 20,
    backgroundColor: '#242c3b',
    borderRadius: 8,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00c663',
    marginBottom: 12,
  },
  deviceInfoContainer: {
    backgroundColor: '#1a2029',
    borderRadius: 8,
    padding: 12,
  },
  deviceName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  deviceAddress: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  infoLabel: {
    color: '#aaa',
    fontSize: 14,
    width: 120,
  },
  infoValue: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  compatibilityRow: {
    alignItems: 'center',
  },
  compatibilityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
  },
  compatibilityText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  reasonsContainer: {
    backgroundColor: '#1a2029',
    borderRadius: 8,
    padding: 12,
  },
  reasonText: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 4,
  },
  issuesContainer: {
    backgroundColor: '#1a2029',
    borderRadius: 8,
    padding: 12,
  },
  issueText: {
    color: '#ff6b6b',
    fontSize: 14,
    marginBottom: 4,
  },
  rangesContainer: {
    backgroundColor: '#1a2029',
    borderRadius: 8,
    padding: 12,
  },
  rangeText: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 4,
  },
  featuresContainer: {
    backgroundColor: '#1a2029',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  featureItem: {
    width: '50%',
    marginBottom: 6,
  },
  featureText: {
    fontSize: 14,
  },
  noDataText: {
    color: '#aaa',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 12,
  },
  dataFieldsTable: {
    backgroundColor: '#1a2029',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#2d3748',
    padding: 8,
  },
  tableHeaderCell: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#2d3748',
    padding: 8,
  },
  tableCell: {
    color: '#fff',
    fontSize: 12,
  },
  controlTestsContainer: {
    backgroundColor: '#1a2029',
    borderRadius: 8,
    padding: 4,
  },
  controlTestItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#2d3748',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  controlTestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  controlTestName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  controlTestDetails: {
    color: '#ccc',
    fontSize: 12,
    marginBottom: 2,
  },
  controlTestTimestamp: {
    color: '#999',
    fontSize: 12,
  },  resistanceChangesTable: {
    backgroundColor: '#1a2029',
    borderRadius: 8,
    overflow: 'hidden',
  },
  metadataContainer: {
    backgroundColor: '#1a2029',
    borderRadius: 8,
    padding: 12,
  },
  testInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  testStatusIcon: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default TestReportScreen;
