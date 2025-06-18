// TestScreen.tsx - FTMS Test Screen Component
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { TestResults, formatRangeInfo } from '../FtmsTestReport';
import { FTMSTester } from '../FtmsTester';
import { Device } from 'react-native-ble-plx';
import { FTMSManager } from '../FtmsManager'; // Your existing manager
import TestReportScreen from './TestReportScreen';
import LogDisplay from '../LogDisplay'; // Import the Log Display component
import { useSafeAreaStyles, Colors } from '../styles/commonStyles';
import Toast from 'react-native-root-toast';

// Helper function to get compatibility color based on level
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
      return '#666666';
  }
};

interface TestScreenProps {
  device: Device;
  ftmsManager: FTMSManager;
  onClose: () => void;
  isDeviceConnected: boolean;
}

const TestScreen: React.FC<TestScreenProps> = ({ device, ftmsManager, onClose, isDeviceConnected }) => {
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('테스트 준비 완료');
  const [isRunning, setIsRunning] = useState(false);
  const [testCompleted, setTestCompleted] = useState(false);
  const [testResults, setTestResults] = useState<TestResults | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [realtimeLogs, setRealtimeLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const logScrollViewRef = useRef<ScrollView>(null);
  const testerRef = useRef<FTMSTester | null>(null);
  const safeAreaStyles = useSafeAreaStyles();
  
  // Animation values
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;  useEffect(() => {
    // Initialize the FTMSTester
    testerRef.current = new FTMSTester(ftmsManager);
    
    // Entrance animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
    
    // Set up log listener to capture logs in real-time
    const originalLogs = ftmsManager.getLogs();
    if (originalLogs.length > 0) {
      const formattedLogs = originalLogs.map(log => 
        `${new Date(log.timestamp).toLocaleTimeString()} - ${log.message}`
      );
      setRealtimeLogs(formattedLogs);
    }
    
    // Set up log callback to get real-time updates
    ftmsManager.setLogCallback((logs) => {
      const formattedLogs = logs.map(log => 
        `${new Date(log.timestamp).toLocaleTimeString()} - ${log.message}`
      );
      setRealtimeLogs(formattedLogs);
      
      // Scroll to bottom on update
      if (logScrollViewRef.current && showLogs) {
        setTimeout(() => {
          logScrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    });

    return () => {
      // Clean up if needed
      if (isRunning && testerRef.current) {
        testerRef.current.stopTest();
      }
    };
  }, [ftmsManager, showLogs, fadeAnim, scaleAnim, slideAnim]);

  const handleStartTest = async () => {
    try {
      if (!testerRef.current) {
        testerRef.current = new FTMSTester(ftmsManager);
      }

      setIsRunning(true);
      setTestCompleted(false);
      setProgress(0);
      setMessage('테스트 시작 중...');      // Run the test with progress updates
      const results = await testerRef.current.runDeviceTest(
        device,
        30000, // 30 seconds test
        (progress, message) => {
          setProgress(progress);
          setMessage(message);
          
          // Animate progress bar
          Animated.timing(progressAnim, {
            toValue: progress,
            duration: 300,
            useNativeDriver: false,
          }).start();
        },
        (results) => {
          // Test completed callback
          setTestResults(results);
          setTestCompleted(true);
          setIsRunning(false);
          
          // Completion animation
          Animated.sequence([
            Animated.timing(progressAnim, {
              toValue: 100,
              duration: 500,
              useNativeDriver: false,
            }),
            Animated.spring(scaleAnim, {
              toValue: 1.05,
              tension: 100,
              friction: 3,
              useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
              toValue: 1,
              tension: 100,
              friction: 3,
              useNativeDriver: true,
            }),
          ]).start();
        }
      );
    } catch (error) {
      console.error('Test error:', error);
      Alert.alert(
        '테스트 오류',
        `테스트 실행 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`
      );
      setIsRunning(false);
    }
  };  const handleStopTest = async () => {
    if (testerRef.current) {
      testerRef.current.stopTest();
      setIsRunning(false);
      setMessage('테스트가 중지되었습니다.');
    }
    
    // 기기와 연결 해제
    try {
      await ftmsManager.disconnectDevice();
      setMessage('테스트가 중지되고 기기와 연결이 해제되었습니다.');
      
      // 토스트 메시지 표시
      Toast.show('기기와의 연결이 해제되었습니다.', {
        duration: Toast.durations.SHORT,
        position: Toast.positions.BOTTOM,
        shadow: true,
        animation: true,
        hideOnPress: true,
        delay: 0,
        backgroundColor: '#333',
        textColor: '#fff',
      });
    } catch (error) {
      console.error('Disconnect error during stop:', error);
      setMessage('테스트가 중지되었습니다. (연결 해제 중 오류 발생)');
    }
  };
  const handleBackPress = async () => {
    // 테스트가 실행 중이면 먼저 중지
    if (testerRef.current && isRunning) {
      testerRef.current.stopTest();
      setIsRunning(false);
    }
    
    // 기기와 연결 해제
    try {
      await ftmsManager.disconnectDevice();
      
      // 토스트 메시지 표시
      Toast.show('기기와의 연결이 해제되었습니다.', {
        duration: Toast.durations.SHORT,
        position: Toast.positions.BOTTOM,
        shadow: true,
        animation: true,
        hideOnPress: true,
        delay: 0,
        backgroundColor: '#333',
        textColor: '#fff',
      });
    } catch (error) {
      console.error('Disconnect error during back:', error);
    }
    
    // 모드 선택 화면으로 돌아가기
    onClose();
  };

  const handleViewReport = () => {
    setShowReport(true);
  };

  const handleCloseReport = () => {
    setShowReport(false);
  };

  // Render the compatibility badge
  const renderCompatibilityBadge = () => {    if (!testResults || !testResults.compatibilityLevel) return null;

    const badgeColor = getCompatibilityColor(testResults.compatibilityLevel);

    return (
      <View style={[styles.compatibilityBadge, { backgroundColor: badgeColor }]}>
        <Text style={[styles.compatibilityText, { color: '#FFFFFF' }]}>
          {testResults.compatibilityLevel}
        </Text>
      </View>
    );
  };
  // Toggle real-time log display
  const toggleLogs = () => {
    setShowLogs(!showLogs);
  };    return (
    <View style={safeAreaStyles.safeContainerMinPadding}>
      <Animated.View 
        style={[
          { opacity: fadeAnim },
          { transform: [{ scale: scaleAnim }, { translateY: slideAnim }] }
        ]}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollViewContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            <View style={styles.header}>
              <View style={styles.headerContent}>
                <Text style={styles.title}>Yafit 호환성 테스트</Text>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>
                    {device.name || 'Unknown Device'}
                  </Text>
                  <Text style={styles.deviceId}>
                    ID: {device.id.substring(0, 8)}...
                  </Text>
                </View>
              </View>
              <View style={styles.headerIcon}>
                <MaterialCommunityIcons name="test-tube" size={28} color="#ffffff" />
              </View>
            </View>
            
            {/* Toggle Logs Button */}
            <TouchableOpacity 
              style={[styles.toggleLogButton, showLogs && styles.toggleLogButtonActive]} 
              onPress={toggleLogs}              activeOpacity={0.8}
            >
              <View style={styles.buttonContent}>
                <Ionicons 
                  name={showLogs ? "list" : "analytics"} 
                  size={18} 
                  color={showLogs ? "#ffffff" : "#00c663"} 
                />
                <Text style={[styles.toggleLogButtonText, showLogs && styles.toggleLogButtonTextActive]}>
                  {showLogs ? '로그 숨기기' : '실시간 로그 보기'}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.progressSection}>
              <View style={styles.progressContainer}>
                <View style={styles.progressBarBackground}>
                  <Animated.View
                    style={[
                      styles.progressBarFill,
                      {
                        width: progressAnim.interpolate({
                          inputRange: [0, 100],
                          outputRange: ['0%', '100%'],
                          extrapolate: 'clamp',
                        }),
                        backgroundColor: isRunning ? '#00c663' : testCompleted ? '#4CAF50' : '#00c663',
                      },
                    ]}
                  />
                  {isRunning && (
                    <View style={styles.progressGlow} />
                  )}
                </View>
                <View style={styles.progressInfo}>
                  <Text style={styles.progressText}>{progress.toFixed(0)}%</Text>
                  {isRunning && (
                    <ActivityIndicator 
                      size="small" 
                      color="#00c663" 
                      style={styles.progressSpinner}
                    />
                  )}
                </View>
              </View>
              <View style={styles.statusContainer}>
                <Text style={styles.statusMessage}>{message}</Text>
                {testCompleted && (
                  <View style={styles.completionBadgeContainer}>
                    <Icon name="check-circle" size={20} color="#4CAF50" />
                    <Text style={styles.completionBadge}>완료</Text>
                  </View>
                )}
              </View>
            </View>          {testCompleted && testResults && (
            <Animated.View style={[styles.resultsSummary, { opacity: fadeAnim }]}>
              {renderCompatibilityBadge()}

              {/* 결과 메시지를 맨 위에 표시 */}
              {testResults.reasons && testResults.reasons.length > 0 && (
                <View style={styles.resultMessageContainer}>
                  <View style={styles.resultMessageHeader}>
                    <MaterialCommunityIcons name="information" size={20} color="#00c663" />
                    <Text style={styles.resultMessageTitle}>테스트 결과</Text>
                  </View>
                  <View style={styles.resultMessageContent}>
                    <Text style={styles.resultMessageText}>{testResults.reasons[0]}</Text>
                  </View>
                </View>
              )}

              <Text style={styles.sectionTitle}>테스트 상세 정보</Text>

              <View style={styles.detailsContainer}>
                <View style={styles.detailCard}>
                  <MaterialCommunityIcons name="connection" size={20} color="#00c663" />
                  <Text style={styles.detailLabel}>
                    지원 프로토콜: {testResults.supportedProtocols.join(', ')}
                  </Text>
                </View>
                {testResults.supportRanges && (
                  <View style={styles.rangesCard}>
                    <View style={styles.cardHeader}>
                      <Ionicons name="analytics" size={18} color="#00c663" />
                      <Text style={styles.detailSectionTitle}>지원 범위</Text>
                    </View>
                    <View style={styles.rangesContainer}>
                      {testResults.supportRanges.speed && (
                        <Text style={styles.rangeText}>
                          {formatRangeInfo(testResults.supportRanges.speed, 'speed')}
                        </Text>
                      )}
                      {testResults.supportRanges.incline && (
                        <Text style={styles.rangeText}>
                          {formatRangeInfo(testResults.supportRanges.incline, 'incline')}
                        </Text>
                      )}                      {testResults.supportRanges.resistance && (
                        <Text style={styles.rangeText}>
                          {formatRangeInfo(testResults.supportRanges.resistance, 'resistance')}
                        </Text>
                      )}
                      {testResults.supportRanges.power && (
                        <Text style={styles.rangeText}>
                          {formatRangeInfo(testResults.supportRanges.power, 'power')}
                        </Text>
                      )}
                    </View>
                  </View>
                )}
                {testResults.dataFields && (
                  <View style={styles.dataFieldsCard}>
                    <View style={styles.cardHeader}>
                      <MaterialCommunityIcons name="chart-line-variant" size={18} color="#00c663" />
                      <Text style={styles.detailSectionTitle}>감지된 데이터 필드</Text>
                    </View>
                    <View style={styles.dataFieldsGrid}>
                      {Object.entries(testResults.dataFields)
                        .filter(([_, field]) => field.detected)
                        .map(([name, field]) => (
                          <View key={name} style={styles.dataFieldItem}>
                            <Text style={styles.dataFieldName}>{name}</Text>
                            <Text style={styles.dataFieldValue}>
                              {field.currentValue !== undefined ? field.currentValue : 'N/A'}
                              {field.minValue !== undefined && field.maxValue !== undefined
                                ? ` (${field.minValue}-${field.maxValue})`
                                : ''}
                            </Text>
                          </View>
                        ))}
                    </View>
                  </View>                )}
              </View>
              <TouchableOpacity
                style={styles.viewReportButton}
                onPress={handleViewReport}
                activeOpacity={0.8}
              >
                <Icon name="description" size={18} color="#00c663" />
                <Text style={styles.viewReportButtonText}>전체 보고서 보기</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          <View style={styles.buttonContainer}>
            <View style={styles.actionButtonContainer}>
              {!isRunning && !testCompleted && (                <TouchableOpacity
                  style={styles.startButton}
                  onPress={handleStartTest}
                  activeOpacity={0.8}
                >
                  <Icon name="play-arrow" size={24} color="#ffffff" />
                  <Text style={styles.startButtonText}>테스트 시작</Text>
                </TouchableOpacity>
              )}

              {isRunning && (                <TouchableOpacity
                  style={styles.stopButton}
                  onPress={handleStopTest}
                  activeOpacity={0.8}
                >
                  <Icon name="stop" size={24} color="#ffffff" />
                  <Text style={styles.stopButtonText}>테스트 중단</Text>
                </TouchableOpacity>
              )}
            </View>              <TouchableOpacity
              style={styles.backButton}
              onPress={handleBackPress}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-back" size={20} color="#ffffff" />
              <Text style={styles.backButtonText}>돌아가기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      </Animated.View>

      {/* Report Modal */}
      <Modal
        visible={showReport}
        animationType="slide"
        transparent={false}>
        {testResults && (
          <TestReportScreen
            results={testResults}
            onClose={handleCloseReport}
          />
        )}
      </Modal>
        {/* Real-time Log Display */}
      <LogDisplay 
        logs={realtimeLogs}
        visible={showLogs}
        onClose={toggleLogs}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1a2029',
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },  container: {
    flex: 1,
    padding: 8,
    backgroundColor: '#1a2029',
  },header: {
    marginBottom: 24,
    backgroundColor: '#242c3b',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  headerContent: {
    flex: 1,
  },
  headerIcon: {
    width: 50,
    height: 50,
    backgroundColor: '#00c663',
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },  iconText: {
    fontSize: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00c663',
    marginBottom: 8,
  },
  deviceInfo: {
    marginTop: 4,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  deviceId: {
    fontSize: 14,
    color: '#9ca3af',
    fontFamily: 'monospace',
  },  toggleLogButton: {
    backgroundColor: '#242c3b',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#374151',
  },
  toggleLogButtonActive: {
    backgroundColor: '#00c663',
    borderColor: '#00c663',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonIcon: {
    marginRight: 12,
  },
  toggleLogButtonText: {
    color: '#00c663',
    fontWeight: '600',
    fontSize: 16,
    marginLeft: 12,
  },
  toggleLogButtonTextActive: {
    color: '#fff',
  },  progressSection: {
    backgroundColor: '#242c3b',
    borderRadius: 16,
    padding: 16,
    marginVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  progressContainer: {
    marginBottom: 16,
  },  progressBarBackground: {
    height: 16,
    backgroundColor: '#374151',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 7,
    shadowColor: '#00c663',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
    position: 'relative',
  },
  progressGlow: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 6,
    opacity: 0.8,
  },
  progressInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  progressText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  progressSpinner: {
    marginLeft: 10,
  },  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusMessage: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  completionBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  completionBadge: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },  resultsSummary: {
    backgroundColor: '#242c3b',
    borderRadius: 16,
    padding: 16,
    marginVertical: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  compatibilityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  compatibilityText: {
    fontWeight: 'bold',
    fontSize: 14,
  },  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  // 새로운 결과 메시지 스타일
  resultMessageContainer: {
    backgroundColor: '#1a2029',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#00c663',
  },
  resultMessageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultMessageTitle: {
    color: '#00c663',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  resultMessageContent: {
    paddingLeft: 4,
  },
  resultMessageText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
  reasonsContainer: {
    backgroundColor: '#1a2029',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },  reasonBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
    marginTop: 5,
  },
  reasonText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  detailsContainer: {
    marginVertical: 8,
  },
  detailCard: {
    backgroundColor: '#1a2029',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },  detailIcon: {
    marginRight: 12,
  },
  detailLabel: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  rangesCard: {
    backgroundColor: '#1a2029',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  dataFieldsCard: {
    backgroundColor: '#1a2029',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardIcon: {
    marginRight: 12,
  },
  detailSectionTitle: {
    color: '#00c663',
    fontSize: 16,
    fontWeight: '600',
  },
  rangesContainer: {
    paddingLeft: 8,
  },
  rangeText: {
    color: '#fff',
    fontSize: 13,
    marginBottom: 4,
    paddingVertical: 2,
  },
  dataFieldsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  dataFieldItem: {
    backgroundColor: '#242c3b',
    borderRadius: 8,
    padding: 12,
    margin: 4,
    minWidth: '45%',
    borderLeftWidth: 3,
    borderLeftColor: '#00c663',
  },
  dataFieldName: {
    color: '#00c663',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  dataFieldValue: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  dataFieldsContainer: {
    marginTop: 8,
  },
  dataFieldText: {
    color: '#fff',
    fontSize: 13,
    marginLeft: 8,
    marginBottom: 2,
  },
  viewReportButton: {
    backgroundColor: '#374151',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },  viewReportButtonIcon: {
    marginRight: 12,
  },
  viewReportButtonText: {
    color: '#00c663',
    fontWeight: '600',
    fontSize: 16,
    marginLeft: 12,
  },
  buttonContainer: {
    marginTop: 24,
  },
  actionButtonContainer: {
    marginBottom: 16,
  },
  startButton: {
    backgroundColor: '#00c663',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: '#00c663',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  startButtonIcon: {
    marginRight: 12,
  },
  startButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    marginLeft: 12,
  },
  stopButton: {
    backgroundColor: '#e53e3e',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: '#e53e3e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  stopButtonIcon: {
    marginRight: 12,
  },
  stopButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    marginLeft: 12,
  },
  backButton: {
    backgroundColor: '#374151',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    alignSelf: 'center',
    width: '60%',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  backButtonIcon: {
    marginRight: 12,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
    marginLeft: 12,
  },
  logContainer: {
    backgroundColor: '#242c3b',
    borderRadius: 8,
    padding: 12,
    marginVertical: 10,
    maxHeight: 250,
  },
  logScrollView: {
    flex: 1,
  },
  logEntryContainer: {
    marginBottom: 4,
  },
  logEntry: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#fff',
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
  },
  logEntryResistance: {
    fontWeight: 'bold',
    color: '#9C27B0',
  },
});

export default TestScreen;
