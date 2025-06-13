import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

export const useSafeAreaStyles = () => {
  const insets = useSafeAreaInsets();
  
  return StyleSheet.create({
    safeContainer: {
      flex: 1,
      paddingTop: insets.top,
      paddingBottom: insets.bottom,
      paddingLeft: insets.left,
      paddingRight: insets.right,
    },
    safeContainerWithBackground: {
      flex: 1,
      paddingTop: insets.top,
      paddingBottom: insets.bottom,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      backgroundColor: '#1a2029',
    },
    safeAreaTop: {
      paddingTop: insets.top,
    },
    safeAreaBottom: {
      paddingBottom: insets.bottom,
    },
    safeAreaHorizontal: {
      paddingLeft: insets.left,
      paddingRight: insets.right,
    },
    // 최소 패딩을 보장하는 스타일들
    safeContainerMinPadding: {
      flex: 1,
      paddingTop: Math.max(insets.top, 20),
      paddingBottom: Math.max(insets.bottom, 20),
      paddingLeft: Math.max(insets.left, 16),
      paddingRight: Math.max(insets.right, 16),
      backgroundColor: '#1a2029',
    },
    contentContainer: {
      flex: 1,
      paddingHorizontal: 24,
      paddingVertical: 20,
    }
  });
};

// 공통 색상 상수
export const Colors = {
  background: '#1a2029',
  primary: '#00c663',
  secondary: '#242c3b',
  text: '#ffffff',
  textSecondary: '#9ca3af',
  border: '#374151',
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  info: '#2196F3',
};
