// FTMSManager/types.ts

export interface IndoorBikeData {
    instantaneousSpeed?: number;
    averageSpeed?: number;
    instantaneousCadence?: number;
    averageCadence?: number;
    totalDistance?: number;
    resistanceLevel?: number;
    instantaneousPower?: number;
    averagePower?: number;
    expendedEnergy?: number;
    heartRate?: number;
    metabolicEquivalent?: number;
    elapsedTime?: number;
    remainingTime?: number;
    raw?: string;
    flags?: number;
    // Mobi specific fields
    gearLevel?: number;
    batteryLevel?: number;
    // Tacx Specific
    accumulatedPower?: number;
} 