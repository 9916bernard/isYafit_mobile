import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Intl.PluralRules 폴리필 추가 (React Native 환경 대응)
if (typeof global.Intl === 'undefined') {
  (global as any).Intl = {};
}

if (typeof (global as any).Intl.PluralRules === 'undefined') {
  (global as any).Intl.PluralRules = class PluralRules {
    constructor() {}
    select(value: number): string {
      // 기본적인 복수형 규칙 (한국어, 영어, 중국어 대응)
      if (value === 1) return 'one';
      return 'other';
    }
  };
}

// 언어 리소스 정의
const resources = {
  ko: {
    translation: {
      // 공통
      common: {
        close: '닫기',
        back: '돌아가기',
        cancel: '취소',
        confirm: '확인',
        loading: '로딩 중...',
        error: '오류',
        success: '성공',
        unknown: '알 수 없음',
      },
      
      // 앱 메인
      app: {
        title: 'PFInspector',
        version: 'v0.8.3',
        status: {
          init: '앱 테스트 중입니다.',
          ready: 'BLE Manager 초기화 완료. 스캔을 시작할 수 있습니다.',
          scanning: '주변 장치 검색 중...',
          scanComplete: '스캔 완료. 장치를 선택하세요.',
          bluetoothOff: '블루투스가 꺼져있습니다. 블루투스를 켜고 다시 시도하세요.',
          permissionDenied: '필수 권한이 거부되었습니다.',
          connectionFailed: '기기와 연결에 실패했습니다. 블루투스 상태를 확인해주세요.',
          disconnected: '기기와의 연결이 해제되었습니다.',
          patchNotesPreparing: '패치 내역 기능은 준비 중입니다.',
          bleManagerInitFailed: 'BLE Manager 초기화 실패. BLE가 지원되지 않을 수 있습니다.',
          bluetoothStateCheckError: '블루투스 상태 확인 중 오류가 발생했습니다.',
          scanError: '스캔 중 오류 발생: {{error}}',
          unknownError: '알 수 없는 오류',
          deviceSelected: '{{deviceName}} 선택됨. 모드를 선택하세요.',
          connectingToDevice: '\'{{deviceName}}\'에 연결 중...',
          connectedRealtimeData: '\'{{deviceName}}\'에 연결됨. 실시간 데이터를 시작합니다.',
          connectedCompatibilityTest: '\'{{deviceName}}\'에 연결됨. 호환성 테스트를 시작합니다.',
          connectionError: '연결 오류: {{error}}',
          disconnecting: '연결 해제 중...',
          disconnectedSuccess: '연결 해제됨.',
          disconnectError: '연결 해제 중 오류 발생.',
          bluetoothOn: '블루투스가 켜져 있습니다. 스캔을 시작할 수 있습니다.',
          bluetoothOffSettings: '블루투스가 꺼져 있습니다. 블루투스 설정으로 이동합니다.',
        },
        alerts: {
          connectionFailed: '연결 실패',
          connectionFailedMessage: '기기와 연결에 실패했습니다. 블루투스 상태를 확인해주세요.',
          confirm: '확인',
        },
        buttons: {
          scan: '주변 장치 스캔',
          scanning: '스캔 중...',
          connect: '연결',
          connectDevice: '\'{{deviceName}}\' 연결',
          disconnect: '연결 해제',
        },
        sections: {
          devices: '발견된 장치',
          noDevicesFound: '발견된 장치가 없습니다.',
          noDevicesHelp: 'FTMS 장치가 켜져 있는지 확인해보세요.',
          connectedDevice: '연결된 장치:',
        },
        menu: '메뉴',
        languageSettings: '언어 설정',
        pastReports: '과거 보고서',
        patchNotes: '패치 내역',
        termsOfService: '이용 약관',
        close: '닫기',
      },
      
      // 메뉴
      menu: {
        title: '메뉴',
        languageSettings: '언어 설정',
        pastReports: '과거 보고서',
        patchNotes: '패치 내역',
        termsOfService: '이용 약관',
        preparing: '준비 중',
      },
      
      // 모드 선택
      modeSelection: {
        title: '모드 선택',
        subtitle: '원하시는 기능을 선택해주세요',
        realtimeData: {
          title: '실시간 데이터 모니터링',
          description: '속도, 케이던스, 파워, 저항 등의\n실시간 데이터를 확인합니다',
        },
        compatibilityTest: {
          title: 'Yafit 호환성 테스트',
          description: 'FTMS 프로토콜 지원 여부와\nYafit 앱과의 호환성을 테스트합니다',
        },
      },
      
      // 실시간 데이터
      realtimeData: {
        title: '실시간 데이터',
        status: {
          connecting: '연결 중...',
          subscribing: '알림 구독 중...',
          runningSequence: '연결 시퀀스 실행 중...',
          receiving: '데이터 수신 중...',
          sequenceFailed: '연결 시퀀스 실패. 다시 시도해주세요.',
          waiting: '데이터 수신 대기 중...',
        },
        data: {
          speed: '속도',
          cadence: '케이던스',
          power: '파워',
          resistance: '저항 레벨',
          heartRate: '심박수',
          totalDistance: '총 거리',
          elapsedTime: '경과 시간',
          calories: '칼로리',
        },
        units: {
          kmh: 'km/h',
          rpm: 'rpm',
          watts: 'W',
          bpm: 'bpm',
          meters: 'm',
          seconds: 's',
          kcal: 'kcal',
        },
      },
      
      // 도움말
      help: {
        title: '기기가 검색되지 않습니까?',
        description: '기기가 스캔되지 않는다면 기기의 UUID가 아래의 프로토콜 혹은 센서에 포함되는지 확인해주세요. 일부 기기는 페달을 돌려야 검색되는 경우가 있습니다.',
        note: '만약 포함되지 않는다면 이는 Yafit 에 호환되지 않는 기기입니다. 관계자에게 문의해주세요.',
        protocols: '프로토콜:',
        protocolsList: 'FTMS, CSC',
        customProtocols: '브랜드 커스텀 프로토콜:',
        customProtocolsList: 'Mobi, Reborn, FitShow, Tacx, YAFIT',
      },
      
      // 테스트 화면
      test: {
        title: 'Yafit 호환성 테스트',
        ready: '테스트 준비 완료',
        starting: '테스트 시작 중...',
        stopped: '테스트가 중지되었습니다.',
        stoppedDisconnected: '테스트가 중지되고 기기와 연결이 해제되었습니다.',
        stoppedError: '테스트가 중지되었습니다. (연결 해제 중 오류 발생)',
        completion: '완료',
        resultTitle: '테스트 결과',
        limitationTitle: '제한사항:',
        limitations: {
          reborn: '• Reborn 프로토콜은 제어 명령이 불가능합니다. SIM,ERG,유저의 기어 변경이 불가능합니다.',
          fitshow: '• FitShow 프로토콜은 Yafit에서 제어명령을 지원하지 않습니다. ERG, SIM, 유저의 기어 제어가 불가능합니다.',
          resistance: '• Resistance가 검출되지 않아 기본 기어값으로 설정',
          gearChange: '• 기어 변경 불가능',
          ergMode: '• ERG 모드 사용 불가능',
          simMode: '• SIM 모드 사용 불가능',
          unexpectedResistance: '• 의도하지 않은 저항 변경이 발생했습니다. 기기 자체 모드가 설정되어있는지 확인해주세요',
        },
        detailInfo: '테스트 상세 정보',
        supportRange: '지원 범위',
        controlTestResult: '제어 테스트 결과',
        detectedDataFields: '감지된 데이터 필드',
        viewFullReport: '전체 보고서 보기',
        mobiInstruction: {
          title: 'Mobi 프로토콜 안내',
          description: 'Mobi 기기는 페달을 돌려야 데이터가 전송됩니다.\n테스트 진행 중 지속적으로 페달을 돌려주세요.',
          note: '이 프로토콜은 읽기 전용으로 케이던스 데이터만 확인됩니다.',
        },
        startTest: '테스트 시작',
        stopTest: '테스트 중단',
        back: '돌아가기',
        cancel: '취소',
        confirm: '시작',
        no: '아니요',
        yes: '예',
        countdown: '초 후 명령 실행',
        helpTitle: '테스트 도움말',
        helpText: '테스트 진행 중 수동으로 저항을 변경하면, 테스트 결과에 오류가 발생할 수 있습니다. \n테스트 결과가 예상과 다르다면, 페달을 돌리며 혹은 멈추고 다시 테스트를 진행해 보세요.',
        realtimeLog: {
          show: '실시간 로그 보기',
          hide: '로그 숨기기',
        },
        userInteraction: {
          commandStart: '제어 명령 실행',
          resistanceCheck: '저항 변화 확인',
          resistanceCheckText: '명령 실행 후 실제로 저항이 변했는지 확인해주세요.',
        },
        compatibilityLevels: {
          fullyCompatible: '완전 호환',
          partiallyCompatible: '부분 호환',
          needsModification: '수정 필요',
          impossible: '불가능',
        },
        controlCommands: {
          resistanceLevel: '저항 레벨',
          targetPower: '목표 파워',
          simParams: '경사도 시뮬레이션',
        },
        status: {
          success: '성공',
          failed: '실패',
          notSupported: '미지원',
        },
      },
      
      // 로딩 화면
      loading: {
        connecting: '연결 중...',
      },
      
      // 과거 보고서 화면
      pastReports: {
        title: '과거 보고서',
        noSavedReports: '저장된 보고서가 없습니다',
        loadingReports: '보고서를 불러오는 중...',
        confirmDelete: '정말로 이 보고서를 삭제하시겠습니까?',
        confirmDeleteMultiple: '선택된 {{count}}개의 보고서를 삭제하시겠습니까?',
        deleteSuccess: '보고서가 삭제되었습니다.',
        deleteMultipleSuccess: '{{count}}개의 보고서가 삭제되었습니다.',
        deleteError: '보고서 삭제에 실패했습니다.',
        emptyStateDescription: '호환성 테스트를 완료하면 여기에 보고서가 저장됩니다',
        languageNote: '*호환성 판정 결과는 당시 설정 언어로 표시될 수 있습니다',
        selectMode: '선택 모드',
        cancelSelection: '선택 취소',
        selectAll: '전체 선택',
        deselectAll: '전체 해제',
        selectedCount: '{{count}}개 선택됨',
        deleteSelected: '선택된 항목 삭제',
        noItemsSelected: '선택된 항목이 없습니다',
      },
      
      // 로그 화면
      logs: {
        title: '실시간 명령/데이터 로그',
        noLogs: '로그가 없습니다.',
        realtimeLogs: '실시간 로그',
        deviceInfo: '장치:',
      },
      
      // Test Report Screen
      testReport: {
        title: '테스트 보고서',
        shareReport: '보고서 공유',
        deviceInfo: '장치 정보',
        protocol: '프로토콜',
        supportedProtocols: '지원 프로토콜',
        resultTitle: '테스트 결과',
        limitationTitle: '제한사항:',
        limitations: {
          reborn: '• Reborn 프로토콜은 제어 명령이 불가능합니다. SIM, ERG, 유저의 기어 변경이 불가능합니다.',
          fitshow: '• FitShow 프로토콜은 Yafit에서 제어명령을 지원하지 않습니다. ERG, SIM, 유저의 기어 제어가 불가능합니다.',
          resistance: '• Resistance가 검출되지 않아 기본 기어값으로 설정',
          gearChange: '• 기어 변경 불가능',
          ergMode: '• ERG 모드 사용 불가능',
          simMode: '• SIM 모드 사용 불가능',
          unexpectedResistance: '• 의도하지 않은 저항 변경이 발생했습니다. 기기 자체 모드가 설정되어있는지 확인해주세요',
        },
        compatibilityDetails: '호환성 평가 상세',
        problems: '문제점',
        limitationReasonsTitle: '제한 사유',
        limitationReasons: {
          userGearControl: '유저가 기어 조절 불가',
          ergModeUnavailable: 'ERG 모드 사용 불가',
          simModeUnavailable: 'SIM 모드 사용 불가',
          notWorking: '미작동',
          notSupported: '미지원',
        },
        supportRange: '지원 범위',
        noSupportRangeData: '지원 범위 데이터 없음',
        supportFeatures: '지원 기능',
        noSupportFeaturesData: '지원 기능 데이터 없음',
        detectedDataFields: '감지된 데이터 필드',
        controlTestResult: '제어 테스트 결과',
        resistanceChangeLog: '저항 변화 로그',
        interactionLog: '상호작용 로그',
        copyLog: '로그 복사',
        noInteractionLog: '상호작용 로그 없음',
        testInfo: '테스트 정보',
        testCompletion: '테스트 완료:',
        completionTime: '완료 시간:',
        reportId: '보고서 ID:',
        noControlTestData: '제어 테스트 데이터 없음',
        noDataFieldsDetected: '감지된 데이터 필드 없음',
        noResistanceChangeData: '저항 변화 데이터 없음',
        tableHeaders: {
          name: '이름',
          detected: '감지',
          minValue: '최소값',
          maxValue: '최대값',
          currentValue: '현재값',
          min: '최소',
          max: '최대',
          current: '현재',
          time: '시간',
          previousValue: '이전값',
          changeReason: '변경 사유',
        },
        controlCommands: {
          resistanceLevel: '저항 레벨 설정',
          targetPower: '목표 파워 설정',
          simParams: '경사도 시뮬레이션',
        },
        status: {
          success: '성공',
          failed: '실패',
          notSupported: '미지원',
          pending: '대기 중',
        },
        testTime: '테스트 시간:',
        logActions: {
          showFullLog: '전체 로그 보기',
          hideLog: '로그 숨기기',
        },
        share: {
          title: 'PFInspector 호환성 보고서',
          deviceInfo: '장치 정보',
          deviceName: '장치명:',
          address: '주소:',
          mainProtocol: '주요 프로토콜:',
          supportedProtocols: '지원 프로토콜:',
          testInfo: '테스트 정보',
          testCompleted: '테스트 완료:',
          testDateTime: '테스트 일시:',
          compatibility: '호환성 판정:',
          judgmentReason: '판정 사유:',
          controlTestResults: '제어 테스트 결과',
          limitations: '제한사항',
          impossibleReasons: '불가능 사유',
          features: '지원 기능',
          supportRanges: '지원 범위',
          speed: '속도',
          incline: '경사도',
          resistance: '저항',
          power: '파워',
          detectedDataFields: '감지된 데이터 필드',
          resistanceChanges: '저항 변화 이력',
          range: '범위',
          increment: '증분',
          time: '시간',
          oldValue: '이전값',
          newValue: '현재값',
          cause: '원인',
          autoChange: '자동 변경',
        },
        clipboard: {
          success: '성공',
          error: '오류',
          info: '정보',
          copySuccess: '상호작용 로그가 클립보드에 복사되었습니다.',
          copyError: '로그 복사에 실패했습니다.',
          noLogs: '복사할 로그가 없습니다.',
        },
        compatibilityLevels: {
          fullyCompatible: '완전 호환',
          partiallyCompatible: '부분 호환',
          needsModification: '수정 필요',
          impossible: '불가능',
          evaluationImpossible: '평가 불가',
        },
      },
      
      // 이용약관
      terms: {
        title: 'PFInspector 앱 이용약관',
        content: `PFInspector 앱 이용약관

1. 서비스 개요
PFInspector은 피트니스 장치와의 연결을 제공하는 모바일 애플리케이션입니다.

2. 서비스 이용
- 본 앱은 블루투스 연결을 통해 피트니스 장치와 통신합니다.
- 위치 권한이 블루투스 스캔을 위해 필요합니다.
- 연결된 장치로부터 실시간 운동 데이터를 수집할 수 있습니다.

3. 개인정보 보호
- 수집된 데이터는 앱 내에서만 사용되며 외부로 전송되지 않습니다.
- 장치 정보 및 운동 데이터는 사용자의 기기에만 저장됩니다.`,
      },
    },
  },
  en: {
    translation: {
      // Common
      common: {
        close: 'Close',
        back: 'Back',
        cancel: 'Cancel',
        confirm: 'Confirm',
        loading: 'Loading...',
        error: 'Error',
        success: 'Success',
        unknown: 'Unknown',
      },
      
      // App Main
      app: {
        title: 'PFInspector',
        version: 'v0.8.3',
        status: {
          init: 'App is in test mode.',
          ready: 'BLE Manager initialized. You can start scanning.',
          scanning: 'Scanning for nearby devices...',
          scanComplete: 'Scan complete. Select a device.',
          bluetoothOff: 'Bluetooth is turned off. Please turn on Bluetooth and try again.',
          permissionDenied: 'Required permissions have been denied.',
          connectionFailed: 'Failed to connect to device. Please check Bluetooth status.',
          disconnected: 'Device connection has been terminated.',
          patchNotesPreparing: 'Patch notes feature is being prepared.',
          bleManagerInitFailed: 'BLE Manager initialization failed. BLE may not be supported.',
          bluetoothStateCheckError: 'Error occurred while checking Bluetooth status.',
          scanError: 'Scan error: {{error}}',
          unknownError: 'Unknown error',
          deviceSelected: '{{deviceName}} selected. Please select a mode.',
          connectingToDevice: 'Connecting to \'{{deviceName}}\'...',
          connectedRealtimeData: 'Connected to \'{{deviceName}}\'. Starting real-time data.',
          connectedCompatibilityTest: 'Connected to \'{{deviceName}}\'. Starting compatibility test.',
          connectionError: 'Connection error: {{error}}',
          disconnecting: 'Disconnecting...',
          disconnectedSuccess: 'Disconnected.',
          disconnectError: 'Error occurred while disconnecting.',
          bluetoothOn: 'Bluetooth is on. You can start scanning.',
          bluetoothOffSettings: 'Bluetooth is off. Going to Bluetooth settings.',
        },
        alerts: {
          connectionFailed: 'Connection failed',
          connectionFailedMessage: 'Failed to connect to device. Please check Bluetooth status.',
          confirm: 'Confirm',
        },
        buttons: {
          scan: 'Scan Devices',
          scanning: 'Scanning...',
          connect: 'Connect',
          connectDevice: 'Connect to \'{{deviceName}}\'',
          disconnect: 'Disconnect',
        },
        sections: {
          devices: 'Discovered Devices',
          noDevicesFound: 'No devices found.',
          noDevicesHelp: 'Please check if FTMS devices are turned on.',
          connectedDevice: 'Connected Device:',
        },
        menu: 'Menu',
        languageSettings: 'Language Settings',
        pastReports: 'Past Reports',
        patchNotes: 'Patch Notes',
        termsOfService: 'Terms of Service',
        close: 'Close',
      },
      
      // Menu
      menu: {
        title: 'Menu',
        languageSettings: 'Language Settings',
        pastReports: 'Past Reports',
        patchNotes: 'Patch Notes',
        termsOfService: 'Terms of Service',
        preparing: 'Preparing',
      },
      
      // Mode Selection
      modeSelection: {
        title: 'Mode Selection',
        subtitle: 'Please select the desired function',
        realtimeData: {
          title: 'Real-time Data Monitoring',
          description: 'Check real-time data such as speed, cadence, power, and resistance',
        },
        compatibilityTest: {
          title: 'Yafit Compatibility Test',
          description: 'Test FTMS protocol support and compatibility with Yafit app',
        },
      },
      
      // Real-time Data
      realtimeData: {
        title: 'Real-time Data',
        status: {
          connecting: 'Connecting...',
          subscribing: 'Subscribing to notifications...',
          runningSequence: 'Running connection sequence...',
          receiving: 'Receiving data...',
          sequenceFailed: 'Connection sequence failed. Please try again.',
          waiting: 'Waiting for data...',
        },
        data: {
          speed: 'Speed',
          cadence: 'Cadence',
          power: 'Power',
          resistance: 'Resist',
          heartRate: 'Heart Rate',
          totalDistance: 'Total Distance',
          elapsedTime: 'Elapsed Time',
          calories: 'Calories',
        },
        units: {
          kmh: 'km/h',
          rpm: 'rpm',
          watts: 'W',
          bpm: 'bpm',
          meters: 'm',
          seconds: 's',
          kcal: 'kcal',
        },
      },
      
      // Help
      help: {
        title: 'Device not being found?',
        description: 'If devices are not being scanned, please check if the device UUID is included in the protocols or sensors below. Some devices require pedaling to be detected.',
        note: 'If not included, this device is not compatible with Yafit. Please contact the administrator.',
        protocols: 'Protocols:',
        protocolsList: 'FTMS, CSC',
        customProtocols: 'Brand Custom Protocols:',
        customProtocolsList: 'Mobi, Reborn, FitShow, Tacx, YAFIT',
      },
      
      // Test Screen
      test: {
        title: 'Yafit Compatibility Test',
        ready: 'Test Ready',
        starting: 'Starting Test...',
        stopped: 'Test stopped.',
        stoppedDisconnected: 'Test stopped and device connection terminated.',
        stoppedError: 'Test stopped. (Error occurred during disconnection)',
        completion: 'Complete',
        resultTitle: 'Test Result',
        limitationTitle: 'Limitations:',
        limitations: {
          reborn: '• Reborn protocol control commands are not possible. SIM, ERG, user gear changes are not possible.',
          fitshow: '• FitShow protocol does not support control commands in Yafit. ERG, SIM, user gear control is not possible.',
          resistance: '• Resistance not detected, set to default gear value',
          gearChange: '• Gear change not possible',
          ergMode: '• ERG mode not available',
          simMode: '• SIM mode not available',
          unexpectedResistance: '• Unexpected resistance change occurred. Please check if the device is in its own mode.',
        },
        detailInfo: 'Test Detailed Information',
        supportRange: 'Support Range',
        controlTestResult: 'Control Test Result',
        detectedDataFields: 'Detected Data Fields',
        viewFullReport: 'View Full Report',
        mobiInstruction: {
          title: 'Mobi Protocol Guide',
          description: 'Mobi devices require pedaling to transmit data.\nPlease pedal continuously during the test.',
          note: 'This protocol only checks cadence data.',
        },
        startTest: 'Start Test',
        stopTest: 'Stop Test',
        back: 'Back',
        cancel: 'Cancel',
        confirm: 'Start',
        no: 'No',
        yes: 'Yes',
        countdown: 'seconds until command execution',
        helpTitle: 'Test Help',
        helpText: 'If you manually change the resistance during the test, the test result may be incorrect. \nIf the test result is different from your expectation, please try again by pedaling or stopping and restarting the test.',
        realtimeLog: {
          show: 'Show Real-time Log',
          hide: 'Hide Log',
        },
        userInteraction: {
          commandStart: 'Execute Control Command',
          resistanceCheck: 'Check Resistance Change',
          resistanceCheckText: 'Please check if the resistance has actually changed after executing the command.',
        },
        compatibilityLevels: {
          fullyCompatible: 'Fully Compatible',
          partiallyCompatible: 'Partially Compatible',
          needsModification: 'Needs Modification',
          impossible: 'Impossible',
        },
        controlCommands: {
          resistanceLevel: 'Resistance Level',
          targetPower: 'Target Power',
          simParams: 'Incline Simulation',
        },
        status: {
          success: 'Success',
          failed: 'Failed',
          notSupported: 'Not Supported',
        },
      },
      
      // Loading Screen
      loading: {
        connecting: 'Connecting...',
      },
      
      // Past Reports Screen
      pastReports: {
        title: 'Past Reports',
        noSavedReports: 'No saved reports',
        loadingReports: 'Loading reports...',
        confirmDelete: 'Are you sure you want to delete this report?',
        confirmDeleteMultiple: 'Are you sure you want to delete these {{count}} reports?',
        deleteSuccess: 'Report has been deleted.',
        deleteMultipleSuccess: '{{count}} reports have been deleted.',
        deleteError: 'Failed to delete report.',
        emptyStateDescription: 'Reports will be saved here when you complete compatibility tests',
        languageNote: '*Compatibility judgment results may be displayed in the language set at the time.',
        selectMode: 'Select Mode',
        cancelSelection: 'Cancel Selection',
        selectAll: 'Select All',
        deselectAll: 'Deselect All',
        selectedCount: '{{count}} selected',
        deleteSelected: 'Delete Selected Item',
        noItemsSelected: 'No items selected',
      },
      
      // Logs Screen
      logs: {
        title: 'Real-time Command/Data Log',
        noLogs: 'No logs.',
        realtimeLogs: 'Real-time Logs',
        deviceInfo: 'Device:',
      },
      
      // Test Report Screen
      testReport: {
        title: 'Test Report',
        shareReport: 'Share Report',
        deviceInfo: 'Device Information',
        protocol: 'Protocol',
        supportedProtocols: 'Supported Protocols',
        resultTitle: 'Test Result',
        limitationTitle: 'Limitations:',
        limitations: {
          reborn: '• Reborn protocol control commands are not possible. SIM, ERG, user gear changes are not possible.',
          fitshow: '• FitShow protocol does not support control commands in Yafit. ERG, SIM, user gear control is not possible.',
          resistance: '• Resistance not detected, set to default gear value',
          gearChange: '• Gear change not possible',
          ergMode: '• ERG mode not available',
          simMode: '• SIM mode not available',
          unexpectedResistance: '• Unexpected resistance change occurred. Please check if the device is in its own mode.',
        },
        compatibilityDetails: 'Compatibility Assessment Details',
        problems: 'Problems',
        limitationReasonsTitle: 'Restriction Reasons',
        limitationReasons: {
          userGearControl: 'User gear control not available',
          ergModeUnavailable: 'ERG mode not available',
          simModeUnavailable: 'SIM mode not available',
          notWorking: 'Not working',
          notSupported: 'Not supported',
        },
        supportRange: 'Support Range',
        noSupportRangeData: 'No support range data',
        supportFeatures: 'Support Features',
        noSupportFeaturesData: 'No support features data',
        detectedDataFields: 'Detected Data Fields',
        controlTestResult: 'Control Test Result',
        resistanceChangeLog: 'Resistance Change Log',
        interactionLog: 'Interaction Log',
        copyLog: 'Copy Log',
        noInteractionLog: 'No interaction log',
        testInfo: 'Test Information',
        testCompletion: 'Test Completion:',
        completionTime: 'Completion Time:',
        reportId: 'Report ID:',
        noControlTestData: 'No control test data',
        noDataFieldsDetected: 'No data fields detected',
        noResistanceChangeData: 'No resistance change data',
        tableHeaders: {
          name: 'Name',
          detected: 'Detect',
          minValue: 'Min',
          maxValue: 'Max',
          currentValue: 'Curr',
          min: 'Min',
          max: 'Max',
          current: 'Curr',
          time: 'Time',
          previousValue: 'Prev',
          changeReason: 'Reason',
        },
        controlCommands: {
          resistanceLevel: 'Resistance Level Setting',
          targetPower: 'Target Power Setting',
          simParams: 'Incline Simulation',
        },
        status: {
          success: 'Success',
          failed: 'Failed',
          notSupported: 'Not Supported',
          pending: 'Pending',
        },
        testTime: 'Test Time:',
        logActions: {
          showFullLog: 'Show Full Log',
          hideLog: 'Hide Log',
        },
        share: {
          title: 'PFInspector Compatibility Report',
          deviceInfo: 'Device Information',
          deviceName: 'Device Name:',
          address: 'Address:',
          mainProtocol: 'Main Protocol:',
          supportedProtocols: 'Supported Protocols:',
          testInfo: 'Test Information',
          testCompleted: 'Test Completed:',
          testDateTime: 'Test Date/Time:',
          compatibility: 'Compatibility Assessment:',
          judgmentReason: 'Assessment Reason:',
          controlTestResults: 'Control Test Results',
          limitations: 'Limitations',
          impossibleReasons: 'Impossible Reasons',
          features: 'Support Features',
          supportRanges: 'Support Ranges',
          speed: 'Speed',
          incline: 'Incline',
          resistance: 'Resist',
          power: 'Power',
          detectedDataFields: 'Detected Data Fields',
          resistanceChanges: 'Resistance Change History',
          range: 'Range',
          increment: 'Increment',
          time: 'Time',
          oldValue: 'Old Value',
          newValue: 'New Value',
          cause: 'Cause',
          autoChange: 'Auto Change',
        },
        clipboard: {
          success: 'Success',
          error: 'Error',
          info: 'Info',
          copySuccess: 'Interaction log has been copied to clipboard.',
          copyError: 'Failed to copy log.',
          noLogs: 'No logs to copy.',
        },
        compatibilityLevels: {
          fullyCompatible: 'Fully Compatible',
          partiallyCompatible: 'Partially Compatible',
          needsModification: 'Needs Modification',
          impossible: 'Impossible',
          evaluationImpossible: 'Evaluation Impossible',
        },
      },
      
      // Terms of Service
      terms: {
        title: 'PFInspector App Terms of Service',
        content: `PFInspector App Terms of Service

1. Service Overview
PFInspector is a mobile application that provides connectivity with fitness devices.

2. Service Usage
- This app communicates with fitness devices through Bluetooth connection.
- Location permission is required for Bluetooth scanning.
- Real-time exercise data can be collected from connected devices.

3. Privacy Protection
- Collected data is used only within the app and is not transmitted externally.
- Device information and exercise data are stored only on the user's device.`,
      },
    },
  },
  zh: {
    translation: {
      // 通用
      common: {
        close: '关闭',
        back: '返回',
        cancel: '取消',
        confirm: '确认',
        loading: '加载中...',
        error: '错误',
        success: '成功',
        unknown: '未知',
      },
      
      // 应用主界面
      app: {
        title: 'PFInspector',
        version: 'v0.8.3',
        status: {
          init: '应用测试中。',
          ready: 'BLE 管理器已初始化。可以开始扫描。',
          scanning: '正在搜索附近设备...',
          scanComplete: '扫描完成。请选择设备。',
          bluetoothOff: '蓝牙已关闭。请打开蓝牙后重试。',
          permissionDenied: '必需权限已被拒绝。',
          connectionFailed: '连接设备失败。请检查蓝牙状态。',
          disconnected: '设备连接已断开。',
          patchNotesPreparing: '更新日志功能正在准备中。',
          bleManagerInitFailed: 'BLE管理器初始化失败。可能不支持BLE。',
          bluetoothStateCheckError: '检查蓝牙状态时发生错误。',
          scanError: '扫描错误：{{error}}',
          unknownError: '未知错误',
          deviceSelected: '{{deviceName}}已选择。请选择模式。',
          connectingToDevice: '正在连接到\'{{deviceName}}\'...',
          connectedRealtimeData: '已连接到\'{{deviceName}}\'。开始实时数据。',
          connectedCompatibilityTest: '已连接到\'{{deviceName}}\'。开始兼容性测试。',
          connectionError: '连接错误：{{error}}',
          disconnecting: '断开连接中...',
          disconnectedSuccess: '已断开连接。',
          disconnectError: '断开连接时发生错误。',
          bluetoothOn: '蓝牙已开启。可以开始扫描。',
          bluetoothOffSettings: '蓝牙已关闭。正在转到蓝牙设置。',
        },
        alerts: {
          connectionFailed: '连接失败',
          connectionFailedMessage: '连接设备失败。请检查蓝牙状态。',
          confirm: '确认',
        },
        buttons: {
          scan: '扫描设备',
          scanning: '正在扫描...',
          connect: '连接',
          connectDevice: '连接到\'{{deviceName}}\'',
          disconnect: '断开连接',
        },
        sections: {
          devices: '发现的设备',
          noDevicesFound: '未发现设备。',
          noDevicesHelp: '请检查FTMS设备是否已开启。',
          connectedDevice: '已连接设备:',
        },
        menu: '菜单',
        languageSettings: '语言设置',
        pastReports: '历史报告',
        patchNotes: '更新日志',
        termsOfService: '服务条款',
        close: '关闭',
      },
      
      // 菜单
      menu: {
        title: '菜单',
        languageSettings: '语言设置',
        pastReports: '历史报告',
        patchNotes: '更新日志',
        termsOfService: '服务条款',
        preparing: '准备中',
      },
      
      // 模式选择
      modeSelection: {
        title: '模式选择',
        subtitle: '请选择所需功能',
        realtimeData: {
          title: '实时数据监控',
          description: '查看速度、踏频、功率、阻力等实时数据',
        },
        compatibilityTest: {
          title: 'Yafit兼容性测试',
          description: '测试FTMS协议支持和与Yafit应用的兼容性',
        },
      },
      
      // 实时数据
      realtimeData: {
        title: '实时数据',
        status: {
          connecting: '连接中...',
          subscribing: '订阅通知中...',
          runningSequence: '运行连接序列...',
          receiving: '接收数据中...',
          sequenceFailed: '连接序列失败。请重试。',
          waiting: '等待数据...',
        },
        data: {
          speed: '速度',
          cadence: '踏频',
          power: '功率',
          resistance: '阻力等级',
          heartRate: '心率',
          totalDistance: '总距离',
          elapsedTime: '经过时间',
          calories: '卡路里',
        },
        units: {
          kmh: 'km/h',
          rpm: 'rpm',
          watts: 'W',
          bpm: 'bpm',
          meters: 'm',
          seconds: 's',
          kcal: 'kcal',
        },
      },
      
      // 帮助
      help: {
        title: '设备未被找到？',
        description: '如果设备未被扫描到，请检查设备UUID是否包含在以下协议或传感器中。某些设备需要踩踏才能被检测到。',
        note: '如果不包含，则该设备与Yafit不兼容。请联系管理员。',
        protocols: '协议：',
        protocolsList: 'FTMS, CSC',
        customProtocols: '品牌自定义协议：',
        customProtocolsList: 'Mobi, Reborn, FitShow, Tacx, YAFIT',
      },
      
      // 测试屏幕
      test: {
        title: 'Yafit兼容性测试',
        ready: '测试准备完成',
        starting: '测试开始中...',
        stopped: '测试已停止',
        stoppedDisconnected: '测试已停止且设备连接已断开',
        stoppedError: '测试已停止。（断开连接时发生错误）',
        completion: '完成',
        resultTitle: '测试结果',
        limitationTitle: '限制：',
        limitations: {
          reborn: '• Reborn协议控制命令不可用。SIM、ERG、用户齿轮更改不可用。',
          fitshow: '• FitShow协议在Yafit中不支持控制命令。ERG、SIM、用户齿轮控制不可用。',
          resistance: '• 未检测到阻力，设置为默认齿轮值',
          gearChange: '• 齿轮更改不可用',
          ergMode: '• ERG模式不可用',
          simMode: '• SIM模式不可用',
          unexpectedResistance: '• 发生意外阻力变化。请检查设备是否处于自身模式。',
        },
        detailInfo: '测试详细信息',
        supportRange: '支持范围',
        controlTestResult: '控制测试结果',
        detectedDataFields: '检测到的数据字段',
        viewFullReport: '查看完整报告',
        mobiInstruction: {
          title: 'Mobi协议指南',
          description: 'Mobi设备需要踩踏才能传输数据。\n测试进行中请持续踩踏。',
          note: '此协议仅检查踏频数据。',
        },
        startTest: '开始测试',
        stopTest: '停止测试',
        back: '返回',
        cancel: '取消',
        confirm: '开始',
        no: '否',
        yes: '是',
        countdown: '秒后执行命令',
        helpTitle: '测试帮助',
        helpText: '如果在测试过程中手动更改阻力，测试结果可能不正确。\n如果测试结果与预期不同，请通过踩踏或停止并重新开始测试。',
        realtimeLog: {
          show: '显示实时日志',
          hide: '隐藏日志',
        },
        userInteraction: {
          commandStart: '执行控制命令',
          resistanceCheck: '检查阻力变化',
          resistanceCheckText: '请检查命令执行后阻力是否实际发生变化。',
        },
        compatibilityLevels: {
          fullyCompatible: '完全兼容',
          partiallyCompatible: '部分兼容',
          needsModification: '需要修改',
          impossible: '不可能',
        },
        controlCommands: {
          resistanceLevel: '阻力等级',
          targetPower: '目标功率',
          simParams: '倾斜模拟',
        },
        status: {
          success: '成功',
          failed: '失败',
          notSupported: '不支持',
        },
      },
      
      // 加载屏幕
      loading: {
        connecting: '连接中...',
      },
      
      // 历史报告屏幕
      pastReports: {
        title: '历史报告',
        noSavedReports: '无保存的报告',
        loadingReports: '加载报告中...',
        confirmDelete: '确定要删除此报告吗？',
        confirmDeleteMultiple: '确定要删除这些{{count}}报告吗？',
        deleteSuccess: '报告已删除。',
        deleteMultipleSuccess: '{{count}}个报告已删除。',
        deleteError: '删除报告失败。',
        emptyStateDescription: '完成兼容性测试后，报告将保存在这里',
        languageNote: '*兼容性判定结果可能会以当时的语言显示。',
        selectMode: '选择模式',
        cancelSelection: '取消选择',
        selectAll: '全部选择',
        deselectAll: '全部取消选择',
        selectedCount: '{{count}}已选择',
        deleteSelected: '删除选定项目',
        noItemsSelected: '没有选择项目',
      },
      
      // 日志屏幕
      logs: {
        title: '实时命令/数据日志',
        noLogs: '无日志。',
        realtimeLogs: '实时日志',
        deviceInfo: '设备:',
      },
      
      // Test Report Screen
      testReport: {
        title: '测试报告',
        shareReport: '分享报告',
        deviceInfo: '设备信息',
        protocol: '协议',
        supportedProtocols: '支持的协议',
        resultTitle: '测试结果',
        limitationTitle: '限制：',
        limitations: {
          reborn: '• Reborn协议控制命令不可用。SIM、ERG、用户齿轮更改不可用。',
          fitshow: '• FitShow协议在Yafit中不支持控制命令。ERG、SIM、用户齿轮控制不可用。',
          resistance: '• 未检测到阻力，设置为默认齿轮值',
          gearChange: '• 齿轮更改不可用',
          ergMode: '• ERG模式不可用',
          simMode: '• SIM模式不可用',
          unexpectedResistance: '• 发生意外阻力变化。请检查设备是否处于自身模式。',
        },
        compatibilityDetails: '兼容性评估详情',
        problems: '问题',
        limitationReasonsTitle: '限制原因',
        limitationReasons: {
          userGearControl: '用户齿轮控制不可用',
          ergModeUnavailable: 'ERG模式不可用',
          simModeUnavailable: 'SIM模式不可用',
          notWorking: '不工作',
          notSupported: '不支持',
        },
        supportRange: '支持范围',
        noSupportRangeData: '无支持范围数据',
        supportFeatures: '支持功能',
        noSupportFeaturesData: '无支持功能数据',
        detectedDataFields: '检测到的数据字段',
        controlTestResult: '控制测试结果',
        resistanceChangeLog: '阻力变化日志',
        interactionLog: '交互日志',
        copyLog: '复制日志',
        noInteractionLog: '无交互日志',
        testInfo: '测试信息',
        testCompletion: '测试完成：',
        completionTime: '完成时间：',
        reportId: '报告ID：',
        noControlTestData: '无控制测试数据',
        noDataFieldsDetected: '未检测到数据字段',
        noResistanceChangeData: '无阻力变化数据',
        tableHeaders: {
          name: '名称',
          detected: '检测',
          minValue: '最小值',
          maxValue: '最大值',
          currentValue: '当前值',
          min: '最小',
          max: '最大',
          current: '当前',
          time: '时间',
          previousValue: '之前值',
          changeReason: '变更原因',
        },
        controlCommands: {
          resistanceLevel: '阻力等级设置',
          targetPower: '目标功率设置',
          simParams: '倾斜模拟',
        },
        status: {
          success: '成功',
          failed: '失败',
          notSupported: '不支持',
          pending: '等待中',
        },
        testTime: '测试时间：',
        logActions: {
          showFullLog: '显示完整日志',
          hideLog: '隐藏日志',
        },
        share: {
          title: 'PFInspector兼容性报告',
          deviceInfo: '设备信息',
          deviceName: '设备名称：',
          address: '地址：',
          mainProtocol: '主要协议：',
          supportedProtocols: '支持的协议：',
          testInfo: '测试信息',
          testCompleted: '测试完成：',
          testDateTime: '测试日期/时间：',
          compatibility: '兼容性评估：',
          judgmentReason: '评估原因：',
          controlTestResults: '控制测试结果',
          limitations: '限制',
          impossibleReasons: '不可能原因',
          features: '支持的功能',
          supportRanges: '支持范围',
          speed: '速度',
          incline: '倾斜',
          resistance: '阻力',
          power: '功率',
          detectedDataFields: '检测到的数据字段',
          resistanceChanges: '阻力变化历史',
          range: '范围',
          increment: '增量',
          time: '时间',
          oldValue: '旧值',
          newValue: '新值',
          cause: '原因',
          autoChange: '自动变化',
        },
        clipboard: {
          success: '成功',
          error: '错误',
          info: '信息',
          copySuccess: '交互日志已复制到剪贴板。',
          copyError: '复制日志失败。',
          noLogs: '没有可复制的日志。',
        },
        compatibilityLevels: {
          fullyCompatible: '完全兼容',
          partiallyCompatible: '部分兼容',
          needsModification: '需要修改',
          impossible: '不可能',
          evaluationImpossible: '评估不可能',
        },
      },
      
      // 服务条款
      terms: {
        title: 'PFInspector应用服务条款',
        content: `PFInspector应用服务条款

1. 服务概述
PFInspector是一个提供与健身设备连接的移动应用程序。

2. 服务使用
- 本应用通过蓝牙连接与健身设备通信。
- 蓝牙扫描需要位置权限。
- 可以从连接的设备收集实时运动数据。

3. 隐私保护
- 收集的数据仅在应用内使用，不会向外传输。
- 设备信息和运动数据仅存储在用户设备上。`,
      },
    },
  },
};

// i18n 초기화 - 저장된 언어 설정 로드
i18n
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: null,
    debug: __DEV__,
    pluralSeparator: '_',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

// 언어 설정 함수 추가
export const setLanguage = async (lng: string) => {
  console.log('Setting language to:', lng);
  await i18n.changeLanguage(lng);
  await AsyncStorage.setItem('user-language', lng);
  console.log('Language saved to AsyncStorage:', lng);
  console.log('Current i18n language after setLanguage:', i18n.language);
};

// 초기 언어 로드 - 앱 시작 시 호출
export const initializeLanguage = async () => {
  try {
    const savedLanguage = await AsyncStorage.getItem('user-language');
    console.log('Saved language from AsyncStorage:', savedLanguage);
    
    // 사용 가능한 언어 목록 확인
    const availableLanguages = ['ko', 'en', 'zh'];
    console.log('Available languages:', availableLanguages);
    
    if (savedLanguage && availableLanguages.includes(savedLanguage)) {
      console.log('Setting language to saved language:', savedLanguage);
      await i18n.changeLanguage(savedLanguage);
    } else {
      // 저장된 언어가 없으면 기본 언어(한국어)로 설정
      console.log('No saved language found, setting to default (ko)');
      await i18n.changeLanguage('ko');
    }
    
    console.log('Current i18n language after initialization:', i18n.language);
  } catch (error) {
    console.error('Failed to initialize language:', error);
    // 오류 발생 시 기본 언어로 설정
    await i18n.changeLanguage('ko');
  }
};

export default i18n; 