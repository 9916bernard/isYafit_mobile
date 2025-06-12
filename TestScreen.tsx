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
  SafeAreaView,
} from 'react-native';
import { TestResults, formatRangeInfo } from './FtmsTestReport';
import { FTMSTester } from './FtmsTester';
import { Device } from 'react-native-ble-plx';
import { FTMSManager } from './FtmsManager'; // Your existing manager
import TestReportScreen from './TestReportScreen';
import LogDisplay from './LogDisplay'; // Import the Log Display component

interface TestScreenProps {
  device: Device;
  ftmsManager: FTMSManager;
  onClose: () => void;
}

const TestScreen: React.FC<TestScreenProps> = ({ device, ftmsManager, onClose }) => {
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('테스트 준비 중...');
  const [isRunning, setIsRunning] = useState(false);
  const [testCompleted, setTestCompleted] = useState(false);
  const [testResults, setTestResults] = useState<TestResults | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [realtimeLogs, setRealtimeLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const logScrollViewRef = useRef<ScrollView>(null);
  const testerRef = useRef<FTMSTester | null>(null);
  useEffect(() => {
    // Initialize the FTMSTester
    testerRef.current = new FTMSTester(ftmsManager);
    
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
  }, [ftmsManager, showLogs]);

  const handleStartTest = async () => {
    try {
      if (!testerRef.current) {
        testerRef.current = new FTMSTester(ftmsManager);
      }

      setIsRunning(true);
      setTestCompleted(false);
      setProgress(0);
      setMessage('테스트 시작 중...');

      // Run the test with progress updates
      const results = await testerRef.current.runDeviceTest(
        device,
        30000, // 30 seconds test
        (progress, message) => {
          setProgress(progress);
          setMessage(message);
        },
        (results) => {
          // Test completed callback
          setTestResults(results);
          setTestCompleted(true);
          setIsRunning(false);
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

  const handleStopTest = () => {
    if (testerRef.current) {
      testerRef.current.stopTest();
      setIsRunning(false);
      setMessage('테스트가 중지되었습니다.');
    }
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

    let badgeColor = '#4CAF50'; // Green for full compatibility
    let textColor = '#FFFFFF';

    switch (testResults.compatibilityLevel) {
      case '완전 호환':
        badgeColor = '#4CAF50'; // Green
        break;
      case '제한적 호환':
        badgeColor = '#FF9800'; // Orange
        break;
      case '수정 필요':
        badgeColor = '#2196F3'; // Blue
        break;
      case '불가능':
        badgeColor = '#F44336'; // Red
        break;
    }

    return (
      <View style={[styles.compatibilityBadge, { backgroundColor: badgeColor }]}>
        <Text style={[styles.compatibilityText, { color: textColor }]}>
          {testResults.compatibilityLevel}
        </Text>
      </View>
    );
  };
  // Toggle real-time log display
  const toggleLogs = () => {
    setShowLogs(!showLogs);
  };
  
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>FTMS 호환성 테스트</Text>
            <Text style={styles.deviceName}>
              {device.name || 'Unknown Device'} ({device.id.substring(0, 8)}...)
            </Text>
          </View>
          
          {/* Toggle Logs Button */}
          <TouchableOpacity 
            style={styles.toggleLogButton} 
            onPress={toggleLogs}
          >
            <Text style={styles.toggleLogButtonText}>
              {showLogs ? '로그 숨기기' : '실시간 로그 보기'}
            </Text>
          </TouchableOpacity>

          <View style={styles.progressContainer}>
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${progress}%`,
                    backgroundColor: isRunning ? '#00c663' : testCompleted ? '#4CAF50' : '#ccc',
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>{progress.toFixed(0)}%</Text>
          </View>

          <Text style={styles.statusMessage}>{message}</Text>

          {testCompleted && testResults && (
            <View style={styles.resultsSummary}>
              {renderCompatibilityBadge()}

              <Text style={styles.sectionTitle}>테스트 요약</Text>

              {testResults.reasons && testResults.reasons.length > 0 && (
                <View style={styles.reasonsContainer}>
                  {testResults.reasons.map((reason, index) => (
                    <Text key={index} style={styles.reasonText}>
                      • {reason}
                    </Text>
                  ))}
                </View>
              )}

              <View style={styles.detailsContainer}>
                <Text style={styles.detailLabel}>
                  지원 프로토콜: {testResults.supportedProtocols.join(', ')}
                </Text>

                {testResults.supportRanges && (
                  <View style={styles.rangesContainer}>
                    <Text style={styles.detailSectionTitle}>지원 범위:</Text>
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
                )}

                {testResults.dataFields && (
                  <View style={styles.dataFieldsContainer}>
                    <Text style={styles.detailSectionTitle}>감지된 데이터 필드:</Text>
                    {Object.entries(testResults.dataFields)
                      .filter(([_, field]) => field.detected)
                      .map(([name, field]) => (
                        <Text key={name} style={styles.dataFieldText}>
                          {name}: {field.currentValue !== undefined ? field.currentValue : 'N/A'}
                          {field.minValue !== undefined && field.maxValue !== undefined
                            ? ` (범위: ${field.minValue} - ${field.maxValue})`
                            : ''}
                        </Text>
                      ))}
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.viewReportButton}
                onPress={handleViewReport}>
                <Text style={styles.viewReportButtonText}>전체 보고서 보기</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.buttonContainer}>
            {!isRunning && !testCompleted && (
              <TouchableOpacity
                style={styles.startButton}
                onPress={handleStartTest}>
                <Text style={styles.startButtonText}>테스트 시작</Text>
              </TouchableOpacity>
            )}

            {isRunning && (
              <TouchableOpacity
                style={styles.stopButton}
                onPress={handleStopTest}>
                <Text style={styles.stopButtonText}>테스트 중단</Text>
              </TouchableOpacity>
            )}            <TouchableOpacity
              style={styles.backButton}
              onPress={onClose}>
              <Text style={styles.backButtonText}>돌아가기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Report Modal */}      <Modal
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1a2029',
  },
  scrollViewContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#1a2029',
  },
  header: {
    marginBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00c663',
    marginBottom: 8,
  },
  deviceName: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.8,
  },
  progressContainer: {
    marginVertical: 20,
  },
  progressBarBackground: {
    height: 12,
    backgroundColor: '#2d3748',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
  },
  progressText: {
    color: '#fff',
    marginTop: 5,
    textAlign: 'center',
  },
  statusMessage: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  resultsSummary: {
    backgroundColor: '#242c3b',
    borderRadius: 12,
    padding: 16,
    marginVertical: 20,
  },
  compatibilityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 12,
  },
  compatibilityText: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  reasonsContainer: {
    backgroundColor: '#1a2029',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  reasonText: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 4,
  },
  detailsContainer: {
    marginVertical: 8,
  },
  detailLabel: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 8,
  },
  detailSectionTitle: {
    color: '#00c663',
    fontSize: 14,
    fontWeight: '600',
    marginVertical: 4,
  },
  rangesContainer: {
    marginBottom: 8,
  },
  rangeText: {
    color: '#fff',
    fontSize: 13,
    marginLeft: 8,
    marginBottom: 2,
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
    backgroundColor: '#2d3748',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  viewReportButtonText: {
    color: '#00c663',
    fontWeight: '600',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  startButton: {
    backgroundColor: '#00c663',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  startButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  stopButton: {
    backgroundColor: '#e53e3e',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  stopButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  backButton: {
    backgroundColor: '#2d3748',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    flex: 0.5,
  },  backButtonText: {
    color: '#fff',
  },
  toggleLogButton: {
    backgroundColor: '#2d3748',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 8,
  },
  toggleLogButtonText: {
    color: '#00c663',
    fontWeight: '600',
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
