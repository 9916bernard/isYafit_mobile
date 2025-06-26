import { useTranslation } from 'react-i18next';

// 호환성 레벨을 현재 언어에 맞게 변환하는 함수
export const translateCompatibilityLevel = (level: string, t: any): string => {
  // 저장된 레벨을 현재 언어의 키로 매핑
  const levelMapping: { [key: string]: string } = {
    // 한국어 -> 현재 언어
    '완전 호환': t('test.compatibilityLevels.fullyCompatible'),
    '부분 호환': t('test.compatibilityLevels.partiallyCompatible'),
    '수정 필요': t('test.compatibilityLevels.needsModification'),
    '불가능': t('test.compatibilityLevels.impossible'),
    // 영어 -> 현재 언어
    'Fully Compatible': t('test.compatibilityLevels.fullyCompatible'),
    'Partially Compatible': t('test.compatibilityLevels.partiallyCompatible'),
    'Needs Modification': t('test.compatibilityLevels.needsModification'),
    'Impossible': t('test.compatibilityLevels.impossible'),
    // 중국어 -> 현재 언어
    '完全兼容': t('test.compatibilityLevels.fullyCompatible'),
    '部分兼容': t('test.compatibilityLevels.partiallyCompatible'),
    '需要修改': t('test.compatibilityLevels.needsModification'),
    '不可能': t('test.compatibilityLevels.impossible'),
  };
  
  return levelMapping[level] || level;
};

// 호환성 레벨이 특정 레벨인지 확인하는 헬퍼 함수
export const isCompatibilityLevel = (
  level: string, 
  targetLevel: 'fullyCompatible' | 'partiallyCompatible' | 'needsModification' | 'impossible',
  t: any
): boolean => {
  const targetKey = t(`test.compatibilityLevels.${targetLevel}`);
  const translatedLevel = translateCompatibilityLevel(level, t);
  return translatedLevel === targetKey;
};

// 호환성 레벨에 따른 색상을 반환하는 함수 (TestScreen, TestReportScreen용)
export const getCompatibilityColor = (compatibilityLevel?: string, t?: any): string => {
  // t가 제공되지 않은 경우 (TestScreen의 첫 번째 getCompatibilityColor)
  if (!t) {
    const translateCompatibilityLevel = (level: string): string => {
      const levelMapping: { [key: string]: string } = {
        '완전 호환': 'fullyCompatible',
        '부분 호환': 'partiallyCompatible',
        '수정 필요': 'needsModification',
        '불가능': 'impossible',
        'Fully Compatible': 'fullyCompatible',
        'Partially Compatible': 'partiallyCompatible',
        'Needs Modification': 'needsModification',
        'Impossible': 'impossible',
        '完全兼容': 'fullyCompatible',
        '部分兼容': 'partiallyCompatible',
        '需要修改': 'needsModification',
        '不可能': 'impossible',
      };
      
      return levelMapping[level] || level;
    };

    const translatedLevel = translateCompatibilityLevel(compatibilityLevel || '');
    
    switch (translatedLevel) {
      case 'fullyCompatible':
        return '#4CAF50';
      case 'partiallyCompatible':
        return '#FF9800';
      case 'needsModification':
        return '#2196F3';
      case 'impossible':
        return '#F44336';
      default:
        return '#666666';
    }
  }

  // t가 제공된 경우 (TestReportScreen용)
  const translatedLevel = translateCompatibilityLevel(compatibilityLevel || '', t);
  
  switch (translatedLevel) {
    case t('test.compatibilityLevels.fullyCompatible'):
      return '#4CAF50';
    case t('test.compatibilityLevels.partiallyCompatible'):
      return '#FF9800';
    case t('test.compatibilityLevels.needsModification'):
      return '#2196F3';
    case t('test.compatibilityLevels.impossible'):
      return '#F44336';
    default:
      return '#666';
  }
};

// 호환성 레벨에 따른 색상을 반환하는 함수 (PastReportsScreen용)
export const getCompatibilityColorForPastReports = (level: string, t: any): string => {
  const translatedLevel = translateCompatibilityLevel(level, t);
  
  switch (translatedLevel) {
    case t('test.compatibilityLevels.fullyCompatible'):
      return '#00c663';
    case t('test.compatibilityLevels.partiallyCompatible'):
      return '#f59e0b';
    case t('test.compatibilityLevels.needsModification'):
      return '#ef4444';
    case t('test.compatibilityLevels.impossible'):
      return '#6b7280';
    default:
      return '#9ca3af';
  }
};

// React Hook으로 사용할 수 있는 버전
export const useCompatibilityUtils = () => {
  const { t } = useTranslation();
  
  return {
    translateCompatibilityLevel: (level: string) => translateCompatibilityLevel(level, t),
    isCompatibilityLevel: (level: string, targetLevel: 'fullyCompatible' | 'partiallyCompatible' | 'needsModification' | 'impossible') => 
      isCompatibilityLevel(level, targetLevel, t),
    getCompatibilityColor: (compatibilityLevel?: string) => getCompatibilityColor(compatibilityLevel, t),
    getCompatibilityColorForPastReports: (level: string) => getCompatibilityColorForPastReports(level, t),
  };
}; 