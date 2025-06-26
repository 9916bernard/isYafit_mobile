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
  findNodeHandle,
  UIManager,
  TouchableWithoutFeedback,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LottieView from 'lottie-react-native';
import { TestResults, formatRangeInfo } from '../FtmsTestReport';
import { FTMSTester, UserInteractionRequest } from '../FtmsTester';
import { Device } from 'react-native-ble-plx';
import { FTMSManager } from '../FtmsManager'; // Your existing manager
import TestReportScreen from './TestReportScreen';
import LogDisplay from '../LogDisplay'; // Import the Log Display component
import { useSafeAreaStyles, Colors } from '../styles/commonStyles';
import Toast from 'react-native-root-toast';
import { ReportStorage } from '../utils/reportStorage';
import { useTranslation } from 'react-i18next';
import { useCompatibilityUtils } from '../utils/compatibilityUtils';

interface TestScreenProps {
  device: Device;
  ftmsManager: FTMSManager;
  onClose: () => void;
  isDeviceConnected: boolean;
}

const TestScreen: React.FC<TestScreenProps> = ({ device, ftmsManager, onClose, isDeviceConnected }) => {
  const { t } = useTranslation();
  const { translateCompatibilityLevel, isCompatibilityLevel, getCompatibilityColor } = useCompatibilityUtils();
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState(t('test.ready'));
  const [isRunning, setIsRunning] = useState(false);
  const [testCompleted, setTestCompleted] = useState(false);
  const [testResults, setTestResults] = useState<TestResults | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [realtimeLogs, setRealtimeLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [detectedProtocol, setDetectedProtocol] = useState<string | null>(null);
  const logScrollViewRef = useRef<ScrollView>(null);
  const testerRef = useRef<FTMSTester | null>(null);
  const safeAreaStyles = useSafeAreaStyles();

  // Tacx 사용자 상호작용을 위한 상태
  const [showUserInteractionModal, setShowUserInteractionModal] = useState(false);
  const [userInteractionRequest, setUserInteractionRequest] = useState<UserInteractionRequest | null>(null);
  const [userInteractionResolve, setUserInteractionResolve] = useState<((value: boolean) => void) | null>(null);
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownValue, setCountdownValue] = useState(3);
  const countdownAnim = useRef(new Animated.Value(1)).current;

  // Animation values
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const animationContainerHeight = useRef(new Animated.Value(0)).current;
  const animationOpacity = useRef(new Animated.Value(0)).current;

  // Help popup for compatibility badge
  const [isHelpPopupVisible, setIsHelpPopupVisible] = useState(false);
  const [helpPopupPos, setHelpPopupPos] = useState<{x: number, y: number}>({x: 0, y: 0});
  const helpIconRef = useRef(null);
  const helpPopupAnim = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;

  useEffect(() => {
    let isMounted = true;
    
    // Initialize the FTMSTester
    testerRef.current = new FTMSTester(ftmsManager);
    
    // Check detected protocol
    const protocol = ftmsManager.getDetectedProtocol();
    if (isMounted) {
      setDetectedProtocol(protocol);
    }
    
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
    if (originalLogs.length > 0 && isMounted) {
      const formattedLogs = originalLogs.map(log => 
        `${new Date(log.timestamp).toLocaleTimeString()} - ${log.message}`
      );
      setRealtimeLogs(formattedLogs);
    }
    
    // Set up log callback to get real-time updates
    const logCallback = (logs: any[]) => {
      if (!isMounted) return;
      
      const formattedLogs = logs.map(log => 
        `${new Date(log.timestamp).toLocaleTimeString()} - ${log.message}`
      );
      setRealtimeLogs(formattedLogs);
      
      // Scroll to bottom on update
      if (logScrollViewRef.current && showLogs) {
        setTimeout(() => {
          if (isMounted && logScrollViewRef.current) {
            logScrollViewRef.current.scrollToEnd({ animated: true });
          }
        }, 100);
      }
    };
    
    ftmsManager.setLogCallback(logCallback);

    return () => {
      isMounted = false;
      
      // Clean up animations
      fadeAnim.stopAnimation();
      scaleAnim.stopAnimation();
      slideAnim.stopAnimation();
      countdownAnim.stopAnimation();
      progressAnim.stopAnimation();
      animationContainerHeight.stopAnimation();
      animationOpacity.stopAnimation();
      
      // Clean up log callback
      ftmsManager.setLogCallback(null);
      
      // Clean up tester if running
      if (isRunning && testerRef.current) {
        testerRef.current.stopTest();
      }
    };
  }, [ftmsManager]); // showLogs 제거하여 불필요한 재실행 방지

  // 별도의 useEffect로 로그 스크롤 처리
  useEffect(() => {
    if (showLogs && logScrollViewRef.current) {
      const timeoutId = setTimeout(() => {
        if (logScrollViewRef.current) {
          logScrollViewRef.current.scrollToEnd({ animated: true });
        }
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [showLogs, realtimeLogs]);

  // 사용자 상호작용 핸들러
  const handleUserInteraction = (interaction: UserInteractionRequest): Promise<boolean> => {
    // console.log(`[DEBUG] handleUserInteraction 호출됨:`, interaction); // log was here
    return new Promise((resolve) => {
      setUserInteractionRequest(interaction);
      setUserInteractionResolve(() => resolve);
      setShowUserInteractionModal(true);
      // console.log(`[DEBUG] 사용자 상호작용 모달 표시됨`); // log was here
    });
  };

  // 카운트다운 업데이트 핸들러
  const handleCountdownUpdate = (countdown: number) => {
    // console.log(`[DEBUG] handleCountdownUpdate 호출됨: ${countdown}`); // log was here
    setCountdownValue(countdown);
    if (countdown > 0) {
      setShowCountdown(true);
      // 카운트다운 애니메이션
      countdownAnim.setValue(1);
      Animated.sequence([
        Animated.timing(countdownAnim, {
          toValue: 1.5,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(countdownAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      setShowCountdown(false);
    }
  };

  // 사용자 상호작용 응답 핸들러
  const handleUserResponse = (response: boolean) => {
    setShowUserInteractionModal(false);
    if (userInteractionResolve) {
      userInteractionResolve(response);
      setUserInteractionResolve(null);
    }
    setUserInteractionRequest(null);
  };

  const handleStartTest = async () => {
    try {
      if (!testerRef.current) {
        testerRef.current = new FTMSTester(ftmsManager);
      }

      // Tacx 프로토콜을 위한 사용자 상호작용 콜백 설정
      testerRef.current.setUserInteractionCallbacks(
        handleUserInteraction,
        handleCountdownUpdate
      );

      setIsRunning(true);
      setTestCompleted(false);
      setProgress(0);
      setMessage(t('test.starting'));
      
      // 애니메이션 컨테이너 확장 및 애니메이션 표시
      Animated.parallel([
        Animated.timing(animationContainerHeight, {
          toValue: 120,
          duration: 800,
          useNativeDriver: false,
        }),
        Animated.timing(animationOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: false,
        }),
      ]).start();

      // Run the test with progress updates
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
          
          // 자동으로 보고서 저장
          const saveReport = async () => {
            try {
              await ReportStorage.saveReport(results);
              // console.log('Report saved successfully from TestScreen'); // log was here
            } catch (error) {
              console.error('Error saving report from TestScreen:', error);
            }
          };
          saveReport();
          
          // 애니메이션 컨테이너 축소 및 애니메이션 숨기기
          Animated.parallel([
            Animated.timing(animationContainerHeight, {
              toValue: 0,
              duration: 600,
              useNativeDriver: false,
            }),
            Animated.timing(animationOpacity, {
              toValue: 0,
              duration: 400,
              useNativeDriver: false,
            }),
          ]).start();
          
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
  };

  const handleStopTest = async () => {
    if (testerRef.current) {
      testerRef.current.stopTest();
      setIsRunning(false);
      setMessage(t('test.stoppedDisconnected'));
    }
    
    // 애니메이션 컨테이너 축소 및 애니메이션 숨기기
    Animated.parallel([
      Animated.timing(animationContainerHeight, {
        toValue: 0,
        duration: 600,
        useNativeDriver: false,
      }),
      Animated.timing(animationOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: false,
      }),
    ]).start();
    
    // 기기와 연결 해제
    try {
      await ftmsManager.disconnectDevice();
      setMessage(t('test.stoppedDisconnected'));
      
      // 토스트 메시지 표시
      Toast.show(t('app.status.disconnected'), {
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
      setMessage(t('test.stoppedError'));
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
      Toast.show(t('app.status.disconnected'), {
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
  const renderCompatibilityBadge = () => {
    if (!testResults || !testResults.compatibilityLevel) return null;
    const badgeColor = getCompatibilityColor(testResults.compatibilityLevel);
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' }}>
        <View style={[styles.compatibilityBadge, { backgroundColor: badgeColor }]}> 
          <Text style={[styles.compatibilityText, { color: '#FFFFFF' }]}> 
            {translateCompatibilityLevel(testResults.compatibilityLevel)}
          </Text>
        </View>
        <TouchableOpacity
          ref={helpIconRef}
          onPress={showHelpPopup}
          style={styles.helpIconContainer}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="help-circle-outline" size={20} color={badgeColor} />
        </TouchableOpacity>
      </View>
    );
  };

  // Toggle real-time log display
  const toggleLogs = () => {
    setShowLogs(!showLogs);
  };

  const showHelpPopup = () => {
    if (helpIconRef.current) {
      const nodeHandle = findNodeHandle(helpIconRef.current);
      if (nodeHandle) {
        UIManager.measureInWindow(
          nodeHandle,
          (x, y, width, height) => {
            setHelpPopupPos({
              x: Math.min(x, screenWidth - 270),
              y: y + height + 4,
            });
            setIsHelpPopupVisible(true);
            Animated.timing(helpPopupAnim, {
              toValue: 1,
              duration: 180,
              useNativeDriver: true,
            }).start();
          }
        );
      }
    }
  };
  const hideHelpPopup = () => {
    Animated.timing(helpPopupAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      setIsHelpPopupVisible(false);
    });
  };

  return (
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
                <Text style={styles.title}>{t('test.title')}</Text>
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
              {/* Toggle Logs Button - Only show when test is running or not completed */}
            {(isRunning || !testCompleted) && (
              <TouchableOpacity 
                style={[styles.toggleLogButton, showLogs && styles.toggleLogButtonActive]} 
                onPress={toggleLogs}
                activeOpacity={0.8}
              >
                <View style={styles.buttonContent}>
                  <Ionicons 
                    name={showLogs ? "list" : "analytics"} 
                    size={18} 
                    color={showLogs ? "#ffffff" : "#00c663"} 
                  />
                  <Text style={[styles.toggleLogButtonText, showLogs && styles.toggleLogButtonTextActive]}>
                    {showLogs ? t('test.realtimeLog.hide') : t('test.realtimeLog.show')}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            <View style={styles.progressSection}>
              {/* 애니메이션 컨테이너 */}
              <Animated.View 
                style={[
                  styles.animationContainer, 
                  { 
                    height: animationContainerHeight,
                    opacity: animationOpacity,
                  }
                ]}
              >
                <LottieView
                  source={require('../assets/animation/test_animation.json')}
                  autoPlay
                  loop
                  style={styles.lottieAnimation}
                />
              </Animated.View>

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
                    <Text style={styles.completionBadge}>{t('test.completion')}</Text>
                  </View>
                )}
              </View>
            </View>
            {testCompleted && testResults && (
            <Animated.View style={[styles.resultsSummary, { opacity: fadeAnim }]}>
              {renderCompatibilityBadge()}
              {/* 결과 메시지를 맨 위에 표시 - 판정과 제한사항으로 분리 */}
              {testResults.reasons && testResults.reasons.length > 0 && (
                <View style={styles.resultMessageContainer}>
                  <View style={styles.resultMessageHeader}>
                    <MaterialCommunityIcons name="information" size={20} color="#00c663" />
                    <Text style={styles.resultMessageTitle}>{t('test.resultTitle')}</Text>
                  </View>
                  <View style={styles.resultMessageContent}>
                    {/* 판정 섹션 */}
                    <View style={styles.judgmentSection}>
                      <Text style={styles.judgmentText}>
                        {testResults.reasons && testResults.reasons.length > 0 ? testResults.reasons[0] : '판정 결과 없음'}
                      </Text>
                    </View>
                    
                    {/* 제한사항 섹션 - 불가능한 경우 제외하고 표시 */}
                    {testResults.compatibilityLevel && 
                     !isCompatibilityLevel(testResults.compatibilityLevel, 'fullyCompatible') && 
                     !isCompatibilityLevel(testResults.compatibilityLevel, 'impossible') && (
                      <View style={styles.limitationSection}>
                        <Text style={styles.limitationTitle}>{t('test.limitationTitle')}</Text>
                          {(isCompatibilityLevel(testResults.compatibilityLevel, 'partiallyCompatible') || isCompatibilityLevel(testResults.compatibilityLevel, 'needsModification')) && (
                          <>
                            {/* Reborn 프로토콜 제한사항 */}
                            {testResults.supportedProtocols.includes('REBORN') && (
                              <Text style={styles.limitationText}>{t('test.limitations.reborn')}</Text>
                            )}
                            
                            {/* FitShow 프로토콜 제한사항 */}
                            {testResults.supportedProtocols.includes('FITSHOW') && (
                              <Text style={styles.limitationText}>{t('test.limitations.fitshow')}</Text>
                            )}
                            
                            {!testResults.dataFields?.resistance?.detected && (
                              <Text style={styles.limitationText}>{t('test.limitations.resistance')}</Text>
                            )}
                            {testResults.controlTests?.SET_RESISTANCE_LEVEL?.status === 'Failed' && (
                              <Text style={styles.limitationText}>{t('test.limitations.gearChange')}</Text>
                            )}
                            {testResults.controlTests?.SET_TARGET_POWER?.status === 'Failed' && (
                              <Text style={styles.limitationText}>{t('test.limitations.ergMode')}</Text>
                            )}
                            {testResults.controlTests?.SET_SIM_PARAMS?.status === 'Failed' && (
                              <Text style={styles.limitationText}>{t('test.limitations.simMode')}</Text>
                            )}
                            {testResults.resistanceChanges && testResults.resistanceChanges.filter(change => !change.command || change.command === '자동 변경').length >= 5 && (
                              <Text style={styles.limitationText}>{t('test.limitations.unexpectedResistance')}</Text>
                            )}
                          </>
                        )}
                        
                        {/* 기존 issuesFound 표시 (불가능이 아닌 경우에만) */}
                        {testResults.issuesFound && testResults.issuesFound.map((issue, index) => (
                          <Text key={`issue-${index}`} style={styles.limitationText}>
                            • {issue}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              )}

              <Text style={styles.sectionTitle}>{t('test.detailInfo')}</Text>

              <View style={styles.detailsContainer}>
                <View style={styles.detailCard}>
                  <MaterialCommunityIcons name="connection" size={20} color="#00c663" />
                  <Text style={styles.detailLabel}>
                    {t('testReport.supportedProtocols')}: {testResults.supportedProtocols.join(', ')}
                  </Text>
                </View>
                {false && testResults.supportRanges && (
                  <View style={styles.rangesCard}>
                    <View style={styles.cardHeader}>
                      <Ionicons name="analytics" size={18} color="#00c663" />
                      <Text style={styles.detailSectionTitle}>{t('test.supportRange')}</Text>
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
                      )}
                      {testResults.supportRanges.resistance && (
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
                  </View>                )}
                {testResults.controlTests && Object.keys(testResults.controlTests).length > 0 && (
                  <View style={styles.rangesCard}>
                    <View style={styles.cardHeader}>
                      <MaterialCommunityIcons name="test-tube" size={18} color="#00c663" />
                      <Text style={styles.detailSectionTitle}>{t('test.controlTestResult')}</Text>
                    </View>
                    <View style={styles.controlTestsContainer}>
                      {Object.entries(testResults.controlTests).map(([name, test]) => {
                        const getStatusColor = (status: string) => {
                          switch (status) {
                            case 'OK': return '#4CAF50';
                            case 'Failed': return '#F44336';
                            case 'Not Supported': return '#FF9800';
                            default: return '#666666';
                          }
                        };
                          const getStatusIcon = (status: string) => {
                          switch (status) {
                            case 'OK': return 'circle';
                            case 'Failed': return 'circle';
                            case 'Not Supported': return 'circle';
                            default: return 'circle';
                          }
                        };
                        
                        const getCommandLabel = (command: string) => {
                          switch (command) {
                            case 'SET_RESISTANCE_LEVEL': return t('test.controlCommands.resistanceLevel');
                            case 'SET_TARGET_POWER': return t('test.controlCommands.targetPower');
                            case 'SET_SIM_PARAMS': return t('test.controlCommands.simParams');
                            default: return command;
                          }
                        };
                        
                        return (
                          <View key={name} style={styles.controlTestItem}>
                            <MaterialCommunityIcons
                              name={getStatusIcon(test.status)} 
                              size={12} 
                              color={getStatusColor(test.status)} 
                            />
                            <Text style={styles.controlTestLabel}>
                              {getCommandLabel(name)}
                            </Text>
                            <Text style={[styles.controlTestStatus, { color: getStatusColor(test.status) }]}>
                              {test.status === 'OK' ? t('test.status.success') : test.status === 'Failed' ? t('test.status.failed') : t('test.status.notSupported')}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}
                {testResults.dataFields && (
                  <View style={styles.dataFieldsCard}>
                    <View style={styles.cardHeader}>
                      <MaterialCommunityIcons name="chart-line-variant" size={18} color="#00c663" />
                      <Text style={styles.detailSectionTitle}>{t('test.detectedDataFields')}</Text>
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
                <Text style={styles.viewReportButtonText}>{t('test.viewFullReport')}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}          
          <View style={styles.buttonContainer}>
            {/* Mobi Protocol Instruction */}
            {detectedProtocol === 'MOBI' && !testCompleted && (
              <View style={styles.mobiInstructionCard}>
                <View style={styles.mobiInstructionHeader}>
                  <MaterialCommunityIcons name="bike" size={24} color="#FF9800" />
                  <Text style={styles.mobiInstructionTitle}>{t('test.mobiInstruction.title')}</Text>
                </View>
                <Text style={styles.mobiInstructionText}>
                  {t('test.mobiInstruction.description')}
                </Text>
                <View style={styles.mobiInstructionNote}>
                  <MaterialCommunityIcons name="information" size={16} color="#666" />
                  <Text style={styles.mobiInstructionNoteText}>
                    {t('test.mobiInstruction.note')}
                  </Text>
                </View>
              </View>
            )}
            
            <View style={styles.actionButtonContainer}>
              {!isRunning && !testCompleted && (                <TouchableOpacity
                  style={styles.startButton}
                  onPress={handleStartTest}
                  activeOpacity={0.8}
                >
                  <Icon name="play-arrow" size={24} color="#ffffff" />
                  <Text style={styles.startButtonText}>{t('test.startTest')}</Text>
                </TouchableOpacity>
              )}

              {isRunning && (                <TouchableOpacity
                  style={styles.stopButton}
                  onPress={handleStopTest}
                  activeOpacity={0.8}
                >
                  <Icon name="stop" size={24} color="#ffffff" />
                  <Text style={styles.stopButtonText}>{t('test.stopTest')}</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBackPress}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-back" size={20} color="#ffffff" />
              <Text style={styles.backButtonText}>{t('test.back')}</Text>
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

      {/* Tacx 사용자 상호작용 모달 */}
      <Modal
        visible={showUserInteractionModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => handleUserResponse(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons 
                name={userInteractionRequest?.type === 'command_start' ? 'play-circle' : 'check-circle'} 
                size={32} 
                color="#00c663" 
              />
              <Text style={styles.modalTitle}>
                {userInteractionRequest?.type === 'command_start' ? t('test.userInteraction.commandStart') : t('test.userInteraction.resistanceCheck')}
              </Text>
            </View>
            
            <View style={styles.modalBody}>
              <Text style={styles.modalMessage}>
                {userInteractionRequest?.message}
              </Text>
              
              {userInteractionRequest?.type === 'command_start' && (
                <View style={styles.commandInfo}>
                  <Text style={styles.commandName}>{userInteractionRequest.commandDescription}</Text>
                </View>
              )}
              
              {userInteractionRequest?.type === 'resistance_check' && (
                <View style={styles.resistanceCheckInfo}>
                  <Text style={styles.resistanceCheckText}>
                    {t('test.userInteraction.resistanceCheckText')}
                  </Text>
                </View>
              )}
            </View>
            
            <View style={styles.modalButtons}>
              {userInteractionRequest?.type === 'command_start' ? (
                <>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonCancel]}
                    onPress={() => handleUserResponse(false)}
                  >
                    <Text style={styles.modalButtonTextCancel}>{t('test.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonConfirm]}
                    onPress={() => handleUserResponse(true)}
                  >
                    <Text style={styles.modalButtonTextConfirm}>{t('test.confirm')}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonCancel]}
                    onPress={() => handleUserResponse(false)}
                  >
                    <Text style={styles.modalButtonTextCancel}>{t('test.no')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonConfirm]}
                    onPress={() => handleUserResponse(true)}
                  >
                    <Text style={styles.modalButtonTextConfirm}>{t('test.yes')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* 카운트다운 오버레이 */}
      {showCountdown && (
        <View style={styles.countdownOverlay}>
          <View style={styles.countdownContainer}>
            <Animated.Text 
              style={[
                styles.countdownText,
                { transform: [{ scale: countdownAnim }] }
              ]}
            >
              {countdownValue}
            </Animated.Text>
            <Text style={styles.countdownLabel}>{t('test.countdown')}</Text>
          </View>
        </View>
      )}

      {/* Help Popup (absolute, animated, not Modal) */}
      {isHelpPopupVisible && (
        <TouchableWithoutFeedback onPress={hideHelpPopup}>
          <Animated.View
            style={[
              styles.animatedHelpPopup,
              {
                left: helpPopupPos.x,
                top: helpPopupPos.y,
                opacity: helpPopupAnim,
                transform: [
                  {
                    scale: helpPopupAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.92, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.helpBubble}>
              <View style={styles.helpBubbleContent}>
                <View style={styles.helpBubbleHeader}>
                  <MaterialCommunityIcons name="help-circle" size={20} color={getCompatibilityColor(testResults?.compatibilityLevel)} />
                  <Text style={styles.helpBubbleTitle}>{t('test.helpTitle')}</Text>
                  <TouchableOpacity onPress={hideHelpPopup}>
                    <MaterialCommunityIcons name="close" size={16} color="#aaa" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.helpBubbleText}>
                  {t('test.helpText')}
                </Text>
              </View>
            </View>
          </Animated.View>
        </TouchableWithoutFeedback>
      )}
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
  },  animationContainer: {
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  lottieAnimation: {
    width: '100%',
    height: '100%',
  },
  progressContainer: {
    marginBottom: 16,
  },progressBarBackground: {
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
  },  // 새로운 결과 메시지 스타일
  resultMessageContainer: {
    backgroundColor: '#1a2029',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
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
  },  dataFieldItem: {
    backgroundColor: '#242c3b',
    borderRadius: 8,
    padding: 12,
    margin: 4,
    minWidth: '45%',
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
  },  logEntryResistance: {
    fontWeight: 'bold',
    color: '#9C27B0',
  },
  controlTestsContainer: {
    paddingLeft: 8,
  },
  controlTestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 4,
    backgroundColor: '#242c3b',
    borderRadius: 8,
  },
  controlTestLabel: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },  controlTestStatus: {
    fontSize: 12,
    fontWeight: '600',
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
    marginBottom: 6,  },  limitationText: {
    color: '#9ca3af',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  // Mobi instruction styles
  mobiInstructionCard: {
    backgroundColor: '#2d3748',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  mobiInstructionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  mobiInstructionTitle: {
    color: '#FF9800',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  mobiInstructionText: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  mobiInstructionNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#374151',
    padding: 8,
    borderRadius: 8,
  },
  mobiInstructionNoteText: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 16,
    marginLeft: 6,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#242c3b',
    padding: 24,
    borderRadius: 16,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  modalHeader: {
    marginBottom: 24,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#00c663',
    marginTop: 12,
    textAlign: 'center',
  },
  modalBody: {
    marginBottom: 24,
  },
  modalMessage: {
    color: '#ffffff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
  },
  commandInfo: {
    backgroundColor: '#1a2029',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#00c663',
  },
  commandName: {
    color: '#00c663',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  resistanceCheckInfo: {
    backgroundColor: '#1a2029',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  resistanceCheckText: {
    color: '#ffffff',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  modalButtonCancel: {
    backgroundColor: '#e53e3e',
  },
  modalButtonConfirm: {
    backgroundColor: '#00c663',
  },
  modalButtonTextCancel: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  modalButtonTextConfirm: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  countdownOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  countdownContainer: {
    backgroundColor: '#242c3b',
    padding: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
    borderWidth: 2,
    borderColor: '#00c663',
  },
  countdownText: {
    color: '#00c663',
    fontSize: 72,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 198, 99, 0.5)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 8,
  },
  countdownLabel: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  helpIconContainer: {
    marginLeft: 8,
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  animatedHelpPopup: {
    position: 'absolute',
    zIndex: 9999,
    width: 260,
  },
  helpBubble: {
    backgroundColor: '#1a2029',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 100,
    width: '100%',
  },
  helpBubbleContent: {
    padding: 12,
    minHeight: 60,
  },
  helpBubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  helpBubbleTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    marginLeft: 6,
  },
  helpBubbleText: {
    fontSize: 12,
    color: '#aaa',
    lineHeight: 16,
    marginBottom: 8,
    textAlign: 'left',
  },
});

export default TestScreen;
