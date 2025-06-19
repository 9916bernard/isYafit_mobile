import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, PermissionsAndroid, Platform, Linking, ScrollView, SafeAreaView, Modal, Alert, Dimensions, TouchableWithoutFeedback } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FTMSManager, LogEntry } from '../FtmsManager';
import { BleError, Device, BleErrorCode, State } from 'react-native-ble-plx';
import TestScreen from './TestScreen';
import EnhancedTestScreen from './EnhancedTestScreen';
import ModeSelectionScreen from './ModeSelectionScreen';
import RealtimeDataScreen from './RealtimeDataScreen';
import LoadingScreen from './LoadingScreen';
import { Colors, ButtonStyles, CardStyles, TextStyles, Shadows } from '../styles/commonStyles';
import Toast from 'react-native-root-toast';


// 앱 버전 관리
const APP_VERSION = 'v0.5.4';

function App() {
  const insets = useSafeAreaInsets();
  const ftmsManagerRef = useRef<FTMSManager | null>(null);
  const [managerInitialized, setManagerInitialized] = useState<boolean>(false);
  const [scannedDevices, setScannedDevices] = useState<Device[]>([]);  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState('앱 테스트 중입니다.');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [formattedLogs, setFormattedLogs] = useState<string[]>([]);
  const [showTestScreen, setShowTestScreen] = useState(false); // For showing the test screen
  const [showLogScreen, setShowLogScreen] = useState(false); // For showing the enhanced log screen
  const [showModeSelection, setShowModeSelection] = useState(false); // For showing mode selection
  const [showRealtimeData, setShowRealtimeData] = useState(false); // For showing realtime data screen
  const [isLoadingCompatibilityTest, setIsLoadingCompatibilityTest] = useState(false); // For showing loading screen    // Help popup states
  const [isHelpPopupVisible, setIsHelpPopupVisible] = useState(false);
  const screenHeight = Dimensions.get('window').height;

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
    useEffect(() => {    // FTMSManager 초기화를 한 번만 수행
    const initializeFtmsManager = async () => {
      // 이미 초기화되었으면 건너뛰기
      if (ftmsManagerRef.current) {
        return;
      }
      
      try {
        const manager = new FTMSManager();
        ftmsManagerRef.current = manager;
          // Set up log callback to capture logs
        manager.setLogCallback((newLogs) => {
          setLogs(newLogs);
          // Format logs for display
          const formatted = newLogs.map(log => 
            `${new Date(log.timestamp).toLocaleTimeString()} - ${log.message}`
          );
          setFormattedLogs(formatted);
        });
        
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
  };  const handleSelectDevice = (device: Device) => {
    // 이미 선택된 장치를 다시 클릭하면 연결 시도
    if (selectedDevice?.id === device.id) {
      handleShowModeSelection();
      return;
    }
    
    setSelectedDevice(device);
    setStatusMessage(`${device.name || device.id} 선택됨. 모드를 선택하세요.`);
  };
  
  // Show mode selection screen
  const handleShowModeSelection = () => {
    if (!selectedDevice) {
      setStatusMessage('먼저 장치를 선택하세요.');
      return;
    }
    setShowModeSelection(true);
  };  // Help popup functions
  const showHelpPopup = () => {
    setIsHelpPopupVisible(true);
  };
  const hideHelpPopup = () => {
    setIsHelpPopupVisible(false);
  };
  // Handle mode selection
  const handleSelectRealtimeData = async () => {
    setShowModeSelection(false);
    setIsLoadingCompatibilityTest(true); // 로딩 화면 표시 (이름은 호환성 테스트용이지만 재사용)
    
    if (!ftmsManagerRef.current || !selectedDevice) {
      setStatusMessage('FTMS Manager 또는 선택된 장치가 없습니다.');
      setIsLoadingCompatibilityTest(false);
      setShowModeSelection(true);
      return;
    }

    setStatusMessage(`'${selectedDevice.name || selectedDevice.id}'에 연결 중...`);
    try {
      await ftmsManagerRef.current.disconnectDevice(); // 이전 연결 해제
      const device = await ftmsManagerRef.current.connectToDevice(selectedDevice.id);
      setConnectedDevice(device);
      setStatusMessage(`'${device.name}'에 연결됨. 실시간 데이터를 시작합니다.`);      setIsLoadingCompatibilityTest(false);
      setShowRealtimeData(true);
    } catch (error) {
      console.error("Connection error:", error);
      const bleError = error as BleError;
      setStatusMessage(`연결 오류: ${bleError.message}`);
      setConnectedDevice(null);
      setIsLoadingCompatibilityTest(false);
      setShowModeSelection(true);
      
      // 연결 실패 알림 표시
      Alert.alert(
        '연결 실패',
        '기기와 연결에 실패했습니다. 블루투스 상태를 확인해주세요.',
        [{ text: '확인', style: 'default' }]
      );
    }
  };
  const handleSelectCompatibilityTest = async () => {
    setShowModeSelection(false);
    setIsLoadingCompatibilityTest(true);
    
    if (!ftmsManagerRef.current || !selectedDevice) {
      setStatusMessage('FTMS Manager 또는 선택된 장치가 없습니다.');
      setIsLoadingCompatibilityTest(false);
      setShowModeSelection(true);
      return;
    }

    setStatusMessage(`'${selectedDevice.name || selectedDevice.id}'에 연결 중...`);
    try {
      await ftmsManagerRef.current.disconnectDevice(); // 이전 연결 해제
      const device = await ftmsManagerRef.current.connectToDevice(selectedDevice.id);
      setConnectedDevice(device);
      setStatusMessage(`'${device.name}'에 연결됨. 호환성 테스트를 시작합니다.`);
      setIsLoadingCompatibilityTest(false);      setShowTestScreen(true);    } catch (error) {
      console.error("Connection error:", error);
      const bleError = error as BleError;
      setStatusMessage(`연결 오류: ${bleError.message}`);
      setConnectedDevice(null);
      setIsLoadingCompatibilityTest(false);
      setShowModeSelection(true);
      
      // 연결 실패 알림 표시
      Alert.alert(
        '연결 실패',
        '기기와 연결에 실패했습니다. 블루투스 상태를 확인해주세요.',
        [{ text: '확인', style: 'default' }]
      );
    }
  };  const handleBackFromModeSelection = async () => {
    // Disconnect the device when going back from mode selection
    if (!ftmsManagerRef.current) {
      setStatusMessage('FTMS Manager가 초기화되지 않았습니다.');
      return;
    }

    setStatusMessage('연결 해제 중...');
    try {
      await ftmsManagerRef.current.disconnectDevice();
      setConnectedDevice(null);
      setSelectedDevice(null);
      setShowModeSelection(false);
      setStatusMessage('연결 해제됨.');
      
      // 토스트 메시지 표시
      Toast.show('기기와의 연결이 해제되었습니다.', {
        duration: Toast.durations.SHORT,
        position: Toast.positions.BOTTOM,
        shadow: true,
        animation: true,
        hideOnPress: true,
        delay: 0,
        backgroundColor: '#333',
        textColor: '#fff',
      });
    } catch (error) {
      console.error("Disconnect error:", error);
      setStatusMessage('연결 해제 중 오류 발생.');
      setShowModeSelection(false);
      setSelectedDevice(null);
    }
  };
  const handleBackFromRealtimeData = () => {
    setShowRealtimeData(false);
    setShowModeSelection(true); // 모드 선택 화면으로 돌아가기
  };
    const handleRealtimeDataConnectionError = () => {
    setShowRealtimeData(false);
    setShowModeSelection(true);
    
    // 연결 실패 알림 표시
    Alert.alert(
      '연결 실패',
      '기기와 연결에 실패했습니다. 블루투스 상태를 확인해주세요.',
      [{ text: '확인', style: 'default' }]
    );
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
      setShowTestScreen(false);
      setShowRealtimeData(false);
      setStatusMessage('연결 해제됨.');
      
      // 토스트 메시지 표시
      Toast.show('기기와의 연결이 해제되었습니다.', {
        duration: Toast.durations.SHORT,
        position: Toast.positions.BOTTOM,
        shadow: true,
        animation: true,
        hideOnPress: true,
        delay: 0,
        backgroundColor: '#333',
        textColor: '#fff',
      });
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
      }
    } catch (error) {
      console.error("Bluetooth state check error:", error);
      setStatusMessage('블루투스 상태 확인 중 오류가 발생했습니다.');
    }
  };  // FTMS 호환성 테스트 화면 닫기
  const handleCloseTestScreen = () => {
    setShowTestScreen(false);
    setConnectedDevice(null);
    setSelectedDevice(null);
    setIsLoadingCompatibilityTest(false);
    setStatusMessage('테스트가 완료되었습니다.');
  };
    // Close log screen
  const handleCloseLogScreen = async () => {
    // EnhancedTestScreen에서 연결 해제 버튼을 눌렀을 때의 처리
    if (connectedDevice && ftmsManagerRef.current) {
      try {
        await ftmsManagerRef.current.disconnectDevice();
        setConnectedDevice(null);
        setSelectedDevice(null);
        setShowRealtimeData(false);
        setStatusMessage('연결 해제됨.');
      } catch (error) {
        console.error("Disconnect error:", error);
        setStatusMessage('연결 해제 중 오류 발생.');
      }
    }
    setShowLogScreen(false);
  };
  const renderListHeader = () => (
    <LinearGradient 
      colors={[Colors.background, Colors.cardBackground]} 
      style={styles.headerGradient}
    >
      <View style={styles.headerContainer}>
        <View style={styles.titleVersionContainer}>
          <Text style={styles.title}>IsYafit</Text>
          <View style={styles.versionBadge}>
            <Text style={styles.version}>{APP_VERSION}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.bluetoothIconContainer} onPress={checkAndEnableBluetooth}>
          <Icon name="bluetooth" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>
      <Text style={styles.status}>{statusMessage}</Text>
      
      <TouchableOpacity
        style={[
          styles.scanButton,
          (isScanning || !managerInitialized) && styles.buttonDisabled
        ]}        onPress={handleScan}
        disabled={isScanning || !managerInitialized}
      >
        <LinearGradient
          colors={isScanning || !managerInitialized ? 
            [Colors.disabled, Colors.disabled] : 
            [Colors.primary, Colors.accent]
          }
          style={styles.scanButtonGradient}
        >
          <View style={styles.scanButtonContent}>
            {isScanning && <Icon name="radar" size={20} color={Colors.text} style={styles.scanIcon} />}
            <Text style={styles.scanButtonText}>
              {isScanning ? "스캔 중..." : "FTMS 장치 스캔"}
            </Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleContainer}>
          <Icon name="devices" size={20} color={Colors.primary} />
          <Text style={styles.sectionTitle}>발견된 장치</Text>
        </View>        <View style={styles.helpIconWrapper}>
          <TouchableOpacity 
            onPress={showHelpPopup}
            style={styles.helpIconContainer}
            activeOpacity={0.7}
          >
            <Icon name="help-circle-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );  const renderListFooter = () => (
    selectedDevice && (
      <View style={styles.connectButtonContainer}>
        <TouchableOpacity
          style={styles.scanButton}
          onPress={handleShowModeSelection}
        >
          <LinearGradient
            colors={[Colors.primary, Colors.accent]}
            style={styles.connectButtonGradient}
          >
            <Icon name="connection" size={20} color={Colors.text} style={{ marginRight: 8 }} />
            <Text style={styles.scanButtonText}>
              {`'${selectedDevice.name || 'Unknown'}' 연결`}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    )
  );
  const renderDeviceItem = ({ item }: { item: Device }) => (
    <TouchableOpacity
      style={[
        styles.deviceItemCard,
        selectedDevice?.id === item.id && styles.deviceItemSelected
      ]}
      onPress={() => handleSelectDevice(item)}
      activeOpacity={0.7}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: selectedDevice?.id === item.id ? Colors.primary : Colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}>
          <Icon 
            name={selectedDevice?.id === item.id ? "check-circle" : "bluetooth"} 
            size={24} 
            color={selectedDevice?.id === item.id ? Colors.text : Colors.primary} 
          />
        </View>        <View style={{ flex: 1 }}>
          <Text style={[styles.deviceText, { marginBottom: 4 }]}>
            {item.name || 'Unknown Device'}
          </Text>
          <Text style={styles.deviceTextSmall}>{item.id.substring(0, 16)}...</Text>
        </View>
        {selectedDevice?.id === item.id && (
          <Icon name="chevron-right" size={24} color={Colors.primary} />
        )}
      </View>
    </TouchableOpacity>
  );  return (
    <TouchableWithoutFeedback onPress={() => isHelpPopupVisible && hideHelpPopup()}>
      <SafeAreaView style={styles.safeArea}>{/* Show loading screen for compatibility test */}
      {isLoadingCompatibilityTest && selectedDevice ? (
        <LoadingScreen
          device={selectedDevice}
        />
      ) :
      /* Show mode selection screen */
      showModeSelection && selectedDevice ? (
        <ModeSelectionScreen
          device={selectedDevice}
          onSelectRealtimeData={handleSelectRealtimeData}
          onSelectCompatibilityTest={handleSelectCompatibilityTest}
          onDisconnect={handleBackFromModeSelection}
        />
      ) :      /* Show realtime data screen */
      showRealtimeData && connectedDevice && ftmsManagerRef.current ? (
        <RealtimeDataScreen
          device={connectedDevice}
          ftmsManager={ftmsManagerRef.current}
          onBack={handleBackFromRealtimeData}
          onConnectionError={handleRealtimeDataConnectionError}
        />
      ) :      /* Show the test screen when a device is connected and test is requested */
      showTestScreen && connectedDevice && ftmsManagerRef.current ? (
        <TestScreen
          device={connectedDevice}
          ftmsManager={ftmsManagerRef.current}
          onClose={handleCloseTestScreen}
          isDeviceConnected={!!connectedDevice}
        />
      ) :/* Show the enhanced log screen */
      showLogScreen && connectedDevice && ftmsManagerRef.current ? (
        <EnhancedTestScreen
          device={connectedDevice}
          ftmsManager={ftmsManagerRef.current}
          onClose={handleCloseLogScreen}
          isDeviceConnected={!!connectedDevice}
        />
      ) : (
        <>          {!connectedDevice && scannedDevices.length > 0 ? (
            <FlatList
              style={{ flex: 1 }}
              data={scannedDevices}
              renderItem={renderDeviceItem}
              keyExtractor={(item) => item.id}
              ListHeaderComponent={renderListHeader}
              ListFooterComponent={renderListFooter}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ 
                paddingBottom: Math.max(20, insets.bottom),
                flexGrow: 1 
              }}
            />) : (
            <ScrollView 
              contentContainerStyle={[
                styles.scrollViewContent,
                { paddingBottom: Math.max(20, insets.bottom) }
              ]}
            >
              <LinearGradient 
                colors={[Colors.background, Colors.cardBackground]} 
                style={styles.headerGradient}
              >
                <View style={styles.headerContainer}>
                  <View style={styles.titleVersionContainer}>
                    <Text style={styles.title}>IsYafit</Text>
                    <View style={styles.versionBadge}>
                      <Text style={styles.version}>{APP_VERSION}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.bluetoothIconContainer} onPress={checkAndEnableBluetooth}>
                    <Icon name="bluetooth" size={24} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.status}>{statusMessage}</Text>

                {!connectedDevice ? (
                  <>
                    <TouchableOpacity 
                      style={[
                        styles.scanButton,
                        (isScanning || !managerInitialized) && styles.buttonDisabled
                      ]}                      onPress={handleScan}
                      disabled={isScanning || !managerInitialized}
                    >
                      <LinearGradient
                        colors={isScanning || !managerInitialized ? 
                          [Colors.disabled, Colors.disabled] : 
                          [Colors.primary, Colors.accent]
                        }
                        style={styles.scanButtonGradient}
                      >
                        <View style={styles.scanButtonContent}>
                          {isScanning && <Icon name="radar" size={20} color={Colors.text} style={styles.scanIcon} />}
                          <Text style={styles.scanButtonText}>
                            {isScanning ? "스캔 중..." : "FTMS 장치 스캔"}
                          </Text>
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                    
                    {scannedDevices.length === 0 && !isScanning && statusMessage.includes("스캔 완료") && (
                      <View style={{
                        backgroundColor: Colors.secondary,
                        padding: 20,
                        borderRadius: 12,
                        alignItems: 'center',
                        marginTop: 20,
                      }}>
                        <Icon name="bluetooth-off" size={48} color={Colors.textSecondary} />
                        <Text style={{
                          color: Colors.textSecondary, 
                          marginTop: 12, 
                          textAlign: 'center',
                          fontSize: 16,
                        }}>
                          발견된 장치가 없습니다.
                        </Text>
                        <Text style={{
                          color: Colors.textSecondary, 
                          marginTop: 8, 
                          textAlign: 'center',
                          fontSize: 14,
                        }}>
                          FTMS 장치가 켜져 있는지 확인해보세요.
                        </Text>
                      </View>
                    )}
                    
                    {selectedDevice && (
                      <View style={styles.connectButtonContainer}>
                        <TouchableOpacity 
                          style={styles.scanButton}
                          onPress={handleShowModeSelection}
                        >
                          <LinearGradient
                            colors={[Colors.primary, Colors.accent]}
                            style={styles.connectButtonGradient}
                          >
                            <Icon name="connection" size={20} color={Colors.text} style={{ marginRight: 8 }} />
                            <Text style={styles.scanButtonText}>
                              {`'${selectedDevice.name || 'Unknown'}' 연결`}
                            </Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    <View style={[CardStyles.elevated, { alignItems: 'center' }]}>
                      <Icon name="check-circle" size={48} color={Colors.success} />
                      <Text style={[styles.connectedDeviceText, { marginTop: 12 }]}>
                        연결된 장치: {connectedDevice.name || connectedDevice.id}
                      </Text>
                    </View>
                    <View style={styles.buttonGroup}>
                      <TouchableOpacity 
                        style={[ButtonStyles.danger, { width: '48%' }]}
                        onPress={handleDisconnect}
                      >
                        <Text style={styles.buttonDangerText}>연결 해제</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </LinearGradient>
            </ScrollView>
          )}        </>
      )}        {/* Help Popup Modal */}
        <Modal
          transparent={true}
          visible={isHelpPopupVisible}
          animationType="fade"
          onRequestClose={hideHelpPopup}
        >
          <TouchableWithoutFeedback onPress={hideHelpPopup}>
            <View style={styles.modalOverlay}>              <View style={styles.helpBubbleContainer}>
                <View style={styles.helpBubble}>
                  <View style={styles.helpBubbleContent}>
                    <View style={styles.helpBubbleHeader}>
                      <Icon name="help-circle" size={20} color={Colors.primary} />
                      <Text style={styles.helpBubbleTitle}>기기 호환성 안내</Text>
                      <TouchableOpacity onPress={hideHelpPopup}>
                        <Icon name="close" size={16} color={Colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.helpBubbleText}>
                      기기가 스캔되지 않는다면 기기의 UUID가 아래의 프로토콜 혹은 센서에 포함되는지 확인해주세요.
                    </Text>
                    <Text style={styles.helpBubbleText}>
                      만약 포함되지 않는다면 이는 Yafit 에 호환되지 않는 기기입니다. 관계자에게 문의해주세요.
                    </Text>
                    <View style={styles.helpBubbleProtocols}>
                      <Text style={styles.helpBubbleSubtitle}>프로토콜:</Text>
                      <Text style={styles.helpBubbleProtocolText}>FTMS, Mobi, Reborn, Tacx</Text>
                      <Text style={styles.helpBubbleSubtitle}>센서:</Text>
                      <Text style={styles.helpBubbleProtocolText}>CSC, FitShow, YAFIT, R1</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
    </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1a2029',
  },  scrollViewContent: {
    flexGrow: 1,
    // justifyContent: 'flex-start', // Content within ScrollView will determine its own alignment
    // alignItems: 'center', // Content within ScrollView will determine its own alignment
  },
  container: {
    flex: 1, // Allow container to fill ScrollView or be part of FlatList header/footer
    justifyContent: 'flex-start',
    alignItems: 'center',
    backgroundColor: '#1a2029',
    paddingTop: Platform.OS === 'android' ? 40 : 80, // Increased top padding
    paddingBottom: 40, // Added bottom padding
    paddingHorizontal: 20,
    width: '100%', // Ensure container takes full width within ScrollView
  },
  headerContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start', // Align items to the start for better control over version text
    marginBottom: 25, // Increased margin
  },
  titleVersionContainer: {
    flexDirection: 'row', // Changed to row
    alignItems: 'center', // Align items vertically in the center
  },
  title: {
    fontSize: 36, // Slightly increased font size
    fontWeight: 'bold',
    color: '#00c663',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginRight: 10, // Add some margin to the right of the title
  },
  version: {
    fontSize: 12,
    color: '#aaa',
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    // Removed marginLeft and marginTop, alignment handled by flexDirection: 'row' and alignItems: 'center' in titleVersionContainer
  },
  bluetoothIconContainer: {
    padding: 10,
    borderRadius: 20, // Make it circular
    backgroundColor: '#242c3b', // Same as other buttons for consistency
    // Positioned by headerContainer's justifyContent: 'space-between'
  },
  bluetoothIconText: {
    color: '#00c663', // Icon color
    fontSize: 16,
    fontWeight: 'bold',
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
    // maxHeight: 350, // No longer needed here if FlatList is primary scroller or items are rendered in ScrollView
    marginBottom: 0, // This might still be useful if list is shown within ScrollView context
    borderWidth: 0,
    borderRadius: 10,
    overflow: 'hidden',
  },
  deviceItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a3142',
    backgroundColor: '#242c3b',
    // marginHorizontal will be added dynamically in renderDeviceItem for alignment
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
    paddingVertical: 0, // Increased padding
    paddingHorizontal: 30,
    borderRadius: 10,
    width: '100%', // Changed from 90% to 100% to fill container (respecting parent padding)
    marginVertical: 15, // Increased margin
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  buttonPrimaryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    backgroundColor: '#4d5d6e',
    opacity: 0.7,
  },  sectionTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
  },
  buttonConnect: {
    backgroundColor: '#00c663',
    paddingVertical: 0,
    paddingHorizontal: 25,
    borderRadius: 10,
    width: '100%', // Changed from 90% to 100%
    marginTop: 0, // Adjusted margin
    marginBottom: 30,
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
  },
  buttonTestCompatibility: {
    backgroundColor: '#4a5568',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    width: '90%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  buttonTestCompatibilityText: {
    color: '#edf2f4',
    fontSize: 16,
    fontWeight: '500',
  },
  // 새로운 UI 스타일들
  headerGradient: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 20,
  },
  versionBadge: {
    backgroundColor: Colors.secondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.primary,
    ...Shadows.small,
  },
  scanButton: {
    marginVertical: 15,
    borderRadius: 16,
    overflow: 'hidden',
    ...Shadows.medium,
  },  scanButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,  },
  scanButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  scanIcon: {
    marginRight: 8,
  },
  scanButtonText: {    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 8,
  },
  deviceItemCard: {

    backgroundColor: Colors.secondary,
    marginHorizontal: 16,
    marginTop: 15,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.small,
  },
  deviceItemSelected: {
    borderColor: Colors.primary,
    borderWidth: 2,
    backgroundColor: Colors.cardBackground,
    ...Shadows.medium,
  },
  connectButtonContainer: {
    paddingHorizontal: 20,
  },  connectButtonGradient: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 16,    alignItems: 'center',
    justifyContent: 'center',
  },
  helpIcon: {
    padding: 4,
    marginLeft: 8,
  },  helpIconContainer: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  helpIconWrapper: {
    position: 'relative',  },
  helpBubble: {
    backgroundColor: '#1a2029', // 더 진한 배경색으로 변경
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 100, // Android에서 최고 레벨
    width: '100%', // 컨테이너 전체 너비 사용
  },
  helpBubbleContent: {
    padding: 12,
    minHeight: 100, // 최소 높이 설정
  },
  helpBubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  helpBubbleTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.text,
    flex: 1,
    marginLeft: 6,
  },
  helpBubbleText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
    marginBottom: 8,
    textAlign: 'left', // 텍스트 정렬 명시
  },
  helpBubbleProtocols: {
    marginTop: 4,
    padding: 8,
    backgroundColor: '#242c3b', // 프로토콜 영역도 더 진한 색상으로 변경
    borderRadius: 6,
  },
  helpBubbleSubtitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 2,
    marginTop: 4,
  },
  helpBubbleProtocolText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '500',
    marginBottom: 2,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent', // 투명한 배경
  },  helpBubbleContainer: {
    position: 'absolute',
    top: Dimensions.get('window').height / 3, // 화면 높이의 1/3 지점
    right: 20,
    width: 260,
  },
});

// SafeAreaProvider로 감싸서 내보내기
export default function AppWrapper() {
  return (
    <SafeAreaProvider>
      <App />
    </SafeAreaProvider>
  );
}

