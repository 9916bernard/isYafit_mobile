import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Device } from 'react-native-ble-plx';
import { useSafeAreaStyles, Colors } from '../styles/commonStyles';

interface ModeSelectionScreenProps {
  device: Device;
  onSelectRealtimeData: () => void;
  onSelectCompatibilityTest: () => void;
  onDisconnect: () => void;
}

const ModeSelectionScreen: React.FC<ModeSelectionScreenProps> = ({ 
  device, 
  onSelectRealtimeData, 
  onSelectCompatibilityTest, 
  onDisconnect 
}) => {
  const safeAreaStyles = useSafeAreaStyles();

  return (
    <View style={safeAreaStyles.safeContainerMinPadding}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>모드 선택</Text>
        </View>

        <View style={styles.deviceInfo}>
          <Icon name="bluetooth" size={28} color="#00c663" />
          <Text style={styles.deviceName}>{device.name || 'Unknown Device'}</Text>
          <Text style={styles.deviceId}>{device.id.substring(0, 8)}...</Text>
        </View>

        <Text style={styles.subtitle}>원하시는 기능을 선택해주세요</Text>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity            style={styles.modeButton}
            onPress={onSelectRealtimeData}
          >
            <View style={styles.buttonIconContainer}>
              <Icon name="gauge" size={36} color="#00c663" />
            </View>
            <Text style={styles.modeButtonTitle}>실시간 데이터 모니터링</Text>
            <Text style={styles.modeButtonDescription}>
              속도, 케이던스, 파워, 저항 등의{'\n'}실시간 데이터를 확인합니다
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modeButton}            onPress={onSelectCompatibilityTest}
          >
            <View style={styles.buttonIconContainer}>
              <Icon name="test-tube" size={36} color="#00c663" />
            </View>
            <Text style={styles.modeButtonTitle}>Yafit 호환성 테스트</Text>
            <Text style={styles.modeButtonDescription}>
              FTMS 프로토콜 지원 여부와{'\n'}Yafit 앱과의 호환성을 테스트합니다          </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.disconnectButton} onPress={onDisconnect}>
          <Icon name="bluetooth-off" size={20} color="#ef4444" />
          <Text style={styles.disconnectButtonText}>연결 해제</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    paddingTop: 0, 
  },
  backButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: Colors.secondary,
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12, 
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: Colors.error,
    marginTop: 24,
    marginBottom: 10,
  },
  disconnectButtonText: {
    color: Colors.error,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
  },
  deviceInfo: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.secondary,
    borderRadius: 12,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 6,
    textAlign: 'center',
  },
  deviceId: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  subtitle: {
    fontSize: 13, 
    color: Colors.textSecondary, 
    textAlign: 'center',
    marginBottom: 20, 
    paddingHorizontal: 16,
  },
  buttonContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: 10, 
    paddingHorizontal: 4,
  },
  modeButton: {
    backgroundColor: Colors.secondary,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  buttonIconContainer: {
    width: 56,
    height: 56,
    backgroundColor: Colors.background,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  modeButtonTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 6,
    paddingHorizontal: 8,
  },
  modeButtonDescription: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 12,
  },
});

export default ModeSelectionScreen;
