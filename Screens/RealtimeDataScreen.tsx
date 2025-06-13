import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Device } from 'react-native-ble-plx';
import { FTMSManager } from '../FtmsManager';

interface RealtimeDataScreenProps {
  device: Device;
  ftmsManager: FTMSManager;
  onBack: () => void;
}

const RealtimeDataScreen: React.FC<RealtimeDataScreenProps> = ({ 
  device, 
  ftmsManager, 
  onBack 
}) => {
  const [bikeData, setBikeData] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState('연결 중...');

  useEffect(() => {
    const connectToDevice = async () => {
      try {
        setStatusMessage('기기에 연결 중...');
        await ftmsManager.disconnectDevice(); // 이전 연결 해제
        const connectedDevice = await ftmsManager.connectToDevice(device.id);
        
        setStatusMessage('알림 구독 중...');
        await ftmsManager.subscribeToNotifications(
          (cpResponse) => {
            // Control point response handling
            if (cpResponse.length >= 3) {
              const responseOpCode = cpResponse[0];
              const requestOpCode = cpResponse[1];
              const resultCode = cpResponse[2];
              console.log(`RealtimeData: CP Response - OpCode: ${requestOpCode.toString(16)}, Result: ${resultCode === 1 ? 'SUCCESS' : 'FAILURE'}`);
            }
          },
          (newBikeData) => {
            setBikeData(newBikeData);
          }
        );
        
        setStatusMessage('연결 시퀀스 실행 중...');
        const success = await ftmsManager.connectSequence();
        if (success) {
          setIsConnected(true);
          setStatusMessage('데이터 수신 중...');
        } else {
          setStatusMessage('연결 시퀀스 실패. 다시 시도해주세요.');
        }
      } catch (error) {
        console.error("Connection error:", error);
        setStatusMessage(`연결 오류: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    connectToDevice();

    return () => {
      // Cleanup
      ftmsManager.disconnectDevice().catch(console.error);
    };
  }, [device, ftmsManager]);

  const handleDisconnect = async () => {
    try {
      await ftmsManager.disconnectDevice();
      onBack();
    } catch (error) {
      console.error("Disconnect error:", error);
      onBack(); // Go back anyway
    }
  };

  const renderDataItem = (label: string, value: any, unit: string, icon: string) => (
    <View style={styles.dataItem}>
      <View style={styles.dataIconContainer}>
        <Icon name={icon} size={24} color="#00c663" />
      </View>
      <View style={styles.dataContent}>
        <Text style={styles.dataLabel}>{label}</Text>
        <View style={styles.dataValueContainer}>
          <Text style={styles.dataValue}>
            {value !== null && value !== undefined ? 
              (typeof value === 'number' ? value.toFixed(1) : value) : '--'}
          </Text>
          <Text style={styles.dataUnit}>{unit}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleDisconnect} style={styles.backButton}>
            <Icon name="arrow-left" size={24} color="#00c663" />
          </TouchableOpacity>
          <Text style={styles.title}>실시간 데이터</Text>
          <View style={styles.connectionIndicator}>
            <View style={[styles.connectionDot, { backgroundColor: isConnected ? '#00c663' : '#ef4444' }]} />
          </View>
        </View>

        <View style={styles.deviceInfo}>
          <Icon name="bluetooth" size={28} color="#00c663" />
          <Text style={styles.deviceName}>{device.name || 'Unknown Device'}</Text>
          <Text style={styles.deviceId}>{device.id.substring(0, 8)}...</Text>
        </View>

        <Text style={styles.statusMessage}>{statusMessage}</Text>

        {isConnected && bikeData ? (
          <ScrollView style={styles.dataContainer} showsVerticalScrollIndicator={false}>
            {renderDataItem("속도", bikeData.instantaneousSpeed, "km/h", "speedometer")}
            {renderDataItem("케이던스", bikeData.instantaneousCadence, "rpm", "rotate-3d-variant")}
            {renderDataItem("파워", bikeData.instantaneousPower, "W", "lightning-bolt")}
            {renderDataItem("저항 레벨", bikeData.resistanceLevel, "", "weight-lifter")}
            {renderDataItem("심박수", bikeData.heartRate, "bpm", "heart-pulse")}
            {renderDataItem("총 거리", bikeData.totalDistance, "m", "map-marker-distance")}
            {renderDataItem("경과 시간", bikeData.elapsedTime, "s", "timer")}
            {renderDataItem("칼로리", bikeData.totalEnergy, "kcal", "fire")}
          </ScrollView>
        ) : (
          <View style={styles.loadingContainer}>
            <Icon name="loading" size={48} color="#00c663" />
            <Text style={styles.loadingText}>데이터 수신 대기 중...</Text>
          </View>
        )}

        <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnect}>
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
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
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
  connectionIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
  },
  connectionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#242c3b',
    borderRadius: 12,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginLeft: 12,
    marginRight: 8,
  },
  deviceId: {
    fontSize: 14,
    color: '#aaa',
  },
  statusMessage: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 20,
  },
  dataContainer: {
    flex: 1,
  },
  dataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#242c3b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  dataIconContainer: {
    width: 48,
    height: 48,
    backgroundColor: '#1a2029',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  dataContent: {
    flex: 1,
  },
  dataLabel: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 4,
  },
  dataValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  dataValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginRight: 8,
  },
  dataUnit: {
    fontSize: 16,
    color: '#00c663',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#aaa',
    marginTop: 16,
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    marginBottom: 10,
  },
  disconnectButtonText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default RealtimeDataScreen;
