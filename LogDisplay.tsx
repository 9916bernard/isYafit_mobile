// LogDisplay.tsx - Real-time Log Display Component
import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';

interface LogDisplayProps {
  logs: string[];
  visible: boolean;
  onClose: () => void;
}

const LogDisplay: React.FC<LogDisplayProps> = ({ logs, visible, onClose }) => {
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Scroll to the bottom when logs change
    if (visible && scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [logs, visible]);

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>실시간 로그</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeButton}>닫기</Text>
        </TouchableOpacity>
      </View>
      
      <ScrollView 
        ref={scrollViewRef} 
        style={styles.logContainer}
        contentContainerStyle={styles.logContentContainer}
      >
        {logs.length === 0 ? (
          <Text style={styles.noLogsText}>로그가 없습니다</Text>
        ) : (
          logs.map((log, index) => (
            <View key={index} style={styles.logEntryContainer}>
              <Text style={styles.logEntry}>
                {(() => {
                  // 명령 전송 로그 (파란색)
                  if (log.includes('명령 전송:')) {
                    return <Text style={styles.logEntryCommand}>{log}</Text>;
                  }
                  // 명령 응답 성공 로그 (녹색)
                  else if (log.includes('명령 응답 [성공]') || log.includes('SUCCESS')) {
                    return <Text style={styles.logEntrySuccess}>{log}</Text>;
                  }
                  // 명령 응답 실패 로그 (빨간색)
                  else if (log.includes('명령 응답 [실패]') || log.includes('FAIL')) {
                    return <Text style={styles.logEntryError}>{log}</Text>;
                  }
                  // 바이크 데이터 로그 (하늘색)
                  else if (log.includes('바이크 데이터:')) {
                    return <Text style={styles.logEntryBikeData}>{log}</Text>;
                  }
                  // 저항 변경 로그 (보라색)
                  else if (log.includes('Resistance changed')) {
                    return <Text style={styles.logEntryResistance}>{log}</Text>;
                  }
                  // 기타 중요 로그 (굵은 글씨)
                  else if (
                    log.includes('Control Response Received') || 
                    log.includes('Sending') || 
                    log.includes('Bike Data Flags') || 
                    log.includes('raw data')
                  ) {
                    return <Text style={styles.logEntryImportant}>{log}</Text>;
                  }                  // 일반 로그
                  return <Text style={styles.logEntry}>{log}</Text>;
                })()}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(26, 32, 41, 0.95)',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    paddingTop: 10,
    paddingHorizontal: 10,
    maxHeight: '50%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeButton: {
    color: '#00c663',
    fontSize: 14,
    padding: 4,
  },
  logContainer: {
    backgroundColor: '#242c3b',
    borderRadius: 8,
    maxHeight: 300,
  },
  logContentContainer: {
    padding: 12,
  },
  noLogsText: {
    color: '#aaa',
    textAlign: 'center',
    padding: 10,
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
  logEntryImportant: {
    fontWeight: 'bold',
    color: '#fff',
  },
});

export default LogDisplay;
