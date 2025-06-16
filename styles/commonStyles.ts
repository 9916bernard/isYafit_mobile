import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, ViewStyle } from 'react-native';

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
  // 추가 색상들
  accent: '#00ff7f',
  cardBackground: '#1f2937',
  inputBackground: '#374151',
  disabled: '#6b7280',
  shadow: 'rgba(0, 0, 0, 0.3)',
};

// 공통 그림자 스타일
export const Shadows = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
};

// 공통 버튼 스타일
export const ButtonStyles = StyleSheet.create({
  primary: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.medium,
  },
  secondary: {
    backgroundColor: Colors.secondary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    ...Shadows.small,
  },
  danger: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.error,
    ...Shadows.small,
  },
  disabled: {
    backgroundColor: Colors.disabled,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.6,
  },
});

// 공통 카드 스타일
export const CardStyles = StyleSheet.create({
  default: {
    backgroundColor: Colors.secondary,
    borderRadius: 16,
    padding: 16,
    ...Shadows.medium,
  },
  elevated: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.large,
  },
});

// 공통 텍스트 스타일
export const TextStyles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  body: {
    fontSize: 16,
    color: Colors.text,
  },
  caption: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  small: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});
