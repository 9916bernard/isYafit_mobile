import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Device } from 'react-native-ble-plx';
import { FTMSManager } from '../FtmsManager';
import { useSafeAreaStyles, Colors } from '../styles/commonStyles';

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
  const safeAreaStyles = useSafeAreaStyles();

  useEffect(() => {
    const connectToDevice = async () => {
      try {
        setStatusMessage('기기에 연결 중...');
        // await ftmsManager.disconnectDevice(); // Consider if this is needed here or if connectToDevice handles it
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
  
  const handleBackPress = async () => {
    onBack();
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
          <View style={styles.dataDisplayArea}>
            <View style={styles.gridContainer}>
              {renderDataItem("속도", bikeData.instantaneousSpeed, "km/h", "speedometer", true)}
              {renderDataItem("케이던스", bikeData.instantaneousCadence, "rpm", "rotate-3d-variant", true)}
              {renderDataItem("파워", bikeData.instantaneousPower, "W", "lightning-bolt", true)}
              {renderDataItem("저항 레벨", bikeData.resistanceLevel, "", "weight-lifter", true)}
            </View>
            <ScrollView style={styles.listDataContainer} showsVerticalScrollIndicator={false}>
              {renderDataItem("심박수", bikeData.heartRate, "bpm", "heart-pulse")}
              {renderDataItem("총 거리", bikeData.totalDistance, "m", "map-marker-distance")}
              {renderDataItem("경과 시간", bikeData.elapsedTime, "s", "timer")}
              {renderDataItem("칼로리", bikeData.totalEnergy, "kcal", "fire")}
            </ScrollView>
          </View>        ) : (
          <View style={styles.loadingContainer}>
            <Icon name="loading" size={48} color="#00c663" />
            <Text style={styles.loadingText}>데이터 수신 대기 중...</Text>
          </View>
        )}
      </View>
   )</View>
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
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  dataValue: {
    fontSize: 20, // Adjusted base size
    fontWeight: 'bold',
    color: '#ffffff',
    marginRight: 6, // Adjusted
  },
  gridDataItemValue: { // Style for value in grid items
    fontSize: 26, // Larger font for grid items
  },
  dataUnit: {
    fontSize: 13, // Adjusted base size
    color: '#00c663',
    fontWeight: '600',
  },
  gridDataItemUnit: { // Style for unit in grid items
    fontSize: 14, // Slightly larger for grid items
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
});

export default RealtimeDataScreen;
