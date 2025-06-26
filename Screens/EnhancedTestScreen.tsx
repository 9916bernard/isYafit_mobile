// EnhancedTestScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { FTMSManager } from '../FtmsManager'; 
import { Device } from 'react-native-ble-plx';
import { useSafeAreaStyles, Colors } from '../styles/commonStyles';
import Toast from 'react-native-root-toast';
import { useTranslation } from 'react-i18next';

interface EnhancedTestScreenProps {
  device: Device;
  ftmsManager: FTMSManager;
  onClose: () => void;
  isDeviceConnected?: boolean;
}

const EnhancedTestScreen: React.FC<EnhancedTestScreenProps> = ({ 
  device, 
  ftmsManager, 
  onClose,
  isDeviceConnected = true
}) => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [deviceConnected, setDeviceConnected] = useState(isDeviceConnected);
  const scrollViewRef = useRef<ScrollView>(null);
  const safeAreaStyles = useSafeAreaStyles();
  
  useEffect(() => {
    let isMounted = true;
    
    // Get initial logs
    const initialLogs = ftmsManager.getLogs();
    if (initialLogs.length > 0 && isMounted) {
      const formattedLogs = initialLogs.map(log => 
        `${new Date(log.timestamp).toLocaleTimeString()} - ${log.message}`
      );
      setLogs(formattedLogs);
    }
    
    // Set up log callback to get real-time updates
    const handleNewLogs = (newLogs: any[]) => {
      if (!isMounted) return;
      
      const formattedLogs = newLogs.map(log => 
        `${new Date(log.timestamp).toLocaleTimeString()} - ${log.message}`
      );
      setLogs(formattedLogs);
      
      // Scroll to bottom when new logs are added
      if (scrollViewRef.current && showLogs) {
        setTimeout(() => {
          if (isMounted && scrollViewRef.current) {
            scrollViewRef.current.scrollToEnd({ animated: true });
          }
        }, 100);
      }
    };

    ftmsManager.setLogCallback(handleNewLogs);

    return () => {
      isMounted = false;
      ftmsManager.setLogCallback(null);
    };
  }, [ftmsManager]);

  // 별도의 useEffect로 로그 스크롤 처리
  useEffect(() => {
    if (showLogs && scrollViewRef.current) {
      const timeoutId = setTimeout(() => {
        if (scrollViewRef.current) {
          scrollViewRef.current.scrollToEnd({ animated: true });
        }
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [showLogs, logs]);

  const handleDisconnect = async () => {
    Alert.alert(
      t('common.confirm'),
      '연결을 해제하시겠습니까?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: onClose,
        },
      ]
    );
  };

  const toggleLogs = () => {
    setShowLogs(!showLogs);
  };
  return (
    <View style={safeAreaStyles.safeContainerMinPadding}>
      <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleDisconnect} style={styles.backButton}>
          <Icon name="arrow-left" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('logs.title')}</Text>
        <View style={styles.connectionIndicator}>
          <View style={[styles.connectionDot, { backgroundColor: deviceConnected ? '#00c663' : '#ef4444' }]} />
        </View>
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
          <Text style={styles.deviceInfoText}>
            {t('logs.deviceInfo')} {device.name || t('common.unknown')} ({device.id.substring(0, 8)}...)
          </Text>

          <ScrollView 
            style={styles.logsScrollView} 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.logsContent}
          >
            {logs.length === 0 ? (
              <Text style={styles.noLogs}>{t('logs.noLogs')}</Text>
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
        style={deviceConnected ? styles.disconnectButton : styles.backButton}
        onPress={handleDisconnect}
      >
        <Icon 
          name={deviceConnected ? "bluetooth-off" : "arrow-left"} 
          size={20} 
          color={deviceConnected ? "#ef4444" : "#fff"} 
        />
        <Text style={deviceConnected ? styles.disconnectButtonText : styles.backButtonText}>
          {deviceConnected ? "연결 해제" : "돌아가기"}
        </Text>
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
  backButton: {
    backgroundColor: '#00c663',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12, 
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#ef4444',
    marginTop: 8,
  },
  disconnectButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  connectionIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#8b9cb2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00c663',
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
  logsScrollView: {
    backgroundColor: '#242c3b',
    borderRadius: 8,
  },
  logsContent: {
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
  deviceInfoText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
  },
});

export default EnhancedTestScreen;
