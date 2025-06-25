// TestReportScreen.tsx - FTMS Detailed Test Report Component
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Clipboard from '@react-native-clipboard/clipboard'; // Added for clipboard functionality
import { TestResults, formatRangeInfo } from '../FtmsTestReport';
import { useSafeAreaStyles, Colors } from '../styles/commonStyles';

interface TestReportScreenProps {
  results: TestResults;
  onClose: () => void;
}

const TestReportScreen: React.FC<TestReportScreenProps> = ({ results, onClose }) => {
  const safeAreaStyles = useSafeAreaStyles();
  const [showFullLog, setShowFullLog] = React.useState(false);
  const [showFullReasons, setShowFullReasons] = React.useState(true);
  
  // Animation values
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(30)).current;
  
  React.useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Function to share the test report
  const handleShare = async () => {
    try {
      // Create a comprehensive human-readable report
      const deviceName = results.deviceInfo.name || 'Unknown Device';
      const deviceAddress = results.deviceInfo.address || 'Unknown Address';
      const protocols = results.supportedProtocols.join(', ') || '없음';
      const compatibility = results.compatibilityLevel || '판정되지 않음';
      const testDate = new Date(results.testCompletedTimestamp || Date.now()).toLocaleString('ko-KR');
      
      // --- Formal, detailed report construction ---
      let deviceInfoSection = `장치 정보\n- 장치명: ${deviceName}\n- 주소: ${deviceAddress}`;
      if (results.deviceInfo.protocol) deviceInfoSection += `\n- 주요 프로토콜: ${results.deviceInfo.protocol}`;
      if (results.deviceInfo.services && results.deviceInfo.services.length > 0) deviceInfoSection += `\n- 서비스: ${results.deviceInfo.services.join(', ')}`;
      deviceInfoSection += `\n- 지원 프로토콜: ${protocols}`;

      let testMetaSection = `테스트 정보\n- 테스트 완료: ${results.testCompleted ? '예' : '아니오'}`;
      testMetaSection += `\n- 테스트 일시: ${testDate}`;
      if (results.reportId) testMetaSection += `\n- 보고서 ID: ${results.reportId}`;

      let compatibilitySection = `호환성 판정: ${compatibility}`;
      if (results.reasons && results.reasons.length > 0) {
        compatibilitySection += `\n- 판정 사유: ${results.reasons.join('; ')}`;
      }

      // Control test details
      let controlTestsSection = '';
      if (results.controlTests && Object.keys(results.controlTests).length > 0) {
        controlTestsSection = '\n[제어 테스트 결과]';
        Object.entries(results.controlTests).forEach(([name, test]) => {
          const commandLabels = {
            'SET_RESISTANCE_LEVEL': '저항 레벨 설정',
            'SET_TARGET_POWER': '목표 파워 설정',
            'SET_SIM_PARAMS': '경사도 시뮬레이션'
          };
          const commandLabel = commandLabels[name as keyof typeof commandLabels] || name;
          const statusText = test.status === 'OK' ? '성공' : test.status === 'Failed' ? '실패' : '미지원';
          controlTestsSection += `\n- ${commandLabel} (${name}): ${statusText}`;
          if (test.details) controlTestsSection += ` (상세: ${test.details})`;
          controlTestsSection += `, 테스트 시간: ${new Date(test.timestamp).toLocaleTimeString()}`;
        });
      }

      // Limitations/issues
      let limitationsSection = '';
      const limitations: string[] = [];
      if (results.supportedProtocols.includes('REBORN')) {
        limitations.push('Reborn 프로토콜은 제어 명령이 불가능합니다. SIM, ERG, 유저의 기어 변경이 불가능합니다.');
      }
      if (results.supportedProtocols.includes('FITSHOW')) {
        limitations.push('FitShow 프로토콜은 Yafit에서 제어명령을 지원하지 않습니다. ERG, SIM, 유저의 기어 제어가 불가능합니다.');
      }
      if (results.compatibilityLevel === '불가능') {
        if (!results.dataFields?.cadence?.detected) limitations.push('Cadence가 검출되지 않음 (RPM)');
        if (!results.supportedProtocols.includes('FTMS') && !results.supportedProtocols.includes('CSC')) limitations.push('지원하지 않는 프로토콜');
        if (results.issuesFound?.some(issue => issue.includes('중단'))) limitations.push('검사가 중단됨');
      } else if (results.compatibilityLevel === '부분 호환' || results.compatibilityLevel === '수정 필요') {
        if (!results.dataFields?.resistance?.detected) limitations.push('Resistance가 검출되지 않아 기본 기어값으로 설정');
        if (results.controlTests?.SET_RESISTANCE_LEVEL?.status === 'Failed') limitations.push('기어 변경 불가능');
        if (results.controlTests?.SET_TARGET_POWER?.status === 'Failed') limitations.push('ERG 모드 사용 불가능');
        if (results.controlTests?.SET_SIM_PARAMS?.status === 'Failed') limitations.push('SIM 모드 사용 불가능');
        if (results.resistanceChanges && results.resistanceChanges.filter(change => !change.command).length >= 5) limitations.push('저항값이 명령 없이 자동 변화함');
      }
      if (results.issuesFound && results.issuesFound.length > 0) limitations.push(...results.issuesFound);
      if (limitations.length > 0) {
        const sectionTitle = results.compatibilityLevel === '불가능' ? '[불가능 사유]' : '[제한사항]';
        limitationsSection = `\n${sectionTitle}\n- ${limitations.join('\n- ')}`;
      }

      // Features
      let featuresSection = '';
      if (results.features && Object.keys(results.features).length > 0) {
        featuresSection = '\n[지원 기능]';
        Object.entries(results.features).forEach(([name, supported]) => {
          featuresSection += `\n- ${name}: ${supported ? '지원' : '미지원'}`;
        });
      }

      // Supported ranges
      let supportRangesSection = '';
      if (results.supportRanges && Object.keys(results.supportRanges).length > 0) {
        supportRangesSection = '\n[지원 범위]';
        if (results.supportRanges.speed) {
          const r = results.supportRanges.speed;
          supportRangesSection += `\n- 속도: ${r.min} ~ ${r.max} km/h (증분: ${r.increment})`;
        }
        if (results.supportRanges.incline) {
          const r = results.supportRanges.incline;
          supportRangesSection += `\n- 경사도: ${r.min} ~ ${r.max} % (증분: ${r.increment})`;
        }
        if (results.supportRanges.resistance) {
          const r = results.supportRanges.resistance;
          supportRangesSection += `\n- 저항: ${r.min} ~ ${r.max} 레벨 (증분: ${r.increment})`;
        }
        if (results.supportRanges.power) {
          const r = results.supportRanges.power;
          supportRangesSection += `\n- 파워: ${r.min} ~ ${r.max} W (증분: ${r.increment})`;
        }
      }

      // Data fields
      let dataFieldsSection = '';
      if (results.dataFields && Object.keys(results.dataFields).length > 0) {
        const detectedFields = Object.entries(results.dataFields).filter(([_, field]) => field.detected);
        if (detectedFields.length > 0) {
          dataFieldsSection = '\n[감지된 데이터 필드]';
          detectedFields.forEach(([name, field]) => {
            const currentValue = field.currentValue !== undefined ? field.currentValue : 'N/A';
            const range = field.minValue !== undefined && field.maxValue !== undefined ? ` (범위: ${field.minValue} ~ ${field.maxValue})` : '';
            dataFieldsSection += `\n- ${name}: ${currentValue}${range}`;
          });
        }
      }

      // Resistance changes summary
      let resistanceChangesSection = '';
      if (results.resistanceChanges && results.resistanceChanges.length > 0) {
        resistanceChangesSection = '\n[저항 변화 이력]';
        results.resistanceChanges.forEach((change, idx) => {
          const time = new Date(change.timestamp).toLocaleTimeString();
          resistanceChangesSection += `\n- 시간: ${time}, 이전값: ${change.oldValue ?? '-'}, 현재값: ${change.newValue}, 원인: ${change.command || '자동 변경'}`;
        });
      }

      const textReport = `\n\n${deviceInfoSection}\n\n${testMetaSection}\n\n${compatibilitySection}\n${limitationsSection}\n${controlTestsSection}\n${featuresSection}\n${supportRangesSection}\n${dataFieldsSection}\n${resistanceChangesSection}`;
      
      await Share.share({
        title: `IsYafit 호환성 보고서 - ${deviceName}`,
        message: textReport.trim(),
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
                  <Text style={styles.statusText}>
                    {test.status === 'OK' ? '성공' :
                     test.status === 'Failed' ? '실패' :
                     test.status === 'Pending' ? '대기 중' : test.status}
                  </Text>
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
  };  // Function to render range cards
  const renderRangeCard = (range: any, type: string, label: string, unit: string, icon: string) => {
    if (!range || (range.min === undefined && range.max === undefined)) {
      return null;
    }

    const min = range.min || 0;
    const max = range.max || 0;
    const current = range.current;
    
    return (
      <View style={styles.rangeCard}>
        <View style={styles.rangeCardHeader}>
          <MaterialCommunityIcons name={icon} size={20} color="#00c663" />
          <Text style={styles.rangeCardTitle}>{label}</Text>
        </View>
        <View style={styles.rangeValues}>
          <View style={styles.rangeValueItem}>
            <Text style={styles.rangeValueLabel}>최소</Text>
            <Text style={styles.rangeValueText}>{min}{unit}</Text>
          </View>
          <Text style={styles.rangeSeparator}>~</Text>
          <View style={styles.rangeValueItem}>
            <Text style={styles.rangeValueLabel}>최대</Text>
            <Text style={styles.rangeValueText}>{max}{unit}</Text>
          </View>
          {current !== undefined && (
            <>
              <Text style={styles.rangeSeparator}>|</Text>
              <View style={styles.rangeValueItem}>
                <Text style={styles.rangeValueLabel}>현재</Text>
                <Text style={[styles.rangeValueText, styles.currentValue]}>{current}{unit}</Text>
              </View>
            </>
          )}
        </View>
      </View>
    );
  };

  const renderResistanceChanges = () => {
    if (!results.resistanceChanges || results.resistanceChanges.length === 0) {
      return (
        <Text style={styles.noDataText}>저항 변화 데이터 없음</Text>
      );
    }

    return (      <View style={styles.resistanceChangesTable}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>시간</Text>
          <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>이전값</Text>
          <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>현재값</Text>
          <Text style={[styles.tableHeaderCell, { flex: 2 }]}>변경 원인</Text>
        </View>

        {results.resistanceChanges.map((change, index) => {
          // 명령어에 따른 스타일 적용
          const isCommandChange = change.command && change.command !== '자동 변경';
          const textColor = isCommandChange ? '#00c663' : '#fff';
          const bgColor = isCommandChange ? 'rgba(0, 198, 99, 0.1)' : 'transparent';
          
          return (            <View 
              key={index} 
              style={[
                styles.tableRow, 
                { backgroundColor: bgColor }
              ]}
            >
              <Text style={[styles.tableCell, { flex: 1.2 }]}>
                {new Date(change.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
              </Text>
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
      </View>    );
  };

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
  };  // Helper function to get compatibility color based on level
const getCompatibilityColor = (compatibilityLevel?: string): string => {
  switch (compatibilityLevel) {
    case '완전 호환':
      return '#4CAF50';
    case '부분 호환':
      return '#FF9800';
    case '수정 필요':
      return '#2196F3';
    case '불가능':
      return '#F44336';
    default:
      return '#666';
  }
};

  // Helper function to extract reason codes from detailed reasons
  return (
    <View style={safeAreaStyles.safeContainerMinPadding}>
      <Animated.View 
        style={[
          styles.animatedContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }]
          }
        ]}
      >        <ScrollView 
          style={styles.scrollViewContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            <View style={styles.header}>
              <View style={styles.titleContainer}>
                <MaterialCommunityIcons name="file-chart" size={28} color="#00c663" />
                <Text style={styles.title}>테스트 보고서</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.8}>
                <Icon name="close" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>            {/* Action Buttons */}
            <View style={styles.actionButtonsContainer}>
              <TouchableOpacity onPress={handleShare} style={styles.shareButton} activeOpacity={0.8}>
                <Ionicons name="share-outline" size={20} color="#ffffff" />
                <Text style={styles.shareButtonText}>보고서 공유</Text>
              </TouchableOpacity>
            </View>            {/* Device Info Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="devices" size={24} color="#00c663" />
                <Text style={styles.sectionTitle}>장치 정보</Text>
              </View>
              <View style={styles.deviceInfoContainer}>
                <View style={styles.deviceNameRow}>
                  <Text style={styles.deviceName}>
                    {results.deviceInfo.name || 'Unknown Device'}
                  </Text>
                  <View style={[
                    styles.compatibilityBadge,
                    {                      backgroundColor: 
                        results.compatibilityLevel === '완전 호환' ? '#4CAF50' :
                        results.compatibilityLevel === '부분 호환' ? '#FF9800' :
                        results.compatibilityLevel === '수정 필요' ? '#2196F3' : '#F44336'
                    }
                  ]}>                    <Text style={styles.compatibilityText}>
                      {results.compatibilityLevel || '평가 불가'}
                    </Text>
                  </View>
                </View>
                
                <Text style={styles.deviceAddress}>{results.deviceInfo.address}</Text>
                
                <View style={styles.infoGrid}>
                  <View style={styles.infoCard}>
                    <Text style={styles.infoCardLabel}>프로토콜</Text>
                    <Text style={styles.infoCardValue}>
                      {results.deviceInfo.protocol || '알 수 없음'}
                    </Text>
                  </View>                  <View style={styles.infoCard}>
                    <Text style={styles.infoCardLabel}>지원 프로토콜</Text>
                    <Text style={styles.infoCardValue}>
                      {results.supportedProtocols.join(', ') || '없음'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* 테스트 결과 메시지를 장치 정보 아래로 이동 */}
            {results.reasons && results.reasons.length > 0 && (
              <View style={styles.resultMessageSection}>
                <View style={styles.resultMessageHeader}>
                  <MaterialCommunityIcons name="information" size={24} color="#00c663" />
                  <Text style={styles.resultMessageTitle}>테스트 결과</Text>
                </View>
                <View style={styles.resultMessageContent}>                  {/* 판정 섹션 */}
                  <View style={styles.judgmentSection}>
                    <Text style={styles.judgmentText}>
                      {results.reasons && results.reasons.length > 0 ? results.reasons[0] : '판정 결과 없음'}
                    </Text>
                  </View>                  
                  {/* 제한사항 섹션 - 불가능한 경우 제외하고 표시 */}
                  {results.compatibilityLevel && 
                   results.compatibilityLevel !== '완전 호환' && 
                   results.compatibilityLevel !== '불가능' && (
                    <View style={styles.limitationSection}>
                      <Text style={styles.limitationTitle}>제한사항:</Text>
                        {(results.compatibilityLevel === '부분 호환' || results.compatibilityLevel === '수정 필요') && (
                        <>
                          {/* Reborn 프로토콜 제한사항 */}
                          {results.supportedProtocols.includes('REBORN') && (
                            <Text style={styles.limitationText}>• Reborn 프로토콜은 제어 명령이 불가능합니다. SIM,ERG,유저의 기어 변경이 불가능합니다.</Text>
                          )}
                          
                          {/* FitShow 프로토콜 제한사항 */}
                          {results.supportedProtocols.includes('FITSHOW') && (
                            <Text style={styles.limitationText}>• FitShow 프로토콜은 Yafit에서 제어명령을 지원하지 않습니다. ERG, SIM, 유저의 기어 제어가 불가능합니다.</Text>
                          )}
                          
                          {!results.dataFields?.resistance?.detected && (
                            <Text style={styles.limitationText}>• Resistance가 검출되지 않아 기본 기어값으로 설정</Text>
                          )}
                          {results.controlTests?.SET_RESISTANCE_LEVEL?.status === 'Failed' && (
                            <Text style={styles.limitationText}>• 기어 변경 불가능</Text>
                          )}
                          {results.controlTests?.SET_TARGET_POWER?.status === 'Failed' && (
                            <Text style={styles.limitationText}>• ERG 모드 사용 불가능</Text>
                          )}
                          {results.controlTests?.SET_SIM_PARAMS?.status === 'Failed' && (
                            <Text style={styles.limitationText}>• SIM 모드 사용 불가능</Text>
                          )}{results.resistanceChanges && results.resistanceChanges.filter(change => !change.command || change.command === '자동 변경').length >= 5 && (
                            <Text style={styles.limitationText}>• 의도하지 않은 저항 변경이 발생했습니다. 기기 자체 모드가 설정되어있는지 확인해주세요</Text>
                          )}
                        </>
                      )}
                      
                      {/* 기존 issuesFound 표시 (불가능이 아닌 경우에만) */}
                      {results.issuesFound && results.issuesFound.map((issue, index) => (
                        <Text key={`issue-${index}`} style={styles.limitationText}>
                          • {issue}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}
            {/* Compatibility Reasons - Collapsible */}
            {false && results.reasons && results.reasons.length > 0 && (
              <View style={styles.section}>                <TouchableOpacity 
                  style={styles.sectionHeader}
                  onPress={() => setShowFullReasons(!showFullReasons)}
                >
                  <Icon name="lightbulb-outline" size={24} color="#00c663" />
                  <Text style={styles.sectionTitle}>호환성 판정 세부사유</Text>
                  <Icon 
                    name={showFullReasons ? "expand-less" : "expand-more"} 
                    size={24} 
                    color="#666" 
                  />
                </TouchableOpacity>
                {showFullReasons && (
                  <View style={styles.reasonsContainer}>                    {results.reasons.map((reason, index) => (
                      <View key={index} style={styles.reasonItem}>
                        <View style={[
                          styles.reasonBullet, 
                          { backgroundColor: getCompatibilityColor(results.compatibilityLevel) }
                        ]} />
                        <Text style={styles.reasonText}>{reason}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          {/* Issues Found */}
          {results.issuesFound && results.issuesFound.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="error-outline" size={24} color="#ef4444" />
                <Text style={styles.sectionTitle}>문제점</Text>
              </View>
              <View style={styles.issuesContainer}>
                {results.issuesFound.map((issue, index) => (
                  <View key={index} style={styles.issueItem}>
                    <View style={styles.issueBullet} />
                    <Text style={styles.issueText}>{issue}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}          {/* Limitation Reasons - 제한 사유 (불가능한 경우 제외) */}
          {results.compatibilityLevel !== '불가능' && 
           results.controlTests && 
           Object.entries(results.controlTests).some(([_, test]) => test.status !== 'OK') && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="block" size={24} color="#FF9800" />
                <Text style={styles.sectionTitle}>제한 사유</Text>
              </View>
              <View style={styles.limitationReasonsContainer}>
                {Object.entries(results.controlTests)
                  .filter(([_, test]) => test.status !== 'OK')
                  .map(([name, test], index) => {                    const getReasonText = (commandName: string, status: string) => {
                      const commandLabels = {
                        'SET_RESISTANCE_LEVEL': '유저가 기어 조절 불가',
                        'SET_TARGET_POWER': 'ERG 모드 사용 불가', 
                        'SET_SIM_PARAMS': 'SIM 모드 사용 불가'
                      };
                      
                      const commandLabel = commandLabels[commandName as keyof typeof commandLabels] || commandName;
                      const statusReason = status === 'Failed' ? '미작동' : '미지원';
                      
                      return `${commandLabel} ⇒ ${commandName.toLowerCase()} ${statusReason}`;
                    };
                    
                    return (
                      <View key={index} style={styles.limitationReasonItem}>
                        <View style={styles.limitationReasonBullet} />
                        <Text style={styles.limitationReasonText}>
                          {getReasonText(name, test.status)}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            </View>
          )}

          {/* Support Ranges */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="speedometer-outline" size={24} color="#00c663" />
              <Text style={styles.sectionTitle}>지원 범위</Text>
            </View>
            {results.supportRanges && Object.keys(results.supportRanges).length > 0 ? (
              <View style={styles.rangesGrid}>
                {results.supportRanges.speed && 
                  renderRangeCard(results.supportRanges.speed, 'speed', '속도', ' km/h', 'speedometer')
                }
                {results.supportRanges.incline && 
                  renderRangeCard(results.supportRanges.incline, 'incline', '경사도', '%', 'slope-uphill')
                }
                {results.supportRanges.resistance && 
                  renderRangeCard(results.supportRanges.resistance, 'resistance', '저항', ' 레벨', 'dumbbell')
                }
                {results.supportRanges.power && 
                  renderRangeCard(results.supportRanges.power, 'power', '파워', 'W', 'flash')
                }
              </View>
            ) : (              <Text style={styles.noDataText}>지원 범위 데이터 없음</Text>
            )}
          </View>

          {/* Features */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="feature-search-outline" size={24} color="#00c663" />
              <Text style={styles.sectionTitle}>지원 기능</Text>
            </View>
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
            ) : (              <Text style={styles.noDataText}>지원 기능 데이터 없음</Text>
            )}
          </View>

          {/* Data Fields */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="database-outline" size={24} color="#00c663" />
              <Text style={styles.sectionTitle}>감지된 데이터 필드</Text>
            </View>
            {renderDataFields()}
          </View>

          {/* Control Tests */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="test-tube" size={24} color="#00c663" />
              <Text style={styles.sectionTitle}>제어 테스트 결과</Text>
            </View>            <View style={styles.controlTestsContainer}>
              {renderControlTests()}
            </View>
          </View>
          {/* Resistance Changes Log */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="chart-timeline-variant" size={24} color="#00c663" />
              <Text style={styles.sectionTitle}>저항 변화 로그</Text>
            </View>
            {renderResistanceChanges()}
          </View>          {/* Interaction Logs Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="console" size={24} color="#00c663" />
              <Text style={styles.sectionTitle}>상호작용 로그</Text>
              {results.interactionLogs && results.interactionLogs.length > 0 && (
                <View style={styles.logCountBadge}>
                  <Text style={styles.logCountText}>{results.interactionLogs.length}</Text>
                </View>
              )}
            </View>
            {results.interactionLogs && results.interactionLogs.length > 0 ? (
              <>
                <View style={styles.logActionsContainer}>
                  <TouchableOpacity
                    style={styles.toggleLogButton}
                    onPress={() => setShowFullLog(!showFullLog)}
                  >
                    <Text style={styles.toggleLogButtonText}>
                      {showFullLog ? '로그 숨기기' : '전체 로그 보기'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.copyLogButton}
                    onPress={handleCopyLogs}
                  >
                    <Text style={styles.copyLogButtonText}>로그 복사</Text>
                  </TouchableOpacity>
                </View>                {showFullLog && (
                  <ScrollView style={styles.logScrollContainer} nestedScrollEnabled={true}>
                    <View style={styles.logContainer}>
                      {results.interactionLogs.map((log, index) => {
                        // 로그 타입에 따른 스타일 결정
                        let additionalStyle = {};
                        
                        if (log.includes('명령 전송:')) {
                          additionalStyle = styles.logEntryCommand;
                        } else if (log.includes('명령 응답 [성공]') || log.includes('SUCCESS')) {
                          additionalStyle = styles.logEntrySuccess;
                        } else if (log.includes('명령 응답 [실패]') || log.includes('FAIL')) {
                          additionalStyle = styles.logEntryError;
                        } else if (log.includes('바이크 데이터:')) {
                          additionalStyle = styles.logEntryBikeData;
                        } else if (log.includes('Resistance changed')) {
                          additionalStyle = styles.logEntryResistance;
                        }
                        
                        return (
                          <View key={index} style={styles.logEntryContainer}>
                            <Text style={[styles.logEntry, additionalStyle]}>{log}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                )}
              </>
            ) : (              <Text style={styles.noDataText}>상호작용 로그 없음</Text>
            )}
          </View>

          {/* Test Metadata */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="info-outline" size={24} color="#00c663" />
              <Text style={styles.sectionTitle}>테스트 정보</Text>
            </View>
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
        </View>
      </ScrollView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1a2029',
  },
  animatedContainer: {
    flex: 1,
  },
  scrollViewContainer: {
    flex: 1,
  },  container: {
    padding: 10,
    backgroundColor: '#1a2029',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: '#242c3b',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },  headerIcon: {
    marginRight: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    flex: 1,
    marginLeft: 12,
  },
  closeButton: {
    width: 40,
    height: 40,
    backgroundColor: '#374151',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 16,
  },
  closeButtonIcon: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  actionButtonsContainer: {
    marginBottom: 20,
  },
  shareButton: {
    backgroundColor: '#00c663',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: '#00c663',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },  shareButtonIcon: {
    marginRight: 12,
  },
  shareButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  section: {
    marginBottom: 24,
    backgroundColor: '#242c3b',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },  sectionIcon: {
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#00c663',
    flex: 1,
    marginLeft: 12,
  },
  deviceInfoContainer: {
    paddingVertical: 10,
  },
  deviceNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    flex: 1,
    marginRight: 16,
  },
  deviceAddress: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 16,
    fontFamily: 'monospace',
    backgroundColor: '#1a2029',
    padding: 8,
    borderRadius: 6,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },  infoCard: {
    backgroundColor: '#1a2029',
    borderRadius: 12,
    padding: 16,
    flex: 1,
    minWidth: '45%',
  },
  infoCardLabel: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  infoCardValue: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  infoLabel: {
    fontSize: 15,
    color: '#9ca3af',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 15,
    color: '#ffffff',
    textAlign: 'right',
  },
  compatibilityRow: {
    marginTop: 8,
  },  compatibilityBadge: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },  compatibilityText: {
    color: '#ffffff',    fontWeight: 'bold',
    fontSize: 14,
  },  // 새로운 결과 메시지 스타일
  resultMessageSection: {
    backgroundColor: '#242c3b',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  resultMessageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  resultMessageTitle: {
    color: '#00c663',
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  resultMessageContent: {
    paddingLeft: 8,
  },
  resultMessageText: {
    color: '#ffffff',
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '500',
  },
  reasonsContainer: {
    backgroundColor: '#1a2029',
    borderRadius: 12,
    padding: 16,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },  reasonBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
    marginTop: 5,
  },
  reasonText: {
    fontSize: 14,
    color: '#ffffff',
    lineHeight: 20,
    flex: 1,
  },  issuesContainer: {
    backgroundColor: '#1a2029',
    borderRadius: 12,
    padding: 16,
  },
  issueItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  issueBullet: {
    width: 8,
    height: 8,
    backgroundColor: '#ef4444',
    borderRadius: 4,
    marginRight: 12,
    marginTop: 6,
  },
  issueText: {
    fontSize: 14,
    color: '#ef4444',
    lineHeight: 20,
    flex: 1,
  },
  rangesContainer: {
    marginTop: 5,
  },
  rangeText: {
    fontSize: 14,
    color: '#ffffff',
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
    color: '#9ca3af',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
    fontSize: 16,
  },
  dataFieldsTable: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1a2029',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  tableHeaderCell: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#00c663',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  tableCell: {
    fontSize: 13,
    color: '#ffffff',
    textAlign: 'center',
  },
  controlTestsContainer: {
    marginTop: 5,
  },  controlTestItem: {
    backgroundColor: '#1a2029',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  controlTestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  commandTypeContainer: {
    flex: 1,
  },
  commandTypeLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  controlTestName: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  statusText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  controlTestDetails: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 8,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  testInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  controlTestTimestamp: {
    fontSize: 12,
    color: '#9ca3af',
  },
  testStatusIcon: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  resistanceChangesTable: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    overflow: 'hidden',
  },
  metadataContainer: {
    backgroundColor: '#1a2029',
    borderRadius: 12,
    padding: 16,
  },
  logScrollContainer: {
    maxHeight: 400,
    borderColor: '#374151',
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 10,
    overflow: 'hidden',
  },
  logContainer: {
    padding: 16,
    backgroundColor: '#1a2029',
  },
  logEntry: {
    fontSize: 13,
    color: '#ffffff',
    marginBottom: 6,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  logActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
    gap: 12,
  },
  toggleLogButton: {
    backgroundColor: '#00c663',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    flex: 1,
    shadowColor: '#00c663',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  toggleLogButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  copyLogButton: {
    backgroundColor: '#374151',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },  copyLogButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  // Range cards styles
  rangesGrid: {
    gap: 12,
  },  rangeCard: {
    backgroundColor: '#1a2029',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  rangeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  rangeCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 8,
  },
  rangeValues: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  rangeValueItem: {
    alignItems: 'center',
    flex: 1,
  },
  rangeValueLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: '500',
  },
  rangeValueText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  currentValue: {
    color: '#00c663',
  },  rangeSeparator: {
    fontSize: 16,
    color: '#9ca3af',
    marginHorizontal: 8,
  },
  // Log count badge styles
  logCountBadge: {
    backgroundColor: '#00c663',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 12,
  },
  logCountText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Log entry styles (similar to TestScreen)
  logEntryContainer: {
    marginBottom: 4,
  },
  logEntryCommand: {
    fontWeight: 'bold',
    color: '#2196F3',
  },
  logEntrySuccess: {
    fontWeight: 'bold',
    color: '#00c663',
  },
  logEntryError: {
    fontWeight: 'bold',
    color: '#F44336',
  },
  logEntryBikeData: {
    color: '#03A9F4',
  },  logEntryResistance: {
    fontWeight: 'bold',
    color: '#9C27B0',
  },
  judgmentSection: {
    marginBottom: 12,
  },  judgmentText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  limitationSection: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  limitationTitle: {
    color: '#FF9800',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },  limitationText: {
    color: '#9ca3af',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  limitationReasonsContainer: {
    backgroundColor: '#1a2029',
    borderRadius: 12,
    padding: 16,
  },
  limitationReasonItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  limitationReasonBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF9800',
    marginRight: 12,
    marginTop: 5,
  },
  limitationReasonText: {
    color: '#ffffff',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
});

export default TestReportScreen;
