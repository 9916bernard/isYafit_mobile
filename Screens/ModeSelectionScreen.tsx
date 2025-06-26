import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Device } from 'react-native-ble-plx';
import { useSafeAreaStyles, Colors } from '../styles/commonStyles';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const safeAreaStyles = useSafeAreaStyles();

  return (
    <View style={safeAreaStyles.safeContainerMinPadding}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('modeSelection.title')}</Text>
        </View>

        <View style={styles.deviceInfo}>
          <Icon name="bluetooth" size={28} color="#00c663" />
          <Text style={styles.deviceName}>{device.name || t('common.unknown')}</Text>
          <Text style={styles.deviceId}>{device.id.substring(0, 8)}...</Text>
        </View>

        <Text style={styles.subtitle}>{t('modeSelection.subtitle')}</Text>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.modeButton}
            onPress={onSelectRealtimeData}
          >
            <View style={styles.buttonIconContainer}>
              <Icon name="gauge" size={36} color="#00c663" />
            </View>
            <Text style={styles.modeButtonTitle}>{t('modeSelection.realtimeData.title')}</Text>
            <Text style={styles.modeButtonDescription}>
              {t('modeSelection.realtimeData.description')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modeButton}
            onPress={onSelectCompatibilityTest}
          >
            <View style={styles.buttonIconContainer}>
              <Icon name="test-tube" size={36} color="#00c663" />
            </View>
            <Text style={styles.modeButtonTitle}>{t('modeSelection.compatibilityTest.title')}</Text>
            <Text style={styles.modeButtonDescription}>
              {t('modeSelection.compatibilityTest.description')}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.backButton} onPress={onDisconnect}>
          <Icon name="arrow-left" size={20} color="#fff" />
          <Text style={styles.backButtonText}>{t('common.back')}</Text>
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
  },  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#00c663',
    marginTop: 24,
    marginBottom: 10,
    gap: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
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
    paddingHorizontal: 6,
    backgroundColor: Colors.background,
    borderRadius: 40,
    marginHorizontal: 20,
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
