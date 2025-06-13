import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Device } from 'react-native-ble-plx';

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
  return (
    <SafeAreaView style={styles.safeArea}>
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
              FTMS 프로토콜 지원 여부와{'\n'}Yafit 앱과의 호환성을 테스트합니다
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.disconnectButton} onPress={onDisconnect}>
          <Icon name="bluetooth-off" size={20} color="#ef4444" />
          <Text style={styles.disconnectButtonText}>연결 해제</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1a2029',
  },
  container: {
    flex: 1,
    backgroundColor: '#1a2029',
    paddingHorizontal: 24,
    paddingTop: 40, 
    paddingBottom: 80, // Adjusted: Significantly increased bottom padding
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20, // Adjusted
    paddingTop: 0, 
  },
  backButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: '#242c3b',
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
    marginTop: 24, // Adjusted: Increased space above disconnect button
    marginBottom: 10, // Adjusted: Ensure some margin at the very bottom
  },
  disconnectButtonText: {
    color: '#ef4444',
    fontSize: 14, // Adjusted
    fontWeight: '600',
    marginLeft: 8,
  },
  title: {
    fontSize: 22, // Adjusted
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  deviceInfo: {
    alignItems: 'center',
    marginBottom: 24, // Adjusted
    paddingVertical: 12, // Adjusted
    paddingHorizontal: 16, // Adjusted
    backgroundColor: '#1f2937', // Slightly different background
    borderRadius: 12, // Adjusted
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#374151', // Added border for distinction
  },
  deviceName: {
    fontSize: 16, // Adjusted
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 6, // Adjusted
    textAlign: 'center',
  },
  deviceId: {
    fontSize: 11, // Adjusted
    color: '#9ca3af', // Adjusted color
    marginTop: 3, // Adjusted
  },
  subtitle: {
    fontSize: 13, 
    color: '#9ca3af', 
    textAlign: 'center',
    marginBottom: 20, 
    paddingHorizontal: 16,
  },
  buttonContainer: {
    flex: 1, // This will make the button container take available space
    justifyContent: 'center', // Mode buttons will be centered in this space
    gap: 10, 
    paddingHorizontal: 4,
  },
  modeButton: {
    backgroundColor: '#242c3b',
    borderRadius: 16, // Adjusted
    padding: 16, // Adjusted
    alignItems: 'center',
    borderWidth: 1, // Adjusted
    borderColor: '#374151', // Adjusted
    elevation: 3, // Adjusted
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, // Adjusted
    shadowOpacity: 0.1, // Adjusted
    shadowRadius: 4, // Adjusted
  },
  buttonIconContainer: {
    width: 56, // Adjusted
    height: 56, // Adjusted
    backgroundColor: '#1a2029',
    borderRadius: 28, // Adjusted
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10, // Adjusted
    elevation: 1, // Adjusted
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, // Adjusted
    shadowOpacity: 0.05, // Adjusted
    shadowRadius: 2, // Adjusted
  },
  modeButtonTitle: {
    fontSize: 16, // Adjusted
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 6, // Adjusted
    paddingHorizontal: 8,
  },
  modeButtonDescription: {
    fontSize: 12, // Adjusted
    color: '#9ca3af', // Adjusted color
    textAlign: 'center',
    lineHeight: 16, // Adjusted
    paddingHorizontal: 12,
  },
});

export default ModeSelectionScreen;
