import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, PermissionsAndroid, Platform, Linking } from 'react-native';
import { FTMSManager } from './FtmsManager'; // 경로가 정확한지 확인해주세요.
import { BleError, Device, BleErrorCode, State } from 'react-native-ble-plx';

// 앱 버전 관리
const APP_VERSION = 'v0.0.3';

export default function App() {
  const ftmsManagerRef = useRef<FTMSManager | null>(null);
  const [managerInitialized, setManagerInitialized] = useState<boolean>(false);
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
    // FTMSManager 초기화를 한 번만 수행
    const initializeFtmsManager = async () => {
      // 이미 초기화되었으면 건너뛰기
      if (ftmsManagerRef.current) {
        return;
      }
      
      try {
        const manager = new FTMSManager();
        ftmsManagerRef.current = manager;
        
        // 블루투스 상태 확인
        const isBluetoothOn = await manager.checkBluetoothState();
        if (!isBluetoothOn) {
          setStatusMessage('블루투스가 꺼져있습니다. 블루투스를 켜고 다시 시도하세요.');
        } else {
          setManagerInitialized(true);
          setStatusMessage('FTMS Manager 초기화 완료. 스캔을 시작할 수 있습니다.');
        }
      } catch (error) {
        console.error('FTMSManager 초기화 오류:', error);
        setStatusMessage('FTMS Manager 초기화 실패. BLE가 지원되지 않을 수 있습니다.');
      }
    };

    initializeFtmsManager();
    requestPermissions();

    // 컴포넌트 언마운트 시 한 번만 정리
    return () => {
      if (ftmsManagerRef.current) {
        ftmsManagerRef.current.destroy();
        ftmsManagerRef.current = null;
      }
    };
  }, [requestPermissions]);
    const handleScan = async () => {
    if (!ftmsManagerRef.current) {
      setStatusMessage('FTMS Manager가 아직 초기화되지 않았습니다.');
      return;
    }

    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      setStatusMessage('필수 권한이 거부되었습니다.');
      return;
    }

    // Check Bluetooth state before scanning
    try {
      const isBluetoothOn = await ftmsManagerRef.current.checkBluetoothState();
      if (!isBluetoothOn) {
        setStatusMessage('블루투스가 꺼져있습니다. 블루투스를 켜고 다시 시도하세요.');
        return;
      }
    } catch (error) {
      console.error("Bluetooth state check error:", error);
      setStatusMessage('블루투스 상태 확인 중 오류가 발생했습니다.');
      return;
    }

    setIsScanning(true);
    setScannedDevices([]);
    setSelectedDevice(null);
    setConnectedDevice(null);
    setStatusMessage('FTMS 장치를 스캔 중...');
    try {
      await ftmsManagerRef.current.scanForFTMSDevices(10000, (device) => {
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
      const bleError = error as BleError;
      if (bleError.errorCode === BleErrorCode.BluetoothPoweredOff) {
        setStatusMessage('블루투스가 꺼져있습니다. 블루투스를 켜고 다시 시도하세요.');
      } else {
        setStatusMessage(`스캔 중 오류 발생: ${bleError.message || '알 수 없는 오류'}`);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleSelectDevice = (device: Device) => {
    setSelectedDevice(device);
    setStatusMessage(`${device.name || device.id} 선택됨. 연결 및 테스트 준비 완료.`);
  };
  
  const handleConnectAndTest = async () => {
    if (!ftmsManagerRef.current) {
      setStatusMessage('FTMS Manager가 아직 초기화되지 않았습니다.');
      return;
    }

    if (!selectedDevice) {
      setStatusMessage('테스트할 장치를 먼저 선택하세요.');
      return;
    }
    setStatusMessage(`'${selectedDevice.name || selectedDevice.id}'에 연결 중...`);
    try {
      await ftmsManagerRef.current.disconnectDevice(); // 이전 연결 해제
      const device = await ftmsManagerRef.current.connectToDevice(selectedDevice.id);
      setConnectedDevice(device);
      setStatusMessage(`'${device.name}'에 연결됨. 알림 구독 중...`);

      await ftmsManagerRef.current.subscribeToNotifications(
        (cpResponse) => {
          console.log("App: CP Response:", cpResponse.toString('hex'));
          // UI에 CP 응답 표시 로직 추가 가능
        },
        (newBikeData) => {
          console.log("App: Bike Data:", JSON.stringify(newBikeData, null, 2));
          setBikeData(newBikeData); // UI 업데이트를 위해 상태에 저장
        }
      );
      
      setStatusMessage('알림 구독 완료. 초기 연결 시퀀스 실행 중...');
      
      // connectSequence 실행 - 기본 요청, 리셋, 시작만 수행
      const success = await ftmsManagerRef.current.connectSequence();
      if(success) {
        setStatusMessage('초기 연결 시퀀스 완료. 데이터 수신 중...');
      } else {
        setStatusMessage('초기 연결 시퀀스 중 오류 발생. 다시 시도하세요.');
      }
    } catch (error) {
      console.error("Connection error:", error);
      const bleError = error as BleError;
      setStatusMessage(`오류: ${bleError.message}`);
      setConnectedDevice(null);
    }
  };
  
  const handleDisconnect = async () => {
    if (!ftmsManagerRef.current) {
      setStatusMessage('FTMS Manager가 초기화되지 않았습니다.');
      return;
    }

    setStatusMessage('연결 해제 중...');
    try {
      await ftmsManagerRef.current.disconnectDevice();
      setConnectedDevice(null);
      setSelectedDevice(null);
      setBikeData(null);
      setStatusMessage('연결 해제됨.');
    } catch (error) {
      console.error("Disconnect error:", error);
      setStatusMessage('연결 해제 중 오류 발생.');
    }
  };

  const checkAndEnableBluetooth = async () => {
    if (!ftmsManagerRef.current) {
      setStatusMessage('FTMS Manager가 아직 초기화되지 않았습니다.');
      return;
    }

    try {
      const isBluetoothOn = await ftmsManagerRef.current.checkBluetoothState();
      if (isBluetoothOn) {
        setStatusMessage('블루투스가 켜져 있습니다. 스캔을 시작할 수 있습니다.');
      } else {
        setStatusMessage('블루투스가 꺼져 있습니다. 블루투스 설정으로 이동합니다.');
        // 블루투스 설정으로 이동 (안드로이드만 해당)
        if (Platform.OS === 'android') {
          Linking.openSettings();
        }
      }
    } catch (error) {
      console.error("Bluetooth state check error:", error);
      setStatusMessage('블루투스 상태 확인 중 오류가 발생했습니다.');
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
  );  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.title}>IsYafit</Text>
        <Text style={styles.version}>{APP_VERSION}</Text>
      </View>
      <Text style={styles.status}>{statusMessage}</Text>      {!connectedDevice ? (
        <>
          <View style={styles.buttonsContainer}>
            <TouchableOpacity 
              style={styles.button}
              onPress={checkAndEnableBluetooth}
            >
              <Text style={styles.buttonText}>블루투스 상태 확인</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity 
            style={[styles.buttonPrimary, (isScanning || !managerInitialized) && styles.buttonDisabled]}
            onPress={handleScan}
            disabled={isScanning || !managerInitialized}
          >
            <Text style={styles.buttonPrimaryText}>{isScanning ? "스캔 중..." : "FTMS 장치 스캔"}</Text>
          </TouchableOpacity>
          {scannedDevices.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>발견된 장치</Text>
              <FlatList
                data={scannedDevices}
                renderItem={renderDeviceItem}
                keyExtractor={(item) => item.id}
                style={styles.list}
                showsVerticalScrollIndicator={false}
              />
            </>
          )}
          {selectedDevice && (
            <TouchableOpacity 
              style={styles.buttonConnect} 
              onPress={handleConnectAndTest}
            >
              <Text style={styles.buttonConnectText}>{`'${selectedDevice.name || selectedDevice.id}' 테스트 시작`}</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <>
          <Text style={styles.connectedDeviceText}>연결된 장치: {connectedDevice.name || connectedDevice.id}</Text>
          {bikeData && (
            <View style={styles.bikeDataContainer}>
              <Text style={styles.bikeDataTitle}>실시간 데이터:</Text>
              <View style={styles.dataRow}>
                <View style={styles.dataItem}>
                  <Text style={styles.dataValue}>{bikeData.instantaneousSpeed?.toFixed(2)}</Text>
                  <Text style={styles.dataUnit}>km/h</Text>
                  <Text style={styles.dataLabel}>속도</Text>
                </View>
                <View style={styles.dataItem}>
                  <Text style={styles.dataValue}>{bikeData.instantaneousCadence?.toFixed(1)}</Text>
                  <Text style={styles.dataUnit}>rpm</Text>
                  <Text style={styles.dataLabel}>케이던스</Text>
                </View>
              </View>
              <View style={styles.dataRow}>
                <View style={styles.dataItem}>
                  <Text style={styles.dataValue}>{bikeData.instantaneousPower}</Text>
                  <Text style={styles.dataUnit}>W</Text>
                  <Text style={styles.dataLabel}>파워</Text>
                </View>
                <View style={styles.dataItem}>
                  <Text style={styles.dataValue}>{bikeData.resistanceLevel}</Text>
                  <Text style={styles.dataUnit}></Text>
                  <Text style={styles.dataLabel}>저항</Text>
                </View>
              </View>
            </View>
          )}
          <View style={styles.buttonGroup}>
            <TouchableOpacity 
              style={styles.buttonSecondary}
              onPress={() => {
                if (ftmsManagerRef.current) {
                  setStatusMessage('테스트 시퀀스 실행 중...');
                  ftmsManagerRef.current.runTestSequence()
                    .then(() => setStatusMessage('테스트 시퀀스 완료. 데이터 수신 중...'))
                    .catch(err => setStatusMessage(`테스트 중 오류 발생: ${err.message}`));
                }
              }}
            >
              <Text style={styles.buttonSecondaryText}>테스트 시작</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.buttonDanger}
              onPress={handleDisconnect}
            >
              <Text style={styles.buttonDangerText}>연결 해제</Text>
            </TouchableOpacity>
          </View>
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
    backgroundColor: '#1a2029',
    paddingTop: 70, // Increased top padding as requested
    paddingHorizontal: 20,
  },
  headerContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#00c663',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  version: {
    fontSize: 12,
    color: '#aaa',
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  status: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 25,
    textAlign: 'center',
    opacity: 0.8,
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
  },
  list: {
    width: '100%',
    maxHeight: 350,  // 최대 높이를 220dp에서 350dp로 증가
    marginBottom: 25,
    borderWidth: 0,
    borderRadius: 10,
    overflow: 'hidden',
  },
  deviceItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a3142',
    backgroundColor: '#242c3b',
  },
  selectedDeviceItem: {
    backgroundColor: '#2d3748',
    borderLeftWidth: 3,
    borderLeftColor: '#00c663',
  },
  deviceText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  deviceTextSmall: {
    fontSize: 12,
    color: '#b3b3b3',
    marginTop: 3,
  },
  connectedDeviceText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00c663',
    marginBottom: 15,
  },
  bikeDataContainer: {
    marginTop: 20,
    padding: 18,
    backgroundColor: '#242c3b',
    borderRadius: 12,
    width: '100%',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },  bikeDataTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00c663',
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#242c3b',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 150,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  buttonPrimary: {
    backgroundColor: '#00c663',
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 10,
    width: '90%',
    marginVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  buttonPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    backgroundColor: '#4d5d6e',
    opacity: 0.7,
  },
  sectionTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    alignSelf: 'flex-start',
    marginLeft: 10,
    marginTop: 10,
    marginBottom: 5,
  },
  buttonConnect: {
    backgroundColor: '#00c663',
    paddingVertical: 14,
    paddingHorizontal: 25,
    borderRadius: 10,
    width: '90%',
    marginTop: 5,
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  buttonConnectText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  dataRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  dataItem: {
    flex: 1,
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#1a2029',
    borderRadius: 8,
    marginHorizontal: 5,
  },
  dataValue: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },
  dataUnit: {
    fontSize: 14,
    color: '#aaa',
    marginTop: 2,
  },
  dataLabel: {
    fontSize: 13,
    color: '#00c663',
    marginTop: 5,
    fontWeight: '600',
  },
  buttonGroup: {
    flexDirection: 'row',
    width: '90%',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  buttonSecondary: {
    backgroundColor: '#2d3748',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    width: '48%',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#00c663',
  },
  buttonSecondaryText: {
    color: '#00c663',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    width: '48%',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  buttonDangerText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  }
});
