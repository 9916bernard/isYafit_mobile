import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, Button, FlatList, TouchableOpacity, PermissionsAndroid, Platform } from 'react-native';
import { FTMSManager } from './FtmsManager'; // 경로가 정확한지 확인해주세요.
import { BleError, Device } from 'react-native-ble-plx';

export default function App() {
  const [ftmsManager, setFtmsManager] = useState<FTMSManager | null>(null);
  const [scannedDevices, setScannedDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState('앱 테스트 중입니다.');
  const [bikeData, setBikeData] = useState<any>(null); // 실제 IndoorBikeData 타입으로 변경 가능

  const requestPermissions = useCallback(async () => {
    if (Platform.OS === 'android') {
      const grantedFineLocation = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: 'Bluetooth scanning requires location permission.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      const grantedScan = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        {
          title: 'Bluetooth Scan Permission',
          message: 'This app needs Bluetooth scan permission.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      const grantedConnect = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        {
          title: 'Bluetooth Connect Permission',
          message: 'This app needs Bluetooth connect permission.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      return grantedFineLocation === PermissionsAndroid.RESULTS.GRANTED &&
             grantedScan === PermissionsAndroid.RESULTS.GRANTED &&
             grantedConnect === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  }, []);
  useEffect(() => {
    // FTMSManager 초기화를 컴포넌트 마운트 후에 수행
    const initializeFtmsManager = async () => {
      try {
        const manager = new FTMSManager();
        setFtmsManager(manager);
        setStatusMessage('FTMS Manager 초기화 완료. 스캔을 시작할 수 있습니다.');
      } catch (error) {
        console.error('FTMSManager 초기화 오류:', error);
        setStatusMessage('FTMS Manager 초기화 실패. BLE가 지원되지 않을 수 있습니다.');
      }
    };

    initializeFtmsManager();
    requestPermissions();

    return () => {
      if (ftmsManager) {
        ftmsManager.destroy();
      }
    };
  }, [requestPermissions]);
  const handleScan = async () => {
    if (!ftmsManager) {
      setStatusMessage('FTMS Manager가 아직 초기화되지 않았습니다.');
      return;
    }

    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      setStatusMessage('필수 권한이 거부되었습니다.');
      return;
    }

    setIsScanning(true);
    setScannedDevices([]);
    setSelectedDevice(null);
    setConnectedDevice(null);
    setStatusMessage('FTMS 장치를 스캔 중...');
    try {
      await ftmsManager.scanForFTMSDevices(10000, (device) => {
        setScannedDevices((prevDevices) => {
          if (!prevDevices.find(d => d.id === device.id)) {
            return [...prevDevices, device];
          }
          return prevDevices;
        });
      });
      setStatusMessage('스캔 완료. 장치를 선택하세요.');
    } catch (error) {
      console.error("Scan error:", error);
      setStatusMessage('스캔 중 오류 발생.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleSelectDevice = (device: Device) => {
    setSelectedDevice(device);
    setStatusMessage(`${device.name || device.id} 선택됨. 연결 및 테스트 준비 완료.`);
  };
  const handleConnectAndTest = async () => {
    if (!ftmsManager) {
      setStatusMessage('FTMS Manager가 아직 초기화되지 않았습니다.');
      return;
    }

    if (!selectedDevice) {
      setStatusMessage('테스트할 장치를 먼저 선택하세요.');
      return;
    }
    setStatusMessage(`'${selectedDevice.name || selectedDevice.id}'에 연결 중...`);
    try {
      await ftmsManager.disconnectDevice(); // 이전 연결 해제
      const device = await ftmsManager.connectToDevice(selectedDevice.id);
      setConnectedDevice(device);
      setStatusMessage(`'${device.name}'에 연결됨. 알림 구독 및 테스트 시작...`);

      await ftmsManager.subscribeToNotifications(
        (cpResponse) => {
          console.log("App: CP Response:", cpResponse.toString('hex'));
          // UI에 CP 응답 표시 로직 추가 가능
        },
        (newBikeData) => {
          console.log("App: Bike Data:", JSON.stringify(newBikeData, null, 2));
          setBikeData(newBikeData); // UI 업데이트를 위해 상태에 저장
        }
      );
      setStatusMessage('알림 구독 완료. 테스트 시퀀스 실행 중...');
      await ftmsManager.runTestSequence(); // 테스트 시퀀스 실행
      setStatusMessage('테스트 시퀀스 완료. 데이터 수신 중...');
    } catch (error) {
      console.error("Connection or test error:", error);
      const bleError = error as BleError;
      setStatusMessage(`오류: ${bleError.message}`);
      setConnectedDevice(null);
    }
  };
  const handleDisconnect = async () => {
    if (!ftmsManager) {
      setStatusMessage('FTMS Manager가 초기화되지 않았습니다.');
      return;
    }

    setStatusMessage('연결 해제 중...');
    try {
      await ftmsManager.disconnectDevice();
      setConnectedDevice(null);
      setSelectedDevice(null);
      setBikeData(null);
      setStatusMessage('연결 해제됨.');
    } catch (error) {
      console.error("Disconnect error:", error);
      setStatusMessage('연결 해제 중 오류 발생.');
    }
  };

  const renderDeviceItem = ({ item }: { item: Device }) => (
    <TouchableOpacity
      style={[
        styles.deviceItem,
        selectedDevice?.id === item.id && styles.selectedDeviceItem
      ]}
      onPress={() => handleSelectDevice(item)}
    >
      <Text style={styles.deviceText}>{item.name || 'Unknown Device'}</Text>
      <Text style={styles.deviceTextSmall}>{item.id}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>FTMS 테스트 앱</Text>
      <Text style={styles.status}>{statusMessage}</Text>      {!connectedDevice ? (
        <>
          <Button 
            title={isScanning ? "스캔 중..." : "FTMS 장치 스캔"} 
            onPress={handleScan} 
            disabled={isScanning || !ftmsManager} 
          />
          {scannedDevices.length > 0 && (
            <FlatList
              data={scannedDevices}
              renderItem={renderDeviceItem}
              keyExtractor={(item) => item.id}
              style={styles.list}
            />
          )}
          {selectedDevice && (
            <Button title={`'${selectedDevice.name || selectedDevice.id}' 테스트 시작`} onPress={handleConnectAndTest} />
          )}
        </>
      ) : (
        <>
          <Text style={styles.connectedDeviceText}>연결된 장치: {connectedDevice.name || connectedDevice.id}</Text>
          {bikeData && (
            <View style={styles.bikeDataContainer}>
              <Text style={styles.bikeDataTitle}>실시간 데이터:</Text>
              <Text>속도: {bikeData.instantaneousSpeed?.toFixed(2)} km/h</Text>
              <Text>케이던스: {bikeData.instantaneousCadence?.toFixed(1)} rpm</Text>
              <Text>파워: {bikeData.instantaneousPower} W</Text>
              <Text>저항: {bikeData.resistanceLevel}</Text>
              {/* 필요에 따라 더 많은 데이터 필드 표시 */}
            </View>
          )}
          <Button title="테스트 시퀀스 재실행" onPress={() => ftmsManager?.runTestSequence()} />
          <Button title="연결 해제" onPress={handleDisconnect} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingTop: 50,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  status: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  list: {
    width: '100%',
    maxHeight: 200,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  deviceItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  selectedDeviceItem: {
    backgroundColor: '#e0e0ff',
  },
  deviceText: {
    fontSize: 16,
    color: '#333',
  },
  deviceTextSmall: {
    fontSize: 12,
    color: '#777',
  },
  connectedDeviceText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'green',
    marginBottom: 10,
  },
  bikeDataContainer: {
    marginTop: 15,
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 5,
    width: '100%',
    alignItems: 'flex-start',
  },
  bikeDataTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  }
});
