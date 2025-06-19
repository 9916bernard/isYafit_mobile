// FtmsTestReport.ts - FTMS Test Report utility for IsYafit app
import { Buffer } from 'buffer';

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
    compatibilityLevel?: "완전 호환" | "부분 호환" | "수정 필요" | "불가능";
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
    const impossibleReasons: string[] = [];
    const partialReasons: string[] = [];
    const warningReasons: string[] = [];
    
    // 1. Check if test was interrupted (불가능(중지))
    if (results.issuesFound?.some(issue => issue.includes('연결이 끊어졌습니다') || issue.includes('테스트 중단'))) {
        impossibleReasons.push('중지');
    }
    
    // 2. Check cadence detection (불가능(RPM))
    if (!results.dataFields?.cadence?.detected) {
        impossibleReasons.push('RPM');
    }
    
    // 3. Check protocol support (불가능(프로토콜))
    const hasFTMS = results.supportedProtocols.includes("FTMS");
    const hasCSC = results.supportedProtocols.includes("CSC");
    
    if (!hasFTMS && !hasCSC) {
        impossibleReasons.push('프로토콜');
    } else if (!hasFTMS && hasCSC) {
        // CSC only case - add specific reason
        partialReasons.push('기본기능');
    }
    
    // 4. Check resistance detection (부분 호환(기어))
    if (!results.dataFields?.resistance?.detected) {
        partialReasons.push('기어');
    }
    
    // Only check control tests if we have FTMS protocol
    if (hasFTMS) {
        const controlTests = results.controlTests || {};
        
        // 5. Check SET_RESISTANCE_LEVEL (부분 호환(기어))
        const resistanceTest = controlTests["SET_RESISTANCE_LEVEL"];
        if (resistanceTest && (resistanceTest.status === "Failed" || resistanceTest.status === "Pending")) {
            partialReasons.push('기어');
        }
        
        // 6. Check SET_TARGET_POWER (부분 호환(ERG))
        const powerTest = controlTests["SET_TARGET_POWER"];
        if (powerTest && (powerTest.status === "Failed" || powerTest.status === "Pending")) {
            partialReasons.push('ERG');
        }
        
        // 7. Check SET_SIM_PARAMS (부분 호환(SIM))
        const simTest = controlTests["SET_SIM_PARAMS"];
        if (simTest && (simTest.status === "Failed" || simTest.status === "Pending")) {
            partialReasons.push('SIM');
        }
    }
    
    // 8. Check for automatic resistance changes (수정 필요)
    if (results.resistanceChanges) {
        const automaticChanges = results.resistanceChanges.filter(change => !change.command);
        if (automaticChanges.length >= 5) {
            warningReasons.push('자동변화');
        }
    }
    
    // Determine final compatibility level based on priority: 불가능 > 부분호환 > 완전호환
    let compatLevel: "완전 호환" | "부분 호환" | "수정 필요" | "불가능";
    let displayReasons: string[] = [];
    
    if (impossibleReasons.length > 0) {
        compatLevel = "불가능";
        displayReasons = impossibleReasons;
    } else if (partialReasons.length > 0 || warningReasons.length > 0) {
        if (warningReasons.length > 0) {
            compatLevel = "수정 필요";
            displayReasons = [...partialReasons, ...warningReasons];
        } else {
            compatLevel = "부분 호환";
            displayReasons = partialReasons;
        }
    } else if (hasFTMS) {
        compatLevel = "완전 호환";
        displayReasons = [];
    } else {
        compatLevel = "불가능";
        displayReasons = ['프로토콜'];
    }
    
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
    
    if (compatLevel === "불가능") {
        if (uniqueCodes.includes('중지')) {
            resultMessage = "테스트가 도중에 중단되었습니다. 다시 시도해주세요.";
        } else if (uniqueCodes.includes('RPM')) {
            resultMessage = "필수 요소인 cadence가 검출되지 않았습니다. Yafit과 호환되지 않습니다.";
        } else if (uniqueCodes.includes('프로토콜')) {
            resultMessage = "Yafit에서 지원하지 않는 프로토콜입니다. Yafit과 호환되지 않습니다.";
        }
    } else if (compatLevel === "부분 호환") {
        let reasons = [];
        let baseMessage = "Yafit에 연결과 플레이가 가능합니다.";
        
        if (uniqueCodes.includes('기어')) {
            if (!results.dataFields?.resistance?.detected) {
                reasons.push("gear 값이 default로 계산됩니다");
            } else {
                reasons.push("유저가 기어 변경을 할 수 없습니다");
            }
        }
        if (uniqueCodes.includes('ERG')) {
            reasons.push("ERG 모드는 플레이 하실 수 없습니다");
        }
        if (uniqueCodes.includes('SIM')) {
            reasons.push("SIM 모드는 플레이 하실 수 없습니다");
        }
        
        if (reasons.length > 0) {
            resultMessage = baseMessage + " " + reasons.join(", ") + ".";
        } else {
            resultMessage = baseMessage;
        }
    } else if (compatLevel === "수정 필요") {
        let baseMessage = "Yafit에 연결과 플레이가 가능합니다.";
        let issues = [];
        
        if (uniqueCodes.includes('자동변화')) {
            issues.push("기어 수정이 필요합니다. 유저가 의도치 않은 저항을 느낄 수 있습니다");
        }
        
        // Add any partial compatibility issues
        if (uniqueCodes.includes('기어')) {
            if (!results.dataFields?.resistance?.detected) {
                issues.push("gear 값이 default로 계산됩니다");
            } else {
                issues.push("유저가 기어 변경을 할 수 없습니다");
            }
        }
        if (uniqueCodes.includes('ERG')) {
            issues.push("ERG 모드는 플레이 하실 수 없습니다");
        }
        if (uniqueCodes.includes('SIM')) {
            issues.push("SIM 모드는 플레이 하실 수 없습니다");
        }
        
        if (issues.length > 0) {
            resultMessage = baseMessage + " 하지만 " + issues.join(", ") + ".";
        } else {
            resultMessage = baseMessage;
        }
    } else if (compatLevel === "완전 호환") {
        resultMessage = "Yafit에 연결과 모든 모드 플레이가 가능합니다.";
    }
    
    if (resultMessage) {
        detailedReasons.push(resultMessage);
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
    if (!info) return `${type}: 정보 없음`;
    
    switch(type) {
        case 'speed':
            return `속도: ${(info.min / 100).toFixed(1)} - ${(info.max / 100).toFixed(1)} km/h (증분: ${(info.increment / 100).toFixed(2)})`;
        case 'incline':
            return `경사도: ${(info.min / 10).toFixed(1)} - ${(info.max / 10).toFixed(1)} % (증분: ${(info.increment / 10).toFixed(1)})`;
        case 'resistance':
            return `저항: ${info.min} - ${info.max} (증분: ${info.increment})`;
        case 'power':
            return `파워: ${info.min} - ${info.max} W (증분: ${info.increment})`;
        default:
            return `${type}: ${info.min} - ${info.max} (증분: ${info.increment})`;
    }
}
