import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, PermissionsAndroid, Platform, ScrollView, SafeAreaView, Modal, Alert, Dimensions, TouchableWithoutFeedback, Animated, findNodeHandle, UIManager, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FTMSManager } from '../FtmsManager';
import { BleError, Device, BleErrorCode } from 'react-native-ble-plx';
import TestScreen from './TestScreen';
import ModeSelectionScreen from './ModeSelectionScreen';
import RealtimeDataScreen from './RealtimeDataScreen';
import LoadingScreen from './LoadingScreen';
import PastReportsScreen from './PastReportsScreen';
import { Colors, ButtonStyles, CardStyles, Shadows } from '../styles/commonStyles';
import Toast from 'react-native-root-toast';
import { useTranslation } from 'react-i18next';
import { setLanguage, initializeLanguage } from '../utils/i18n';


// 0.8.0 FitShow 프로토콜 구현 개선 (FTMS indoor bike data 형식 사용)
const APP_VERSION = 'v1.0.1';

function App() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const ftmsManagerRef = useRef<FTMSManager | null>(null);
  const [managerInitialized, setManagerInitialized] = useState<boolean>(false);
  const [languageInitialized, setLanguageInitialized] = useState<boolean>(false);
  const [scannedDevices, setScannedDevices] = useState<Device[]>([]);  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [showTestScreen, setShowTestScreen] = useState(false); // For showing the test screen
  const [showModeSelection, setShowModeSelection] = useState(false); // For showing mode selection
  const [showRealtimeData, setShowRealtimeData] = useState(false); // For showing realtime data screen
  const [isLoadingCompatibilityTest, setIsLoadingCompatibilityTest] = useState(false); // For showing loading screen
  const [showPastReports, setShowPastReports] = useState(false); // For showing past reports screen
  const [isHelpPopupVisible, setIsHelpPopupVisible] = useState(false);
  const [helpPopupPos, setHelpPopupPos] = useState<{x: number, y: number}>({x: 0, y: 0});
  const helpIconRef = useRef(null);
  const helpPopupAnim = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [showTermsOfService, setShowTermsOfService] = useState(false);

  const languageOrder: ('ko' | 'en' | 'zh')[] = ['ko', 'en', 'zh'];
  const languageLabels = { ko: 'KO', en: 'EN', zh: '中' };

  // 언어 초기화
  useEffect(() => {
    const initLanguage = async () => {
      try {
        await initializeLanguage();
        setLanguageInitialized(true);
        setStatusMessage(t('app.status.init'));
      } catch (error) {
        console.error('Failed to initialize language:', error);
        setLanguageInitialized(true);
        setStatusMessage(t('app.status.init'));
      }
    };
    
    initLanguage();
  }, []);

  // FTMSManager 초기화를 한 번만 수행
  useEffect(() => {
    const initializeFtmsManager = async () => {
      // 이미 초기화되었으면 건너뛰기
      if (ftmsManagerRef.current) {
        return;
      }
      
      try {
        const manager = new FTMSManager();
        ftmsManagerRef.current = manager;
        
        // Set up log callback to capture logs
        manager.setLogCallback((_newLogs) => {
          // Log callback is set up but not used in UI
        });
        
        // 블루투스 상태 확인
        const isBluetoothOn = await manager.checkBluetoothState();
        if (!isBluetoothOn) {
          setStatusMessage(t('app.status.bluetoothOff'));
        } else {
          setManagerInitialized(true);
          setStatusMessage(t('app.status.ready'));
        }
      } catch (error) {
        console.error('BLEManager 초기화 오류:', error);
        setStatusMessage(t('app.status.bleManagerInitFailed'));
      }
    };

    initializeFtmsManager();
    requestPermissions();

    // 컴포넌트 언마운트 시 정리
    return () => {
      if (ftmsManagerRef.current) {
        ftmsManagerRef.current.destroy();
        ftmsManagerRef.current = null;
      }
    };
  }, []); // 의존성 배열을 빈 배열로 변경하여 한 번만 실행

  // 언어 변경 시 상태 메시지 업데이트
  useEffect(() => {
    if (managerInitialized) {
      // FTMSManager가 이미 초기화된 경우에만 상태 메시지 업데이트
      if (ftmsManagerRef.current) {
        // 현재 상태에 맞는 메시지로 업데이트
        ftmsManagerRef.current.checkBluetoothState().then(isBluetoothOn => {
          if (!isBluetoothOn) {
            setStatusMessage(t('app.status.bluetoothOff'));
          } else {
            setStatusMessage(t('app.status.ready'));
          }
        }).catch(() => {
          setStatusMessage(t('app.status.bleManagerInitFailed'));
        });
      }
    }
  }, [t, managerInitialized]); // 언어 변경 시에만 실행

  // 언어 변경 시 현재 상태 메시지 업데이트 (스캔 중, 완료 등)
  useEffect(() => {
    const translatableKeys = ['init', 'ready', 'scanning', 'scanComplete', 'bluetoothOff', 'bleManagerInitFailed'];
    const currentKey = translatableKeys.find(key => 
      statusMessage === t(`app.status.${key}`) || 
      statusMessage.includes(t(`app.status.${key}`))
    );
    
    if (currentKey && managerInitialized) {
      // 현재 상태에 맞는 번역된 메시지로 업데이트
      if (currentKey === 'scanning') {
        setStatusMessage(t('app.status.scanning'));
      } else if (currentKey === 'scanComplete') {
        setStatusMessage(t('app.status.scanComplete'));
      } else if (currentKey === 'ready') {
        setStatusMessage(t('app.status.ready'));
      } else if (currentKey === 'bluetoothOff') {
        setStatusMessage(t('app.status.bluetoothOff'));
      } else if (currentKey === 'bleManagerInitFailed') {
        setStatusMessage(t('app.status.bleManagerInitFailed'));
      }
    }
  }, [t, statusMessage, managerInitialized]);

  const handleToggleLanguage = async () => {
    const currentLang = i18n.language as 'ko' | 'en' | 'zh';
    const currentIndex = languageOrder.indexOf(currentLang);
    const nextLang = languageOrder[(currentIndex + 1) % languageOrder.length];
    await setLanguage(nextLang);
  };

  const handlePastReports = () => {
    setShowPastReports(true);
    setIsMenuVisible(false);
  };

  const handlePatchNotes = () => {
    // TODO: 패치 내역 기능 구현
    setStatusMessage(t('app.status.patchNotesPreparing'));
  };

  const handleTermsOfService = () => {
    setShowTermsOfService(true);
    setIsMenuVisible(false);
  };

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

  const handleScan = async () => {
    if (!ftmsManagerRef.current) {
      setStatusMessage(t('app.status.init'));
      return;
    }

    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      setStatusMessage(t('app.status.permissionDenied'));
      return;
    }

    // Check Bluetooth state before scanning
    try {
      const isBluetoothOn = await ftmsManagerRef.current.checkBluetoothState();
      if (!isBluetoothOn) {
        setStatusMessage(t('app.status.bluetoothOff'));
        return;
      }
    } catch (error) {
      console.error("Bluetooth state check error:", error);
      setStatusMessage(t('app.status.bluetoothStateCheckError'));
      return;
    }

    setIsScanning(true);
    setScannedDevices([]);
    setSelectedDevice(null);
    setConnectedDevice(null);
    setStatusMessage(t('app.status.scanning'));
    //#region Scan Device
    try {
      await ftmsManagerRef.current.scanForFTMSDevices(10000, (device) => {
        setScannedDevices((prevDevices) => {
          if (!prevDevices.find(d => d.id === device.id)) {
            return [...prevDevices, device];
          }
          return prevDevices;
        });
      });
      setStatusMessage(t('app.status.scanComplete'));
    } catch (error) {
      console.error("Scan error:", error);
      const bleError = error as BleError;
      if (bleError.errorCode === BleErrorCode.BluetoothPoweredOff) {
        setStatusMessage(t('app.status.bluetoothOff'));
      } else {
        setStatusMessage(t('app.status.scanError', { error: bleError.message || t('app.status.unknownError') }));
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
    setStatusMessage(t('app.status.deviceSelected', { deviceName: device.name || device.id }));
  };
  
  // Show mode selection screen
  const handleShowModeSelection = () => {
    if (!selectedDevice) {
      setStatusMessage(t('app.status.init'));
      return;
    }
    setShowModeSelection(true);
  };  // Help popup functions
  const showHelpPopup = () => {
    if (helpIconRef.current) {
      const nodeHandle = findNodeHandle(helpIconRef.current);
      if (nodeHandle) {
        UIManager.measureInWindow(
          nodeHandle,
          (x, y, width, height) => {
            // 팝업을 ? 아이콘 바로 아래에 위치시키기 위해 y+height
            setHelpPopupPos({
              x: Math.min(x, screenWidth - 270), // 팝업 너비 고려
              y: y + height + 4, // 아래로 약간 띄움
            });
            setIsHelpPopupVisible(true);
            Animated.timing(helpPopupAnim, {
              toValue: 1,
              duration: 180,
              useNativeDriver: true,
            }).start();
          }
        );
      }
    }
  };
  const hideHelpPopup = () => {
    Animated.timing(helpPopupAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      setIsHelpPopupVisible(false);
    });
  };
  //#region mode slection connection
  // Handle mode selection
  const handleSelectRealtimeData = async () => {
    setShowModeSelection(false);
    setIsLoadingCompatibilityTest(true); // 로딩 화면 표시 (이름은 호환성 테스트용이지만 재사용)
    
    if (!ftmsManagerRef.current || !selectedDevice) {
      setStatusMessage(t('app.status.init'));
      setIsLoadingCompatibilityTest(false);
      setShowModeSelection(true);
      return;
    }

    setStatusMessage(t('app.status.connectingToDevice', { deviceName: selectedDevice.name || selectedDevice.id }));
    //실시간 데이터 연결 로직
    try {
      await ftmsManagerRef.current.disconnectDevice(); // 이전 연결 해제
      const device = await ftmsManagerRef.current.connectToDevice(selectedDevice.id);
      setConnectedDevice(device);
      setStatusMessage(t('app.status.connectedRealtimeData', { deviceName: device.name }));
      setIsLoadingCompatibilityTest(false);
      setShowRealtimeData(true);
    } catch (error) {
      console.error("Connection error:", error);
      const bleError = error as BleError;
      setStatusMessage(t('app.status.connectionError', { error: bleError.message }));
      setConnectedDevice(null);
      setIsLoadingCompatibilityTest(false);
      setShowModeSelection(true);
      
      // 연결 실패 알림 표시
      Alert.alert(
        t('app.alerts.connectionFailed'),
        t('app.alerts.connectionFailedMessage'),
        [{ text: t('app.alerts.confirm'), style: 'default' }]
      );
    }
  };
  const handleSelectCompatibilityTest = async () => {
    setShowModeSelection(false);
    setIsLoadingCompatibilityTest(true);
    
    if (!ftmsManagerRef.current || !selectedDevice) {
      setStatusMessage(t('app.status.init'));
      setIsLoadingCompatibilityTest(false);
      setShowModeSelection(true);
      return;
    }

    setStatusMessage(t('app.status.connectingToDevice', { deviceName: selectedDevice.name || selectedDevice.id }));
    // 호환성 테스트 연결 로직
    try {
      await ftmsManagerRef.current.disconnectDevice(); // 이전 연결 해제
      const device = await ftmsManagerRef.current.connectToDevice(selectedDevice.id);
      setConnectedDevice(device);
      setStatusMessage(t('app.status.connectedCompatibilityTest', { deviceName: device.name }));
      setIsLoadingCompatibilityTest(false);
      setShowTestScreen(true);
    } catch (error) {
      console.error("Connection error:", error);
      const bleError = error as BleError;
      setStatusMessage(t('app.status.connectionError', { error: bleError.message }));
      setConnectedDevice(null);
      setIsLoadingCompatibilityTest(false);
      setShowModeSelection(true);
      
      // 연결 실패 알림 표시
      Alert.alert(
        t('app.alerts.connectionFailed'),
        t('app.alerts.connectionFailedMessage'),
        [{ text: t('app.alerts.confirm'), style: 'default' }]
      );
    }
  };  const handleBackFromModeSelection = async () => {
    // Disconnect the device when going back from mode selection
    if (!ftmsManagerRef.current) {
      setStatusMessage(t('app.status.init'));
      return;
    }

    setStatusMessage(t('app.status.disconnecting'));
    try {
      await ftmsManagerRef.current.disconnectDevice();
      setConnectedDevice(null);
      setSelectedDevice(null);
      setShowModeSelection(false);
      setStatusMessage(t('app.status.disconnectedSuccess'));
      
      // 토스트 메시지 표시 (안나옴)
      Toast.show(t('app.status.disconnected'), {
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
      setStatusMessage(t('app.status.disconnectError'));
    }
  };
  const handleBackFromRealtimeData = () => {
    setShowRealtimeData(false);
    setShowModeSelection(true); // 모드 선택 화면으로 돌아가기
  };

    const handleDisconnect = async () => {
    if (!ftmsManagerRef.current) {
      setStatusMessage(t('app.status.init'));
      return;
    }

    setStatusMessage('연결 해제 중...');
    try {
      await ftmsManagerRef.current.disconnectDevice();
      setConnectedDevice(null);
      setSelectedDevice(null);
      setShowTestScreen(false);
      setShowRealtimeData(false);
      setStatusMessage(t('app.status.disconnectedSuccess'));
      
      // 토스트 메시지 표시 (안나옴)
      Toast.show(t('app.status.disconnected'), {
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
      setStatusMessage(t('app.status.disconnectError'));
    }
  };

  const handleCloseTestScreen = () => {
    setShowTestScreen(false);
    setConnectedDevice(null);
    setSelectedDevice(null);
    setIsLoadingCompatibilityTest(false);
    setStatusMessage(t('app.status.ready'));
  };
  //#region Device List 
  const renderListHeader = () => (
    <LinearGradient 
      colors={[Colors.background, Colors.cardBackground]} 
      style={styles.headerGradient}
    >
      <View style={styles.headerContainer}>
        <View style={styles.titleVersionColumn}>
          <Text style={styles.title}>{t('app.title')}</Text>
          <Text style={styles.versionPlain}>{APP_VERSION}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={styles.menuIconContainer} onPress={() => setIsMenuVisible(true)}>
            <Icon name="menu" size={24} color={Colors.primary} />
          </TouchableOpacity>
        </View>
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
              {isScanning ? t('app.buttons.scanning') : t('app.buttons.scan')}
            </Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleContainer}>
          <Icon name="devices" size={20} color={Colors.primary} />
          <Text style={styles.sectionTitle}>{t('app.sections.devices')}</Text>
        </View>
        <View style={styles.helpIconWrapper}>
          <TouchableOpacity 
            ref={helpIconRef}
            onPress={showHelpPopup}
            style={styles.helpIconContainer}
            activeOpacity={0.7}
          >
            <Icon name="help-circle-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
  const renderListFooter = () => (
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
            <Icon name="connection" size={30} color={Colors.text} style={{ marginRight: 8 }} />
            <Text style={styles.scanButtonText}>
              {t('app.buttons.connectDevice', { deviceName: selectedDevice.name || t('common.unknown') })}
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
        </View>
        <View style={{ flex: 1 }}>
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
  );
  //#region Touch feedback part
  // 조건부로 TouchableWithoutFeedback으로 감싸기
  const SafeAreaContent = (
    <SafeAreaView style={styles.safeArea}>
      {/* Show loading screen while language is initializing */}
      {!languageInitialized ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>언어 설정을 불러오는 중...</Text>
        </View>
      ) :
      /* Show loading screen for compatibility test */
      isLoadingCompatibilityTest && selectedDevice ? (
        <LoadingScreen device={selectedDevice} />
      ) :
      /* Show mode selection screen */
      showModeSelection && selectedDevice ? (
        <ModeSelectionScreen
          device={selectedDevice}
          onSelectRealtimeData={handleSelectRealtimeData}
          onSelectCompatibilityTest={handleSelectCompatibilityTest}
          onDisconnect={handleBackFromModeSelection}
        />
      ) :
      /* Show realtime data screen */
      showRealtimeData && connectedDevice && ftmsManagerRef.current ? (
        <RealtimeDataScreen
          device={connectedDevice}
          ftmsManager={ftmsManagerRef.current}
          onBack={handleBackFromRealtimeData}
          //onConnectionError={handleRealtimeDataConnectionError}
        />
      ) :
      /* Show the test screen when a device is connected and test is requested */
      showTestScreen && connectedDevice && ftmsManagerRef.current ? (
        <TestScreen
          device={connectedDevice}
          ftmsManager={ftmsManagerRef.current}
          onClose={handleCloseTestScreen}
        />
      ) :
      /* Show past reports screen */
      showPastReports ? (
        <PastReportsScreen
          onBack={() => setShowPastReports(false)}
        />
      ) : (
        <>{!connectedDevice && scannedDevices.length > 0 ? (
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
                  <View style={styles.titleVersionColumn}>
                    <Text style={styles.title}>{t('app.title')}</Text>
                    <Text style={styles.versionPlain}>{APP_VERSION}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity style={styles.menuIconContainer} onPress={() => setIsMenuVisible(true)}>
                      <Icon name="menu" size={24} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.status}>{statusMessage}</Text>

                {!connectedDevice ? (
                  <>
                    <TouchableOpacity 
                      style={[
                        styles.scanButton,
                        (isScanning || !managerInitialized) && styles.buttonDisabled
                      ]} onPress={handleScan}
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
                            {isScanning ? t('app.buttons.scanning') : t('app.buttons.scan')}
                          </Text>
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                    {scannedDevices.length === 0 && !isScanning && statusMessage.includes(t('app.status.scanComplete')) && (
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
                          {t('app.sections.noDevicesFound')}
                        </Text>
                        <Text style={{
                          color: Colors.textSecondary, 
                          marginTop: 8, 
                          textAlign: 'center',
                          fontSize: 14,
                        }}>
                          {t('app.sections.noDevicesHelp')}
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
                              {t('app.buttons.connectDevice', { deviceName: selectedDevice.name || t('common.unknown') })}
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
                        {t('app.sections.connectedDevice')} {connectedDevice.name || connectedDevice.id}
                      </Text>
                    </View>
                    <View style={styles.buttonGroup}>
                      <TouchableOpacity 
                        style={[ButtonStyles.danger, { width: '48%' }]}
                        onPress={handleDisconnect}
                      >
                        <Text style={styles.buttonDangerText}>{t('app.buttons.disconnect')}</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </LinearGradient>
            </ScrollView>
          )}
        </>
      )}    
      {/* Help Popup (absolute, animated, not Modal) */}
      {isHelpPopupVisible && (
        <Animated.View
          style={[
            styles.animatedHelpPopup,
            {
              left: helpPopupPos.x,
              top: helpPopupPos.y,
              opacity: helpPopupAnim,
              transform: [
                {
                  scale: helpPopupAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.92, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.helpBubble}>
            <View style={styles.helpBubbleContent}>
              <View style={styles.helpBubbleHeader}>
                <Icon name="help-circle" size={20} color={Colors.primary} />
                <Text style={styles.helpBubbleTitle}>{t('help.title')}</Text>
                <TouchableOpacity onPress={hideHelpPopup}>
                  <Icon name="close" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.helpBubbleText}>
                {t('help.description')}
              </Text>
              <Text style={styles.helpBubbleText}>
                {t('help.note')}
              </Text>
              <View style={styles.helpBubbleProtocols}>
                <Text style={styles.helpBubbleSubtitle}>{t('help.protocols')}</Text>
                <Text style={styles.helpBubbleProtocolText}>{t('help.protocolsList')}</Text>
                <Text style={styles.helpBubbleSubtitle}>{t('help.customProtocols')}</Text>
                <Text style={styles.helpBubbleProtocolText}>{t('help.customProtocolsList')}</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
  //#region Menu
  if (isHelpPopupVisible) {
    return (
      <>
        {/* Menu Modal */}
        <Modal
          visible={isMenuVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsMenuVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => setIsMenuVisible(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.menuModal}>
                  <View style={styles.menuHeader}>
                    <Text style={styles.menuTitle}>{t('app.menu')}</Text>
                    <TouchableOpacity onPress={() => setIsMenuVisible(false)}>
                      <Icon name="close" size={24} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.menuItem} onPress={handleToggleLanguage}>
                    <Icon name="translate" size={20} color={Colors.primary} />
                    <Text style={styles.menuItemText}>{t('app.languageSettings')}</Text>
                    <Text style={styles.menuItemSubtext}>{languageLabels[i18n.language as 'ko' | 'en' | 'zh']}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuItem} onPress={handlePastReports}>
                    <Icon name="file-document-outline" size={20} color={Colors.primary} />
                    <Text style={styles.menuItemText}>{t('app.pastReports')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuItem} onPress={handlePatchNotes}>
                    <Icon name="update" size={20} color={Colors.primary} />
                    <Text style={styles.menuItemText}>{t('app.patchNotes')}</Text>
                    <Text style={styles.menuItemSubtext}>{t('menu.preparing')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuItem} onPress={handleTermsOfService}>
                    <Icon name="file-document" size={20} color={Colors.primary} />
                    <Text style={styles.menuItemText}>{t('app.termsOfService')}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
        {/* Terms of Service Modal */}
        <Modal
          visible={showTermsOfService}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowTermsOfService(false)}
        >
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <View style={styles.termsModal}>
              <View style={styles.termsHeader}>
                <Text style={styles.termsTitle}>{t('terms.title')}</Text>
                <TouchableOpacity onPress={() => setShowTermsOfService(false)}>
                  <Icon name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.termsContent}>
                <Text style={styles.termsText}>{t('terms.content')}</Text>
              </ScrollView>
              <TouchableOpacity 
                style={styles.termsCloseButton}
                onPress={() => setShowTermsOfService(false)}
              >
                <Text style={styles.termsCloseButtonText}>{t('app.close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        <TouchableWithoutFeedback onPress={hideHelpPopup}>
          {SafeAreaContent}
        </TouchableWithoutFeedback>
      </>
    );
  } else {
    return (
      <>
        {/* Menu Modal */}
        <Modal
          visible={isMenuVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsMenuVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => setIsMenuVisible(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.menuModal}>
                  <View style={styles.menuHeader}>
                    <Text style={styles.menuTitle}>{t('app.menu')}</Text>
                    <TouchableOpacity onPress={() => setIsMenuVisible(false)}>
                      <Icon name="close" size={24} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.menuItem} onPress={handleToggleLanguage}>
                    <Icon name="translate" size={20} color={Colors.primary} />
                    <Text style={styles.menuItemText}>{t('app.languageSettings')}</Text>
                    <Text style={styles.menuItemSubtext}>{languageLabels[i18n.language as 'ko' | 'en' | 'zh']}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuItem} onPress={handlePastReports}>
                    <Icon name="file-document-outline" size={20} color={Colors.primary} />
                    <Text style={styles.menuItemText}>{t('app.pastReports')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuItem} onPress={handlePatchNotes}>
                    <Icon name="update" size={20} color={Colors.primary} />
                    <Text style={styles.menuItemText}>{t('app.patchNotes')}</Text>
                    <Text style={styles.menuItemSubtext}>{t('menu.preparing')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuItem} onPress={handleTermsOfService}>
                    <Icon name="file-document" size={20} color={Colors.primary} />
                    <Text style={styles.menuItemText}>{t('app.termsOfService')}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
        {/* Terms of Service Modal */}
        <Modal
          visible={showTermsOfService}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowTermsOfService(false)}
        >
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <View style={styles.termsModal}>
              <View style={styles.termsHeader}>
                <Text style={styles.termsTitle}>{t('terms.title')}</Text>
                <TouchableOpacity onPress={() => setShowTermsOfService(false)}>
                  <Icon name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.termsContent}>
                <Text style={styles.termsText}>{t('terms.content')}</Text>
              </ScrollView>
              <TouchableOpacity 
                style={styles.termsCloseButton}
                onPress={() => setShowTermsOfService(false)}
              >
                <Text style={styles.termsCloseButtonText}>{t('app.close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        {SafeAreaContent}
      </>
    );
  }
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
  titleVersionColumn: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  title: {
    fontSize: 36, // Slightly increased font size
    fontWeight: 'bold',
    color: '#00c663',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginRight: 10, // Add some margin to the right of the title
  },
  versionPlain: {
    fontSize: 10, // Even smaller than before
    color: '#aaa',
    marginTop: 0,
    marginLeft: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: 'transparent',
    fontWeight: '400',
  },
  menuIconContainer: {
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
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    borderRadius: 12,
  },
  languageLabel: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  sectionHeader: {
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
  animatedHelpPopup: {
    position: 'absolute',
    zIndex: 9999,
    width: 260,
    // left, top 동적으로 지정
    // 그림자 등은 helpBubble에서 처리
  },
  // Menu Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuModal: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxWidth: 350,
    ...Shadows.large,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: Colors.secondary,
  },
  menuItemText: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500',
    marginLeft: 12,
    flex: 1,
  },
  menuItemSubtext: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginLeft: 8,
  },
  // Terms of Service Modal Styles
  termsModal: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    margin: 20,
    flex: 1,
    maxHeight: '90%',
    ...Shadows.large,
  },
  termsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  termsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  termsContent: {
    flex: 1,
    padding: 20,
  },
  termsText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  termsCloseButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 15,
    margin: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  termsCloseButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 20,
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

