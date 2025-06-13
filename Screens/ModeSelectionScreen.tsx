import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Device } from 'react-native-ble-plx';

interface ModeSelectionScreenProps {
  device: Device;
  onSelectRealtimeData: () => void;
  onSelectCompatibilityTest: () => void;
  onBack: () => void;
}

const ModeSelectionScreen: React.FC<ModeSelectionScreenProps> = ({ 
  device, 
  onSelectRealtimeData, 
  onSelectCompatibilityTest, 
  onBack 
}) => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Icon name="arrow-left" size={24} color="#00c663" />
          </TouchableOpacity>
          <Text style={styles.title}>모드 선택</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.deviceInfo}>
          <Icon name="bluetooth" size={32} color="#00c663" />
          <Text style={styles.deviceName}>{device.name || 'Unknown Device'}</Text>
          <Text style={styles.deviceId}>{device.id.substring(0, 8)}...</Text>
        </View>

        <Text style={styles.subtitle}>원하시는 기능을 선택해주세요</Text>        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.modeButton}
            onPress={onSelectRealtimeData}
          >
            <View style={styles.buttonIconContainer}>
              <Icon name="gauge" size={48} color="#00c663" />
            </View>
            <Text style={styles.modeButtonTitle}>실시간 데이터 모니터링</Text>
            <Text style={styles.modeButtonDescription}>
              속도, 케이던스, 파워, 저항 등의{'\n'}실시간 데이터를 확인합니다
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modeButton}
            onPress={onSelectCompatibilityTest}
          >
            <View style={styles.buttonIconContainer}>
              <Icon name="test-tube" size={48} color="#00c663" />
            </View>
            <Text style={styles.modeButtonTitle}>Yafit 호환성 테스트</Text>
            <Text style={styles.modeButtonDescription}>
              FTMS 프로토콜 지원 여부와{'\n'}Yafit 앱과의 호환성을 테스트합니다
            </Text>
          </TouchableOpacity>
        </View>
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
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  backButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: '#242c3b',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  placeholder: {
    width: 44, // Same width as back button to center the title
  },
  deviceInfo: {
    alignItems: 'center',
    marginBottom: 40,
    padding: 20,
    backgroundColor: '#242c3b',
    borderRadius: 12,
  },
  deviceName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 10,
    textAlign: 'center',
  },
  deviceId: {
    fontSize: 14,
    color: '#aaa',
    marginTop: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 30,
  },
  buttonContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: 20,
  },
  modeButton: {
    backgroundColor: '#242c3b',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  buttonIconContainer: {
    width: 80,
    height: 80,
    backgroundColor: '#1a2029',
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modeButtonTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  modeButtonDescription: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default ModeSelectionScreen;
