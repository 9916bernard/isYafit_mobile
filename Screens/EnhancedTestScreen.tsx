// EnhancedTestScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { FTMSManager } from '../FtmsManager'; 
import { Device } from 'react-native-ble-plx';
import { useSafeAreaStyles, Colors } from '../styles/commonStyles';

interface EnhancedTestScreenProps {
  device: Device;
  ftmsManager: FTMSManager;
  onClose: () => void;
}

const EnhancedTestScreen: React.FC<EnhancedTestScreenProps> = ({ 
  device, 
  ftmsManager, 
  onClose 
}) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const safeAreaStyles = useSafeAreaStyles();
  
  useEffect(() => {
    // Get initial logs
    const initialLogs = ftmsManager.getLogs();
    if (initialLogs.length > 0) {
      const formattedLogs = initialLogs.map(log => 
        `${new Date(log.timestamp).toLocaleTimeString()} - ${log.message}`
      );
      setLogs(formattedLogs);
    }
    
    // Set up log callback to get real-time updates
    ftmsManager.setLogCallback((newLogs) => {
      const formattedLogs = newLogs.map(log => 
        `${new Date(log.timestamp).toLocaleTimeString()} - ${log.message}`
      );
      setLogs(formattedLogs);
      
      // Scroll to bottom when new logs are added
      if (scrollViewRef.current && showLogs) {
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    });
  }, [ftmsManager, showLogs]);

  const toggleLogs = () => {
    setShowLogs(!showLogs);
  };
  return (
    <View style={safeAreaStyles.safeContainerMinPadding}>
      <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>실시간 명령/데이터 로그</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>X</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity 
        style={styles.toggleButton}
        onPress={toggleLogs}
      >
        <Text style={styles.toggleButtonText}>
          {showLogs ? '로그 숨기기' : '로그 보기'}
        </Text>
      </TouchableOpacity>

      {showLogs && (
        <View style={styles.logsContainer}>
          <Text style={styles.deviceInfo}>
            장치: {device.name || 'Unknown'} ({device.id.substring(0, 8)}...)
          </Text>

          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollViewContent}
          >
            {logs.length === 0 ? (
              <Text style={styles.noLogs}>로그가 없습니다.</Text>
            ) : (
              logs.map((log, index) => (
                <Text key={index} style={styles.logEntry}>
                  {(() => {
                    // 명령 전송 로그 (파란색)
                    if (log.includes('명령 전송:')) {
                      return <Text style={styles.commandLog}>{log}</Text>;
                    }
                    // 명령 응답 성공 로그 (녹색)
                    else if (log.includes('명령 응답 [성공]') || log.includes('SUCCESS')) {
                      return <Text style={styles.successLog}>{log}</Text>;
                    }
                    // 명령 응답 실패 로그 (빨간색)
                    else if (log.includes('명령 응답 [실패]') || log.includes('FAIL')) {
                      return <Text style={styles.errorLog}>{log}</Text>;
                    }
                    // 바이크 데이터 로그 (하늘색)
                    else if (log.includes('바이크 데이터:')) {
                      return <Text style={styles.bikeDataLog}>{log}</Text>;
                    }
                    // 저항 변경 로그 (보라색)
                    else if (log.includes('Resistance changed')) {
                      return <Text style={styles.resistanceLog}>{log}</Text>;
                    }
                    // Raw 데이터 로그 (회색)
                    else if (log.includes('Bike Data Flags') || log.includes('raw data')) {
                      return <Text style={styles.rawDataLog}>{log}</Text>;
                    }
                    // 일반 로그
                    return log;
                  })()}
                </Text>
              ))
            )}
          </ScrollView>
        </View>
      )}      <TouchableOpacity
        style={styles.backButton}
        onPress={onClose}
      >
        <Text style={styles.backButtonText}>돌아가기</Text>
      </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a2029',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#00c663',
  },
  closeButton: {
    backgroundColor: '#2d3748',
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  deviceInfo: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 8,
  },
  toggleButton: {
    backgroundColor: '#2d3748',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  toggleButtonText: {
    color: '#00c663',
    fontWeight: '600',
  },
  logsContainer: {
    flex: 1,
    marginBottom: 16,
  },
  scrollView: {
    backgroundColor: '#242c3b',
    borderRadius: 8,
  },
  scrollViewContent: {
    padding: 10,
  },
  noLogs: {
    color: '#8b9cb2',
    textAlign: 'center',
    padding: 20,
  },
  logEntry: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 6,
  },
  commandLog: {
    color: '#2196F3',
    fontWeight: 'bold',
  },
  successLog: {
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  errorLog: {
    color: '#F44336',
    fontWeight: 'bold',
  },
  bikeDataLog: {
    color: '#03A9F4',
  },
  resistanceLog: {
    color: '#9C27B0',
    fontWeight: 'bold',
  },
  rawDataLog: {
    color: '#9E9E9E',
    fontSize: 11,
  },
  backButton: {
    backgroundColor: '#00c663',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default EnhancedTestScreen;
