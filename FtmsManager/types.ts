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
    // CPS Specific
    pedalPowerBalance?: number; // percent (1/2)
    accumulatedTorque?: number; // Nm (1/32)
    cumulativeWheelRevolutions?: number;
    lastWheelEventTime?: number; // 1/1024s
    cumulativeCrankRevolutions?: number;
    lastCrankEventTime?: number; // 1/1024s
    maxForceMagnitude?: number; // N
    minForceMagnitude?: number; // N
    maxTorqueMagnitude?: number; // Nm
    minTorqueMagnitude?: number; // Nm
    maxAngle?: number; // degree
    minAngle?: number; // degree
    topDeadSpotAngle?: number; // degree
    bottomDeadSpotAngle?: number; // degree
    accumulatedEnergy?: number; // kJ
} 