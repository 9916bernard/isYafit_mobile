// FtmsTestReport.ts - FTMS Test Report utility for IsYafit app
import { Buffer } from 'buffer';
import { t } from './utils/i18n_result';

// If ProtocolType or other types are used, import from './FtmsManager'.

// UUID Constants for FTMS characteristics
export const RANGE_CHAR_UUIDS = {
    SPEED_RANGE: "00002ad4-0000-1000-8000-00805f9b34fb",
    INCLINE_RANGE: "00002ad5-0000-1000-8000-00805f9b34fb", 
    RESISTANCE_RANGE: "00002ad6-0000-1000-8000-00805f9b34fb",
    POWER_RANGE: "00002ad8-0000-1000-8000-00805f9b34fb"
};

// Range info interfaces
export interface RangeInfo {
    min: number;
    max: number;
    increment: number;
}

// Data change tracking interfaces
export interface DataChangeEvent {
    timestamp: number;
    paramType: string;
    oldValue?: number;
    newValue: number;
    command?: string;
}

// Test results interfaces
export interface TestResults {
    deviceInfo: {
        name: string;
        address: string;
        services: string[];
        protocol?: string;
    };
    connection: {
        status: boolean;
        timestamp: number;
    };
    supportedProtocols: string[];
    features?: {
        [key: string]: boolean;
    };
    supportRanges?: {
        speed?: RangeInfo;
        incline?: RangeInfo;
        resistance?: RangeInfo;
        power?: RangeInfo;
    };
    dataFields?: {
        [key: string]: {
            detected: boolean;
            minValue?: number;
            maxValue?: number;
            currentValue?: number;
        }
    };
    controlTests?: {
        [key: string]: {
            status: string; // "OK", "Failed", "Not Supported"
            timestamp: number;
            details?: string;
        }
    };
    resistanceChanges?: DataChangeEvent[];
    compatibilityLevel?: string; // Will use translation keys
    reasons?: string[];
    issuesFound?: string[];
    testCompleted: boolean;
    testCompletedTimestamp?: number;
    reportId?: string;
    interactionLogs?: string[]; // Added for detailed logging
}

// Initialize a new test result object
export function initTestResults(): TestResults {
    return {
        deviceInfo: {
            name: '',
            address: '',
            services: []
        },
        connection: {
            status: false,
            timestamp: Date.now()
        },
        supportedProtocols: [],
        features: {},
        dataFields: {
            speed: { detected: false },
            cadence: { detected: false },
            power: { detected: false },
            resistance: { detected: false },
            heartRate: { detected: false },
            distance: { detected: false }
        },
        resistanceChanges: [],
        controlTests: {},
        testCompleted: false,
        issuesFound: [],
        reasons: [],
        interactionLogs: [] // Initialize logs array
    };
}

// Function to update a data field when detected
export function updateDataField(results: TestResults, fieldName: string, value: number): TestResults {
    const updatedResults = { ...results };
    
    if (!updatedResults.dataFields) {
        updatedResults.dataFields = {};
    }
    
    if (!updatedResults.dataFields[fieldName]) {
        updatedResults.dataFields[fieldName] = {
            detected: true,
            minValue: value,
            maxValue: value, 
            currentValue: value
        };
    } else {
        const field = updatedResults.dataFields[fieldName];
        field.detected = true;
        field.currentValue = value;
        
        if (field.minValue === undefined || value < field.minValue) {
            field.minValue = value;
        }
        
        if (field.maxValue === undefined || value > field.maxValue) {
            field.maxValue = value;
        }
    }
    
    return updatedResults;
}

// Function to record resistance changes for tracking
export function trackResistanceChange(
    results: TestResults, 
    paramType: string, 
    newValue: number, 
    oldValue?: number,
    command?: string
): TestResults {
    const updatedResults = { ...results };
    
    if (!updatedResults.resistanceChanges) {
        updatedResults.resistanceChanges = [];
    }
    
    updatedResults.resistanceChanges.push({
        timestamp: Date.now(),
        paramType,
        oldValue,
        newValue,
        command
    });
      return updatedResults;
}

// Function to generate a compatibility rating based on test results with detailed reasons
export function determineCompatibility(results: TestResults): TestResults {
    const updatedResults = { ...results };
    
    // Initialize arrays for detailed compatibility analysis
    const ftmsBasedProtocols = ["FTMS", "YAFIT_S3", "YAFIT_S4", "FITSHOW", "TACX", "REBORN"];
    const hasFTMS = results.supportedProtocols.some(p => ftmsBasedProtocols.includes(p));
    const hasCSC = results.supportedProtocols.includes("CSC");
    const _hasMobi = results.supportedProtocols.includes("MOBI");

    const impossibleReasons: string[] = [];
    const partialReasons: string[] = [];
    const warningReasons: string[] = [];
    
    // 1. Check if test was interrupted (불가능(중지))
    if (results.issuesFound?.some(issue => issue.includes('연결이 끊어졌습니다') || issue.includes('테스트 중단'))) {
        impossibleReasons.push(t('testResult.reasons.stopped'));
    }      // 2. Check cadence detection (불가능(RPM)) - REBORN은 cadence 검출 여부에 따라 판별
    const priorityProtocols = ["MOBI", "tacx", "YAFIT_S3", "YAFIT_S4"];
    const hasPriorityProtocol = results.supportedProtocols.some(protocol => priorityProtocols.includes(protocol));
    const hasReborn = results.supportedProtocols.includes("REBORN");
    const hasFitShow = results.supportedProtocols.includes("FITSHOW");
    
    // REBORN은 cadence 검출 여부에 따라 판별, 다른 우선순위 프로토콜은 예외 처리
    if (!results.dataFields?.cadence?.detected && !hasPriorityProtocol && !hasReborn && !hasFitShow) {
        impossibleReasons.push(t('testResult.reasons.rpm'));
    } else if (!results.dataFields?.cadence?.detected && hasReborn) {
        impossibleReasons.push(t('testResult.reasons.rpm'));
    } else if (!results.dataFields?.cadence?.detected && hasFitShow) {
        impossibleReasons.push(t('testResult.reasons.rpm'));
    }
    
    // REBORN 프로토콜의 경우 제어 명령이 불가능하므로 부분 호환으로 분류
    if (hasReborn) {
        partialReasons.push(t('testResult.reasons.controlCommand'));
    }
    
    // FITSHOW 프로토콜의 경우 제어 명령이 불가능하므로 부분 호환으로 분류
    if (hasFitShow) {
        partialReasons.push(t('testResult.reasons.controlCommand'));
    }      // 3. Check protocol support (불가능(프로토콜)) - 우선순위 프로토콜도 지원 프로토콜로 인정
    if (!hasFTMS && !hasCSC && !hasPriorityProtocol && !hasReborn) {
        impossibleReasons.push(t('testResult.reasons.protocol'));
    } else if ((!hasFTMS && hasCSC) || hasPriorityProtocol || hasReborn) {
        // CSC only case or priority protocol case - add specific reason
        if ((hasPriorityProtocol || hasReborn) && !hasFTMS) {
            partialReasons.push(t('testResult.reasons.basicFunction')); // 우선순위 프로토콜은 기본기능으로 분류
        } else if (!hasFTMS && hasCSC) {
            partialReasons.push(t('testResult.reasons.basicFunction'));
        }
    }
    
    // 4. Check resistance detection (부분 호환(기어))
    if (!results.dataFields?.resistance?.detected) {
        partialReasons.push(t('testResult.reasons.gear'));
    }
    
    // Only check control tests if we have FTMS protocol
    if (hasFTMS) {
        const controlTests = results.controlTests || {};
        
        // 5. Check SET_RESISTANCE_LEVEL (부분 호환(기어))
        const resistanceTest = controlTests["SET_RESISTANCE_LEVEL"];
        if (resistanceTest && (resistanceTest.status === "Failed" || resistanceTest.status === "Pending")) {
            partialReasons.push(t('testResult.reasons.gear'));
        }
        
        // 6. Check SET_TARGET_POWER (부분 호환(ERG))
        const powerTest = controlTests["SET_TARGET_POWER"];
        if (powerTest && (powerTest.status === "Failed" || powerTest.status === "Pending")) {
            partialReasons.push(t('testResult.reasons.erg'));
        }
        
        // 7. Check SET_SIM_PARAMS (부분 호환(SIM))
        const simTest = controlTests["SET_SIM_PARAMS"];
        if (simTest && (simTest.status === "Failed" || simTest.status === "Pending")) {
            partialReasons.push(t('testResult.reasons.sim'));
        }
    }    // 8. Check for automatic resistance changes (수정 필요)
    if (results.resistanceChanges) {
        const automaticChanges = results.resistanceChanges.filter(change => 
            !change.command || change.command === 'autoChange'
        );
        if (automaticChanges.length >= 5) {
            warningReasons.push(t('testResult.reasons.autoChange'));
        }
    }
      // Determine final compatibility level based on priority: 불가능 > 수정필요/부분호환 > 완전호환
    let compatLevel: string;
    let displayReasons: string[] = [];
    
    // console.log('호환성 판정 디버깅:', { // log was here
    //     impossibleReasons,
    //     warningReasons,
    //     partialReasons,
    //     hasFTMS
    // }); // log was here

    if (impossibleReasons.length > 0) {
        compatLevel = t('testResult.compatibilityLevels.impossible');
        displayReasons = impossibleReasons;
    } else if (warningReasons.length > 0) {
        // 자동변화가 있으면 수정 필요 (부분 호환 이유와 함께 표시)
        compatLevel = t('testResult.compatibilityLevels.needsModification');
        displayReasons = [...partialReasons, ...warningReasons];
        // console.log('수정 필요로 분류됨:', displayReasons); // log was here
    } else if (partialReasons.length > 0) {
        compatLevel = t('testResult.compatibilityLevels.partiallyCompatible');
        displayReasons = partialReasons;
        // console.log('부분 호환으로 분류됨:', displayReasons); // log was here
    } else if (hasFTMS || hasPriorityProtocol) {
        // FTMS 또는 우선순위 프로토콜이 있으면 완전 호환 가능
        compatLevel = t('testResult.compatibilityLevels.fullyCompatible');
        displayReasons = [];
        // console.log('최종 호환성 레벨:', compatLevel, '이유:', displayReasons); // log was here
    } else {
        compatLevel = t('testResult.compatibilityLevels.impossible');
        displayReasons = [t('testResult.reasons.protocol')];
    }
    
    // console.log('최종 호환성 레벨:', compatLevel, '이유:', displayReasons); // log was here
    
    // Update results with new compatibility system
    updatedResults.compatibilityLevel = compatLevel;
    updatedResults.reasons = generateDetailedReasons(displayReasons, compatLevel, results);
    
    return updatedResults;
}

// Helper function to generate detailed reasons based on codes
function generateDetailedReasons(reasonCodes: string[], compatLevel: string, results: TestResults): string[] {
    const detailedReasons: string[] = [];
    
    // Remove duplicates from reason codes
    const uniqueCodes = [...new Set(reasonCodes)];
    
    // Generate comprehensive result message based on compatibility level and reasons
    let resultMessage = "";
    
    if (compatLevel === t('testResult.compatibilityLevels.impossible')) {
        if (uniqueCodes.includes(t('testResult.reasons.stopped'))) {
            resultMessage = t('testResult.messages.testStopped');
        } else if (uniqueCodes.includes(t('testResult.reasons.rpm'))) {
            resultMessage = t('testResult.messages.cadenceNotDetected');
        } else if (uniqueCodes.includes(t('testResult.reasons.protocol'))) {
            resultMessage = t('testResult.messages.unsupportedProtocol');
        }    } else if (compatLevel === t('testResult.compatibilityLevels.partiallyCompatible')) {
        resultMessage = t('testResult.messages.partialCompatible');
    } else if (compatLevel === t('testResult.compatibilityLevels.needsModification')) {
        let baseMessage = t('testResult.messages.modificationNeeded');
        let issues = [];
        
        if (uniqueCodes.includes(t('testResult.reasons.autoChange'))) {
            issues.push(t('testResult.messages.unexpectedResistanceChange'));
        }
        
        // Add any partial compatibility issues
        if (uniqueCodes.includes(t('testResult.reasons.gear'))) {
            if (!results.dataFields?.resistance?.detected) {
                issues.push(t('testResult.messages.gearDefault'));
            } else {
                issues.push(t('testResult.messages.userGearChange'));
            }
        }
        if (uniqueCodes.includes(t('testResult.reasons.erg'))) {
            issues.push(t('testResult.messages.ergModeUnavailable'));
        }
        if (uniqueCodes.includes(t('testResult.reasons.sim'))) {
            issues.push(t('testResult.messages.simModeUnavailable'));
        }
        if (uniqueCodes.includes(t('testResult.reasons.controlCommand'))) {
            issues.push(t('testResult.messages.controlCommandUnsupported'));
        }
        
        if (issues.length > 0) {
            resultMessage = baseMessage + " " + t('testResult.messages.but') + " " + issues.join(", ") + ".";
        } else {
            resultMessage = baseMessage;
        }
    } else if (compatLevel === t('testResult.compatibilityLevels.fullyCompatible')) {
        resultMessage = t('testResult.messages.fullyCompatible');
    }
      if (resultMessage) {
        detailedReasons.push(resultMessage);
    }
    
    // REBORN 프로토콜의 제한사항을 별도로 추가
    if (results.supportedProtocols.includes("REBORN")) {
        detailedReasons.push(t('testResult.protocolLimitations.reborn'));
    }
    
    // FITSHOW 프로토콜의 제한사항을 별도로 추가
    if (results.supportedProtocols.includes("FITSHOW")) {
        detailedReasons.push(t('testResult.protocolLimitations.fitshow'));
    }
    
    return detailedReasons;
}

// Function to finalize and save the test report
export function finalizeTestReport(results: TestResults): TestResults {
    let processedResults = { ...results };

    const finalResults = determineCompatibility({
        ...processedResults,
        testCompleted: true,
        testCompletedTimestamp: Date.now(),
        reportId: `yafit-${Date.now()}`
    });
    
    return finalResults;
}

// Function to parse range characteristic values
export function parseRangeCharacteristic(data: Buffer): RangeInfo {
    const min = data.readInt16LE(0);
    const max = data.readInt16LE(2);
    const increment = data.readInt16LE(4);
    
    return { min, max, increment };
}

// Returns a formatted representation of resistance range info
export function formatRangeInfo(info: RangeInfo | undefined, type: string): string {
    if (!info) return `${t(`testResult.rangeInfo.${type}`)}: ${t('testResult.rangeInfo.noInfo')}`;
    
    switch(type) {
        case 'speed':
            return `${t('testResult.rangeInfo.speed')}: ${(info.min / 100).toFixed(1)} - ${(info.max / 100).toFixed(1)} km/h (${t('testResult.rangeInfo.increment')}: ${(info.increment / 100).toFixed(2)})`;
        case 'incline':
            return `${t('testResult.rangeInfo.incline')}: ${(info.min / 10).toFixed(1)} - ${(info.max / 10).toFixed(1)} % (${t('testResult.rangeInfo.increment')}: ${(info.increment / 10).toFixed(1)})`;
        case 'resistance':
            return `${t('testResult.rangeInfo.resistance')}: ${info.min} - ${info.max} (${t('testResult.rangeInfo.increment')}: ${info.increment})`;
        case 'power':
            return `${t('testResult.rangeInfo.power')}: ${info.min} - ${info.max} W (${t('testResult.rangeInfo.increment')}: ${info.increment})`;
        default:
            return `${t(`testResult.rangeInfo.${type}`)}: ${info.min} - ${info.max} (${t('testResult.rangeInfo.increment')}: ${info.increment})`;
    }
}
