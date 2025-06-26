import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet 
} from 'react-native';
import LottieView from 'lottie-react-native';
import { Device } from 'react-native-ble-plx';
import { useSafeAreaStyles, Colors } from '../styles/commonStyles';
import { useTranslation } from 'react-i18next';

interface LoadingScreenProps {
  device: Device;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ device }) => {
  const safeAreaStyles = useSafeAreaStyles();
  const { t } = useTranslation();

  return (
    <View style={safeAreaStyles.safeContainerMinPadding}>
      <View style={styles.container}>
        <View style={styles.animationContainer}>
          <LottieView
            source={require('../assets/animation/bluetooth_loading_animation.json')}
            autoPlay
            loop
            style={styles.animation}
          />
        </View>
        
        <Text style={styles.connectingText}>
          {device.name || t('common.unknown')} {t('loading.connecting')}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  animationContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  animation: {
    width: '100%',
    height: '100%',
  },
  connectingText: {
    fontSize: 18,
    fontWeight: '500',
    color: Colors.text,
    textAlign: 'center',
  },
});

export default LoadingScreen;
