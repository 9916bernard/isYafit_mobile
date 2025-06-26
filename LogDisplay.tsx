// LogDisplay.tsx - Real-time Log Display Component
import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { Colors, Shadows } from './styles/commonStyles';

interface LogDisplayProps {
  logs: string[];
  visible: boolean;
  onClose: () => void;
}

const LogDisplay: React.FC<LogDisplayProps> = ({ logs, visible, onClose }) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }

    return () => {
      slideAnim.stopAnimation();
    };
  }, [visible, slideAnim]);

  useEffect(() => {
    // Scroll to the bottom when logs change
    if (visible && scrollViewRef.current) {
      const timeoutId = setTimeout(() => {
        if (scrollViewRef.current) {
          scrollViewRef.current.scrollToEnd({ animated: true });
        }
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [logs, visible]);

  if (!visible) return null;

  return (
    <Animated.View 
      style={[
        styles.container,
        { transform: [{ translateY: slideAnim }] }
      ]}
    >
      <LinearGradient
        colors={[Colors.cardBackground, Colors.secondary]}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <View style={styles.headerTitleContainer}>
            <Icon name="console-line" size={20} color={Colors.primary} />
            <Text style={styles.headerTitle}>실시간 로그</Text>
            <View style={styles.logCountBadge}>
              <Text style={styles.logCountText}>{logs.length}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Icon name="close" size={20} color={Colors.text} />
          </TouchableOpacity>
        </View>
      </LinearGradient>
      
      <ScrollView 
        ref={scrollViewRef} 
        style={styles.logContainer}
        contentContainerStyle={styles.logContentContainer}
        showsVerticalScrollIndicator={false}
      >
        {logs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="information-outline" size={48} color={Colors.textSecondary} />
            <Text style={styles.noLogsText}>로그가 없습니다</Text>
          </View>
        ) : (
          logs.map((log, index) => (
            <View key={index} style={styles.logEntryContainer}>
              <View style={styles.logEntryIndicator}>
                {(() => {
                  if (log.includes('명령 전송:')) return <View style={[styles.indicator, styles.indicatorCommand]} />;
                  if (log.includes('명령 응답 [성공]') || log.includes('SUCCESS')) return <View style={[styles.indicator, styles.indicatorSuccess]} />;
                  if (log.includes('명령 응답 [실패]') || log.includes('FAIL')) return <View style={[styles.indicator, styles.indicatorError]} />;
                  if (log.includes('바이크 데이터:')) return <View style={[styles.indicator, styles.indicatorData]} />;
                  if (log.includes('Resistance changed')) return <View style={[styles.indicator, styles.indicatorResistance]} />;
                  return <View style={[styles.indicator, styles.indicatorDefault]} />;
                })()}
              </View>
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
                  }
                  // 일반 로그
                  return <Text style={styles.logEntry}>{log}</Text>;
                })()}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    ...Shadows.large,
  },
  headerGradient: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  logCountBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  logCountText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: Colors.secondary,
  },
  logContainer: {
    backgroundColor: Colors.background,
    maxHeight: 320,
  },
  logContentContainer: {
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  noLogsText: {
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    fontSize: 16,
  },
  logEntryContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingVertical: 4,
  },
  logEntryIndicator: {
    marginRight: 12,
    marginTop: 6,
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  indicatorCommand: {
    backgroundColor: Colors.info,
  },
  indicatorSuccess: {
    backgroundColor: Colors.success,
  },
  indicatorError: {
    backgroundColor: Colors.error,
  },
  indicatorData: {
    backgroundColor: '#03A9F4',
  },
  indicatorResistance: {
    backgroundColor: '#9C27B0',
  },
  indicatorDefault: {
    backgroundColor: Colors.textSecondary,
  },
  logEntry: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: Colors.text,
    flex: 1,
    lineHeight: 16,
  },
  logEntryCommand: {
    fontWeight: 'bold',
    color: Colors.info,
  },
  logEntrySuccess: {
    fontWeight: 'bold',
    color: Colors.success,
  },
  logEntryError: {
    fontWeight: 'bold',
    color: Colors.error,
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
    color: Colors.text,
  },
});

export default LogDisplay;
