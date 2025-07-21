import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Device } from 'react-native-ble-plx';
import { FTMSManager } from '../FtmsManager';
import { useSafeAreaStyles } from '../styles/commonStyles';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const [bikeData, setBikeData] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState(t('realtimeData.status.connecting'));
  const [showProtocolDropdown, setShowProtocolDropdown] = useState(false);
  const [selectedProtocol, setSelectedProtocol] = useState(ftmsManager.getDetectedProtocol());
  const [allProtocols, setAllProtocols] = useState(ftmsManager.getAllDetectedProtocols());
  const safeAreaStyles = useSafeAreaStyles();
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setAllProtocols(ftmsManager.getAllDetectedProtocols());
    setSelectedProtocol(ftmsManager.getDetectedProtocol());
    console.log('[RealtimeDataScreen] allProtocols:', ftmsManager.getAllDetectedProtocols(), 'selectedProtocol:', ftmsManager.getDetectedProtocol());
  }, [ftmsManager]);

  useEffect(() => {
    // Start the rotation animation
    const spin = () => {
      spinValue.setValue(0);
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      ).start();
    };
    
    spin();

    // Cleanup animation on unmount
    return () => {
      spinValue.stopAnimation();
    };
  }, [spinValue]);

  useEffect(() => {
    let isMounted = true;
    
    const connectToDevice = async () => {
      try {
        if (!isMounted) return;
        setStatusMessage(t('realtimeData.status.connecting'));
        console.log('[RealtimeDataScreen] Connecting to device:', device.id);
        
        await ftmsManager.connectToDevice(device.id);
        
        if (!isMounted) return;
        setStatusMessage(t('realtimeData.status.subscribing'));
        console.log('[RealtimeDataScreen] Subscribing to notifications...');
        
        await ftmsManager.subscribeToNotifications(
          (cpResponse) => {
            // Control point response handling
            if (cpResponse.length >= 3) {
              // console.log(`RealtimeData: CP Response - OpCode: ${cpResponse[1].toString(16)}, Result: ${cpResponse[2] === 1 ? 'SUCCESS' : 'FAILURE'}`); // log was here
            }
          },
          (newBikeData) => {
            if (isMounted) {
              setBikeData(newBikeData);
            }
          }
        );
        
        if (!isMounted) return;
        setStatusMessage(t('realtimeData.status.runningSequence'));
        console.log('[RealtimeDataScreen] Running connectSequence...');
        const success = await ftmsManager.connectSequence();
        if (success && isMounted) {
          setIsConnected(true);
          setStatusMessage(t('realtimeData.status.receiving'));
          console.log('[RealtimeDataScreen] Connection sequence success!');
        } else if (isMounted) {
          setStatusMessage(t('realtimeData.status.sequenceFailed'));
          console.log('[RealtimeDataScreen] Connection sequence failed.');
        }
      } catch (error) {
        if (isMounted) {
          console.error('[RealtimeDataScreen] Connection error:', error);
          setStatusMessage(`${t('common.error')}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    };

    connectToDevice();

    return () => {
      isMounted = false;
      // Cleanup - disconnect device and stop all subscriptions
      ftmsManager.disconnectDevice().catch(console.error);
      console.log('[RealtimeDataScreen] Cleanup: disconnectDevice called.');
    };
  }, [device.id, ftmsManager, t]); // device.id만 의존성으로 사용하여 불필요한 재연결 방지
  
  const handleBackPress = async () => {
    onBack();
  };

  // 프로토콜 드롭다운 토글
  const handleDeviceNamePress = () => {
    setShowProtocolDropdown((prev) => !prev);
    console.log('[RealtimeDataScreen] Device name pressed. Dropdown toggled:', !showProtocolDropdown);
  };

  // 프로토콜 선택 및 재연결
  const handleProtocolSelect = async (protocol: any) => {
    setShowProtocolDropdown(false);
    setStatusMessage(t('realtimeData.status.reconnecting'));
    setIsConnected(false);
    setBikeData(null);
    console.log('[RealtimeDataScreen] Protocol selected:', protocol);
    // --- 로딩 애니메이션 재시작 ---
    spinValue.setValue(0);
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      })
    ).start();
    // --------------------------
    try {
      console.log('[RealtimeDataScreen] Reconnecting with protocol:', protocol);
      await ftmsManager.reconnectWithProtocol(protocol);
      setSelectedProtocol(protocol);
      setStatusMessage(t('realtimeData.status.subscribing'));
      console.log('[RealtimeDataScreen] Subscribing to notifications after protocol change...');
      await ftmsManager.subscribeToNotifications(
        () => {},
        (newBikeData) => setBikeData(newBikeData)
      );
      setStatusMessage(t('realtimeData.status.runningSequence'));
      console.log('[RealtimeDataScreen] Running connectSequence after protocol change...');
      const success = await ftmsManager.connectSequence();
      if (success) {
        setIsConnected(true);
        setStatusMessage(t('realtimeData.status.receiving'));
        console.log('[RealtimeDataScreen] Protocol reconnect sequence success!');
      } else {
        setStatusMessage(t('realtimeData.status.sequenceFailed'));
        console.log('[RealtimeDataScreen] Protocol reconnect sequence failed.');
      }
    } catch (error) {
      setStatusMessage(`${t('common.error')}: ${error instanceof Error ? error.message : String(error)}`);
      console.error('[RealtimeDataScreen] Protocol reconnect error:', error);
    }
  };

  const renderDataItem = (label: string, value: any, unit: string, icon: string, isGridItem?: boolean) => (
    <View style={[styles.dataItem, isGridItem && styles.gridDataItem]}>
      <View style={[styles.dataIconContainer, isGridItem && styles.gridDataItemIconContainer]}>
        <Icon name={icon} size={isGridItem ? 30 : 24} color="#00c663" />
      </View>
      <View style={styles.dataContent}>
        <Text style={[styles.dataLabel, isGridItem && styles.gridDataItemLabel]}>{label}</Text>
        <View style={styles.dataValueContainer}>
          <Text style={[styles.dataValue, isGridItem && styles.gridDataItemValue]}>
            {value !== null && value !== undefined ? 
              (typeof value === 'number' ? value.toFixed(1) : value) : '--'}
          </Text>
          <Text style={[styles.dataUnit, isGridItem && styles.gridDataItemUnit]}>{unit}</Text>
        </View>
      </View>
    </View>
  );
  return (
    <View style={safeAreaStyles.safeContainerMinPadding}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <Icon name="arrow-left" size={24} color="#00c663" />
          </TouchableOpacity>
          <Text style={styles.title}>{t('realtimeData.title')}</Text>
          <View style={styles.connectionIndicator}>
            <View style={[styles.connectionDot, { backgroundColor: isConnected ? '#00c663' : '#ef4444' }]} />
          </View>
        </View>

        <View style={styles.deviceInfo}>
          <Icon name="bluetooth" size={28} color="#00c663" />
          <TouchableOpacity onPress={handleDeviceNamePress} style={styles.deviceNameButton}>
          <Text style={styles.deviceName}>{device.name || t('common.unknown')}</Text>
            <Icon name={showProtocolDropdown ? 'chevron-up' : 'chevron-down'} size={18} color="#00c663" />
          </TouchableOpacity>
          <Text style={styles.deviceId}>{device.id.substring(0, 8)}...</Text>
        </View>
        {showProtocolDropdown && (
          <View style={styles.protocolDropdown}>
            {allProtocols && allProtocols.length > 0 ? (
              allProtocols.map((protocol: any) => (
                <TouchableOpacity
                  key={protocol}
                  style={styles.protocolDropdownItem}
                  onPress={() => handleProtocolSelect(protocol)}
                >
                  <Text style={[
                    styles.protocolDropdownText,
                    protocol === selectedProtocol && styles.protocolDropdownTextSelected
                  ]}>
                    {protocol}
                  </Text>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.protocolDropdownText}>{t('realtimeData.noProtocols')}</Text>
            )}
          </View>
        )}
        <Text style={styles.statusMessage}>{statusMessage}</Text>

        {isConnected && bikeData ? (
          <View style={styles.dataDisplayArea}>
            <View style={styles.gridContainer}>
              {renderDataItem(t('realtimeData.data.speed'), bikeData.instantaneousSpeed, t('realtimeData.units.kmh'), "speedometer", true)}
              {renderDataItem(t('realtimeData.data.cadence'), bikeData.instantaneousCadence, t('realtimeData.units.rpm'), "rotate-3d-variant", true)}
              {renderDataItem(t('realtimeData.data.power'), bikeData.instantaneousPower, t('realtimeData.units.watts'), "lightning-bolt", true)}
              {renderDataItem(t('realtimeData.data.resistance'), bikeData.resistanceLevel, "", "weight-lifter", true)}
            </View>
            <ScrollView style={styles.listDataContainer} showsVerticalScrollIndicator={false}>
              {renderDataItem(t('realtimeData.data.heartRate'), bikeData.heartRate, t('realtimeData.units.bpm'), "heart-pulse")}
              {renderDataItem(t('realtimeData.data.totalDistance'), bikeData.totalDistance, t('realtimeData.units.meters'), "map-marker-distance")}
              {renderDataItem(t('realtimeData.data.elapsedTime'), bikeData.elapsedTime, t('realtimeData.units.seconds'), "timer")}
              {renderDataItem(t('realtimeData.data.calories'), bikeData.totalEnergy, t('realtimeData.units.kcal'), "fire")}
            </ScrollView>
          </View>        ) : (
          <View style={styles.loadingContainer}>
            <Animated.View
              style={{
                transform: [{
                  rotate: spinValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg']
                  })
                }]
              }}
            >
              <Icon name="loading" size={48} color="#00c663" />
            </Animated.View>
            <Text style={styles.loadingText}>{t('realtimeData.status.waiting')}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({  safeArea: {
    flex: 1,
    backgroundColor: '#1a2029',
  },
  container: {
    flex: 1,
    backgroundColor: '#1a2029',
    paddingHorizontal: 20,
    paddingTop: 50, 
    paddingBottom: 30, 
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',    marginBottom: 20, // Adjusted
  },
  backButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: '#242c3b',
  },
  title: {
    fontSize: 22, // Adjusted
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    flex: 1, // Allow title to take space and center correctly
  },
  connectionIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44, // Ensure it has a fixed width for proper spacing
    paddingLeft: 10, // Add some padding if title is too close
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
    marginBottom: 16, // Adjusted
    paddingVertical: 12, // Adjusted
    paddingHorizontal: 16,
    backgroundColor: '#1f2937',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  deviceName: {
    fontSize: 16, // Adjusted
    fontWeight: 'bold',
    color: '#ffffff',
    marginLeft: 10, // Adjusted
    marginRight: 6, // Adjusted
  },
  deviceId: {
    fontSize: 12, // Adjusted
    color: '#9ca3af',
  },
  statusMessage: {
    fontSize: 13, // Adjusted
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 16, // Adjusted
  },
  dataDisplayArea: { // New style
    flex: 1,
  },
  gridContainer: { // New style
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8, // Adjusted space between grid and list
  },
  listDataContainer: { // Renamed from dataContainer
    flex: 1, // Allows list to scroll if content overflows
  },
  dataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#242c3b',
    borderRadius: 12,
    padding: 12, // Adjusted base padding
    marginBottom: 10, // Adjusted base margin
  },
  gridDataItem: { // New style for grid items
    width: '48.5%', // Adjusted for 2 columns with space-between
    padding: 12, // Slightly more padding for grid items
    // Larger items might need more vertical padding or minHeight
    minHeight: 110, // Ensure grid items have a decent height
    justifyContent: 'center', // Center content vertically
  },
  dataIconContainer: {
    width: 40, // Adjusted base size
    height: 40, // Adjusted base size
    backgroundColor: '#1a2029',
    borderRadius: 20, // Adjusted
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12, // Adjusted
  },
  gridDataItemIconContainer: { // Style for icon container in grid items
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  dataContent: {
    flex: 1,
    justifyContent: 'center', // Center content vertically
  },
  dataLabel: {
    fontSize: 13, // Adjusted base size
    color: '#9ca3af',
    marginBottom: 2, // Adjusted
  },
  gridDataItemLabel: { // Style for label in grid items
    fontSize: 14,
  },
  dataValueContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    flex: 1,
  },
  dataValue: {
    fontSize: 20, // Adjusted base size
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 2,
    flexShrink: 1,
  },
  gridDataItemValue: { // Style for value in grid items
    fontSize: 24, // Slightly reduced to prevent overflow
    marginBottom: 2,
  },
  dataUnit: {
    fontSize: 12, // Reduced base size
    color: '#00c663',
    fontWeight: '600',
    textAlign: 'center',
  },
  gridDataItemUnit: { // Style for unit in grid items
    fontSize: 13, // Reduced for grid items
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
  deviceNameButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
    marginRight: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: '#232b38',
  },
  protocolDropdown: {
    position: 'absolute',
    top: 110,
    left: 40,
    right: 40,
    backgroundColor: '#232b38',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    zIndex: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  protocolDropdownItem: {
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  protocolDropdownText: {
    color: '#fff',
    fontSize: 15,
  },
  protocolDropdownTextSelected: {
    color: '#00c663',
    fontWeight: 'bold',
  },
});

export default RealtimeDataScreen;
