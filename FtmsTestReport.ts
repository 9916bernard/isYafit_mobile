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
    compatibilityLevel?: "완전 호환" | "제한적 호환" | "수정 필요" | "불가능";
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

// New function to verify control test success based on logs
export function verifyControlTestSuccessFromLogs(results: TestResults): TestResults {
    const updatedResults = { ...results };
    if (!updatedResults.controlTests) {
        return updatedResults;
    }

    // Define which control test keys should be verified against logs.
    // Add other relevant command keys here if needed (e.g., "SET_SIM_PARAMS" if it affects a logged value).
    const controlTestKeysToVerify = ["SET_RESISTANCE_LEVEL", "SET_TARGET_POWER", "SET_SIM_PARAMS"]; 

    for (const testKey of controlTestKeysToVerify) {
        const test = updatedResults.controlTests[testKey];

        // Only verify if the test was initially reported as "OK" (i.e., success code received)
        if (test && test.status === "OK") {
            let actualChangeObserved = false;
            if (updatedResults.resistanceChanges && updatedResults.resistanceChanges.length > 0) {
                for (const change of updatedResults.resistanceChanges) {
                    // Check if the log entry's command matches the testKey 
                    // and if an actual change in value occurred.
                    if (change.command === testKey && change.oldValue !== undefined && change.newValue !== change.oldValue) {
                        actualChangeObserved = true;
                        break; // Found evidence of successful commanded change
                    }
                }
            }

            if (!actualChangeObserved) {
                // If no corresponding change was found in the logs, downgrade the status.
                test.status = "Failed"; 
                const failureDetail = "Log verification failed: No actual value change observed for command despite initial success code.";
                test.details = (test.details ? test.details + "; " : "") + failureDetail;
                
                const reason = `저항 변경 명령(${testKey})은 성공 응답을 받았으나, 실제 저항값 변경이 로그에서 확인되지 않았습니다.`;
                
                if (!updatedResults.reasons) {
                    updatedResults.reasons = [];
                }
                if (!updatedResults.reasons.includes(reason)) {
                    updatedResults.reasons.push(reason);
                }

                if (!updatedResults.issuesFound) {
                    updatedResults.issuesFound = [];
                }
                if (!updatedResults.issuesFound.includes(reason)) {
                    updatedResults.issuesFound.push(reason);
                }
            }
        }
    }
    return updatedResults;
}

// Function to generate a compatibility rating based on test results
export function determineCompatibility(results: TestResults): TestResults {
    const updatedResults = { ...results };
    
    // Default compatibility level
    let compatLevel: "완전 호환" | "제한적 호환" | "수정 필요" | "불가능" = "불가능";
    
    // Not connected
    if (!results.connection.status) {
        compatLevel = "불가능";
        if (!updatedResults.reasons.includes("기기에 연결할 수 없습니다.")) {
            updatedResults.reasons.push("기기에 연결할 수 없습니다.");
        }
        updatedResults.compatibilityLevel = compatLevel;
        return updatedResults;
    }
    
    // Check protocol support
    const hasFTMS = results.supportedProtocols.includes("FTMS");
    const hasCSC = results.supportedProtocols.includes("CSC");
    
    if (!hasFTMS && !hasCSC) {
        compatLevel = "불가능";
        if (!updatedResults.reasons.includes("지원되는 프로토콜(FTMS, CSC)을 찾을 수 없습니다.")) {
            updatedResults.reasons.push("지원되는 프로토콜(FTMS, CSC)을 찾을 수 없습니다.");
        }
        updatedResults.compatibilityLevel = compatLevel;
        return updatedResults;
    }
    
    // CSC only - limited compatibility
    if (!hasFTMS && hasCSC) {
        compatLevel = "제한적 호환";
        if (!updatedResults.reasons.includes("CSC 프로토콜로 속도/캐던스 데이터만 사용 가능합니다. 저항 제어는 지원하지 않습니다.")) {
            updatedResults.reasons.push("CSC 프로토콜로 속도/캐던스 데이터만 사용 가능합니다. 저항 제어는 지원하지 않습니다.");
        }
        updatedResults.compatibilityLevel = compatLevel;
        return updatedResults;
    }
    
    // FTMS - Check for required data fields and control support
    if (hasFTMS) {
        // Check for data field detection
        const hasSpeed = results.dataFields?.speed?.detected;
        const hasCadence = results.dataFields?.cadence?.detected;
        const hasPower = results.dataFields?.power?.detected;
        const hasResistance = results.dataFields?.resistance?.detected;
        
        // Check for control test success
        const controlTests = results.controlTests || {};
        const resistanceControlOk = controlTests["SET_RESISTANCE_LEVEL"]?.status === "OK";
        const simParamsOk = controlTests["SET_SIM_PARAMS"]?.status === "OK";
        
        if ((hasSpeed && hasPower) && (resistanceControlOk || simParamsOk)) {
            compatLevel = "완전 호환";
            // Check for any issues that might reduce compatibility
            if (results.issuesFound && results.issuesFound.length > 0) {
                compatLevel = "제한적 호환";
                if (!updatedResults.reasons.includes("일부 테스트에서 문제가 발견되었습니다. 기본 기능은 작동하지만 일부 기능에 제한이 있을 수 있습니다.")) {
                    updatedResults.reasons.push("일부 테스트에서 문제가 발견되었습니다. 기본 기능은 작동하지만 일부 기능에 제한이 있을 수 있습니다.");
                }
            }
        } else if (hasSpeed && !resistanceControlOk && !simParamsOk) {
            compatLevel = "수정 필요";
            if (!updatedResults.reasons.includes("속도 데이터는 수신되지만 저항 제어 기능이 작동하지 않습니다. 펌웨어 업데이트나 추가 개발이 필요할 수 있습니다.")) {
                updatedResults.reasons.push("속도 데이터는 수신되지만 저항 제어 기능이 작동하지 않습니다. 펌웨어 업데이트나 추가 개발이 필요할 수 있습니다.");
            }
        } else {
            compatLevel = "제한적 호환";
            if (!updatedResults.reasons.includes("FTMS 프로토콜을 지원하지만 일부 필요한 데이터나 제어 기능이 작동하지 않습니다.")) {
                updatedResults.reasons.push("FTMS 프로토콜을 지원하지만 일부 필요한 데이터나 제어 기능이 작동하지 않습니다.");
            }
        }
    }
    
    updatedResults.compatibilityLevel = compatLevel;
    return updatedResults;
}

// Function to finalize and save the test report
export function finalizeTestReport(results: TestResults): TestResults {
    let processedResults = { ...results };

    // New step: Verify control test success using logs before determining compatibility
    processedResults = verifyControlTestSuccessFromLogs(processedResults);

    const finalResults = determineCompatibility({
        ...processedResults, // Use the processed results with potentially updated controlTest statuses
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
