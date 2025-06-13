import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ActivityIndicator 
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Device } from 'react-native-ble-plx';
import { useSafeAreaStyles, Colors } from '../styles/commonStyles';

interface LoadingScreenProps {
  device: Device;
  statusMessage: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ device, statusMessage }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const safeAreaStyles = useSafeAreaStyles();

  useEffect(() => {
    // Determine current step based on status message
    if (statusMessage.includes('연결 중')) {
      setCurrentStep(0);
    } else if (statusMessage.includes('연결됨') || statusMessage.includes('테스트를 시작')) {
      setCurrentStep(1);
    } else if (statusMessage.includes('분석') || statusMessage.includes('진행')) {
      setCurrentStep(2);
    }
  }, [statusMessage]);

  const steps = [
    {
      icon: "bluetooth-connect",
      text: "장치 연결 중...",
      description: "BLE 장치와 연결을 설정하고 있습니다"
    },
    {
      icon: "test-tube",
      text: "테스트 준비 중...",
      description: "FTMS 프로토콜 지원 여부를 확인하고 있습니다"
    },
    {
      icon: "chart-line",
      text: "호환성 분석 시작...",
      description: "장치의 호환성을 분석하고 있습니다"
    }
  ];

  return (
    <View style={safeAreaStyles.safeContainerMinPadding}>
      <View style={styles.container}>
        <View style={styles.deviceInfo}>
          <Icon name="bluetooth" size={32} color="#00c663" />
          <Text style={styles.deviceName}>{device.name || 'Unknown Device'}</Text>
          <Text style={styles.deviceId}>{device.id.substring(0, 8)}...</Text>
        </View>

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00c663" />
          <Text style={styles.loadingText}>{statusMessage}</Text>
          
          <View style={styles.progressSteps}>
            {steps.map((step, index) => (
              <React.Fragment key={index}>
                <View style={[
                  styles.stepContainer,
                  index <= currentStep ? styles.stepContainerActive : styles.stepContainerInactive
                ]}>
                  <Icon 
                    name={step.icon} 
                    size={24} 
                    color={index <= currentStep ? "#00c663" : "#9ca3af"} 
                  />
                  <View style={styles.stepTextContainer}>
                    <Text style={[
                      styles.stepText,
                      index <= currentStep ? styles.stepTextActive : styles.stepTextInactive
                    ]}>
                      {step.text}
                    </Text>
                    <Text style={styles.stepDescription}>
                      {step.description}
                    </Text>
                  </View>
                  {index === currentStep && (
                    <ActivityIndicator size="small" color="#00c663" style={styles.stepLoader} />
                  )}
                </View>
                {index < steps.length - 1 && (
                  <View style={[
                    styles.stepDivider,
                    index < currentStep ? styles.stepDividerCompleted : styles.stepDividerPending
                  ]} />
                )}
              </React.Fragment>
            ))}
          </View>
        </View>
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
  deviceInfo: {
    alignItems: 'center',
    marginBottom: 50,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: Colors.secondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 200,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 8,
    textAlign: 'center',
  },
  deviceId: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: Colors.text,
    marginTop: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
  progressSteps: {
    marginTop: 40,
    alignItems: 'center',
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.secondary,
    borderRadius: 12,
    marginVertical: 8,
    minWidth: 280,
  },
  stepContainerActive: {
    backgroundColor: Colors.secondary,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  stepContainerInactive: {
    backgroundColor: Colors.secondary,
    opacity: 0.6,
  },
  stepTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  stepText: {
    fontSize: 14,
    fontWeight: '500',
  },
  stepTextActive: {
    color: Colors.primary,
  },
  stepTextInactive: {
    color: Colors.textSecondary,
  },
  stepDescription: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  stepLoader: {
    marginLeft: 8,
  },
  stepDivider: {
    width: 2,
    height: 20,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  stepDividerCompleted: {
    backgroundColor: Colors.primary,
  },
  stepDividerPending: {
    backgroundColor: Colors.border,
  },
});

export default LoadingScreen;
