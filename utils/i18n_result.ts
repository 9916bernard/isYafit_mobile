// i18n_result.ts - Translation keys for test results and reports
import i18n from 'i18next';

// 한국어 번역
const ko = {
  testResult: {
    // 호환성 레벨
    compatibilityLevels: {
      fullyCompatible: '완전 호환',
      partiallyCompatible: '부분 호환',
      needsModification: '수정 필요',
      impossible: '불가능',
    },
    
    // 호환성 판정 이유
    reasons: {
      stopped: '중지',
      rpm: 'RPM',
      protocol: '프로토콜',
      gear: '기어',
      erg: 'ERG',
      sim: 'SIM',
      controlCommand: '제어명령',
      basicFunction: '기본기능',
      autoChange: '자동변화',
    },
    
    // 결과 메시지
    messages: {
      testStopped: '테스트가 도중에 중단되었습니다. 다시 시도해주세요.',
      cadenceNotDetected: '필수 요소인 cadence가 검출되지 않았습니다. Yafit과 호환되지 않습니다.',
      unsupportedProtocol: 'Yafit에서 지원하지 않는 프로토콜입니다. Yafit과 호환되지 않습니다.',
      partialCompatible: 'Yafit 연결과 플레이가 가능합니다.',
      fullyCompatible: 'Yafit에 연결과 모든 모드 플레이가 가능합니다.',
      modificationNeeded: 'Yafit에 연결과 플레이가 가능합니다.',
      but: '하지만',
      gearDefault: 'gear 값이 default로 계산됩니다',
      userGearChange: '유저가 기어 변경을 할 수 없습니다',
      ergModeUnavailable: 'ERG 모드는 플레이 하실 수 없습니다',
      simModeUnavailable: 'SIM 모드는 플레이 하실 수 없습니다',
      controlCommandUnsupported: '제어 명령이 지원되지 않습니다',
      unexpectedResistanceChange: '의도하지 않은 저항 변경이 발생했습니다. 기기 자체 모드가 설정되어있는지 확인해주세요',
    },
    
    // 프로토콜 제한사항
    protocolLimitations: {
      reborn: 'Reborn 프로토콜은 제어 명령이 불가능합니다. SIM, ERG, 유저의 기어 변경이 불가능합니다.',
      fitshow: 'FitShow 프로토콜은 Yafit에서 제어명령을 지원하지 않습니다. ERG, SIM, 유저의 기어 제어가 불가능합니다.',
    },
    
    // 범위 정보 포맷
    rangeInfo: {
      speed: '속도',
      incline: '경사도',
      resistance: '저항',
      power: '파워',
      noInfo: '정보 없음',
      increment: '증분',
    },
    
    // 자동 변경
    autoChange: '자동 변경',
  },
};

// 영어 번역
const en = {
  testResult: {
    compatibilityLevels: {
      fullyCompatible: 'Fully Compatible',
      partiallyCompatible: 'Partially Compatible',
      needsModification: 'Needs Modification',
      impossible: 'Impossible',
    },
    
    reasons: {
      stopped: 'Stopped',
      rpm: 'RPM',
      protocol: 'Protocol',
      gear: 'Gear',
      erg: 'ERG',
      sim: 'SIM',
      controlCommand: 'Control Command',
      basicFunction: 'Basic Function',
      autoChange: 'Auto Change',
    },
    
    messages: {
      testStopped: 'The test was interrupted. Please try again.',
      cadenceNotDetected: 'Required element cadence was not detected. Not compatible with Yafit.',
      unsupportedProtocol: 'Protocol not supported by Yafit. Not compatible with Yafit.',
      partialCompatible: 'Yafit connection and play is possible.',
      fullyCompatible: 'Yafit connection and all mode play is possible.',
      modificationNeeded: 'Yafit connection and play is possible.',
      but: 'but',
      gearDefault: 'gear value is calculated as default',
      userGearChange: 'User cannot change gears',
      ergModeUnavailable: 'ERG mode cannot be played',
      simModeUnavailable: 'SIM mode cannot be played',
      controlCommandUnsupported: 'Control commands are not supported',
      unexpectedResistanceChange: 'Unexpected resistance change occurred. Please check if the device\'s own mode is set.',
    },
    
    protocolLimitations: {
      reborn: 'Reborn protocol does not support control commands. SIM, ERG, and user gear changes are not possible.',
      fitshow: 'FitShow protocol does not support control commands in Yafit. ERG, SIM, and user gear control are not possible.',
    },
    
    rangeInfo: {
      speed: 'Speed',
      incline: 'Incline',
      resistance: 'Resistance',
      power: 'Power',
      noInfo: 'No Information',
      increment: 'Increment',
    },
    
    autoChange: 'Auto Change',
  },
};

// 중국어 번역
const zh = {
  testResult: {
    compatibilityLevels: {
      fullyCompatible: '完全兼容',
      partiallyCompatible: '部分兼容',
      needsModification: '需要修改',
      impossible: '不可能',
    },
    
    reasons: {
      stopped: '停止',
      rpm: 'RPM',
      protocol: '协议',
      gear: '齿轮',
      erg: 'ERG',
      sim: 'SIM',
      controlCommand: '控制命令',
      basicFunction: '基本功能',
      autoChange: '自动变化',
    },
    
    messages: {
      testStopped: '测试被中断。请重试。',
      cadenceNotDetected: '未检测到必需元素cadence。与Yafit不兼容。',
      unsupportedProtocol: 'Yafit不支持的协议。与Yafit不兼容。',
      partialCompatible: '可以连接Yafit并进行游戏。',
      fullyCompatible: '可以连接Yafit并进行所有模式游戏。',
      modificationNeeded: '可以连接Yafit并进行游戏。',
      but: '但是',
      gearDefault: 'gear值按默认值计算',
      userGearChange: '用户无法更改齿轮',
      ergModeUnavailable: '无法使用ERG模式',
      simModeUnavailable: '无法使用SIM模式',
      controlCommandUnsupported: '不支持控制命令',
      unexpectedResistanceChange: '发生意外阻力变化。请检查设备自身模式是否已设置。',
    },
    
    protocolLimitations: {
      reborn: 'Reborn协议不支持控制命令。SIM、ERG和用户齿轮更改不可用。',
      fitshow: 'FitShow协议在Yafit中不支持控制命令。ERG、SIM和用户齿轮控制不可用。',
    },
    
    rangeInfo: {
      speed: '速度',
      incline: '坡度',
      resistance: '阻力',
      power: '功率',
      noInfo: '无信息',
      increment: '增量',
    },
    
    autoChange: '自动更改',
  },
};

// 번역 함수들
export const t = (key: string): string => {
  const currentLanguage = i18n.language || 'ko';
  const translations = currentLanguage === 'en' ? en : currentLanguage === 'zh' ? zh : ko;
  
  const keys = key.split('.');
  let value: any = translations;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
  }
  
  return typeof value === 'string' ? value : key;
};

// 범위 정보 포맷팅 함수
export const formatRangeInfo = (info: any, type: string): string => {
  if (!info) return `${t(`testResult.rangeInfo.${type}`)}: ${t('testResult.rangeInfo.noInfo')}`;
  
  const typeKey = type.toLowerCase();
  const typeLabel = t(`testResult.rangeInfo.${typeKey}`);
  const incrementLabel = t('testResult.rangeInfo.increment');
  
  switch(type) {
    case 'speed':
      return `${typeLabel}: ${(info.min / 100).toFixed(1)} - ${(info.max / 100).toFixed(1)} km/h (${incrementLabel}: ${(info.increment / 100).toFixed(2)})`;
    case 'incline':
      return `${typeLabel}: ${(info.min / 10).toFixed(1)} - ${(info.max / 10).toFixed(1)} % (${incrementLabel}: ${(info.increment / 10).toFixed(1)})`;
    case 'resistance':
      return `${typeLabel}: ${info.min} - ${info.max} (${incrementLabel}: ${info.increment})`;
    case 'power':
      return `${typeLabel}: ${info.min} - ${info.max} W (${incrementLabel}: ${info.increment})`;
    default:
      return `${typeLabel}: ${info.min} - ${info.max} (${incrementLabel}: ${info.increment})`;
  }
};

export default {
  t,
  formatRangeInfo,
}; 