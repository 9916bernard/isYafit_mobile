import { Device, Characteristic } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { LogManager } from './LogManager';
import { REBORN_SERVICE_UUID, REBORN_WRITE_CHAR_UUID } from './constants';
import { generateRandomBytes, calculateChecksum } from './auth';

export class RebornAuthManager {
    private logManager: LogManager;
    private rebornAuthBytes: Buffer | null = null;
    private rebornAuthCompleted: boolean = false;

    constructor(logManager: LogManager) {
        this.logManager = logManager;
    }

    isAuthCompleted(): boolean {
        return this.rebornAuthCompleted;
    }

    async performRebornAuthentication(device: Device): Promise<void> {
        this.logManager.logInfo("Performing Reborn authentication...");
        const authRequest = Buffer.alloc(15);
        authRequest[0] = 0xAA;
        authRequest[1] = 0x0F;
        authRequest[2] = 0x8A;
        authRequest[3] = 0x03;
        const randomBytes = generateRandomBytes(10);
        randomBytes.copy(authRequest, 4);
        authRequest[14] = calculateChecksum(authRequest);
        this.rebornAuthBytes = Buffer.from(authRequest);
        
        try {
            await device.writeCharacteristicWithoutResponseForService(
                REBORN_SERVICE_UUID,
                REBORN_WRITE_CHAR_UUID,
                authRequest.toString('base64')
            );
            this.logManager.logInfo("Reborn authentication request sent");
        } catch (error) {
            this.logManager.logError(`Reborn authentication failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    handleRebornAuthResponse(data: Buffer, device: Device): void {
        if (!this.rebornAuthBytes) {
            this.logManager.logError("No authentication request stored for verification");
            return;
        }
        
        this.logManager.logInfo("Received Reborn authentication response");
        const key = Buffer.from([0x15, 0x25, 0x80, 0x13, 0xF0]);
        const expectedResponse = Buffer.alloc(5);
        expectedResponse[0] = (this.rebornAuthBytes[4] + this.rebornAuthBytes[9] + key[0]) & 0xFF;
        expectedResponse[1] = (this.rebornAuthBytes[5] + this.rebornAuthBytes[10] + key[1]) & 0xFF;
        expectedResponse[2] = (this.rebornAuthBytes[6] + this.rebornAuthBytes[11] + key[2]) & 0xFF;
        expectedResponse[3] = (this.rebornAuthBytes[7] + this.rebornAuthBytes[12] + key[3]) & 0xFF;
        expectedResponse[4] = (this.rebornAuthBytes[8] + this.rebornAuthBytes[13] + key[4]) & 0xFF;
        
        if (data.length >= 9 && 
            data[4] === expectedResponse[0] && 
            data[5] === expectedResponse[1] && 
            data[6] === expectedResponse[2] && 
            data[7] === expectedResponse[3] && 
            data[8] === expectedResponse[4]) {
            this.logManager.logSuccess("Reborn authentication successful");
            this.rebornAuthCompleted = true;
            this.sendRebornAuthSuccess(device);
        } else {
            this.logManager.logError("Reborn authentication failed - invalid response");
            this.sendRebornAuthFailure(device);
        }
    }

    private async sendRebornAuthSuccess(device: Device): Promise<void> {
        const successData = Buffer.from([0xAA, 0x06, 0x80, 0xE1, 0x00, 0x11]);
        try {
            await device.writeCharacteristicWithoutResponseForService(
                REBORN_SERVICE_UUID,
                REBORN_WRITE_CHAR_UUID,
                successData.toString('base64')
            );
            this.logManager.logInfo("Reborn authentication success response sent");
        } catch (error) {
            this.logManager.logError(`Failed to send Reborn auth success: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async sendRebornAuthFailure(device: Device): Promise<void> {
        const failData = Buffer.from([0xAA, 0x06, 0x80, 0xE1, 0x01, 0x12]);
        try {
            await device.writeCharacteristicWithoutResponseForService(
                REBORN_SERVICE_UUID,
                REBORN_WRITE_CHAR_UUID,
                failData.toString('base64')
            );
            this.logManager.logInfo("Reborn authentication failure response sent");
        } catch (error) {
            this.logManager.logError(`Failed to send Reborn auth failure: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    resetAuthState(): void {
        this.rebornAuthBytes = null;
        this.rebornAuthCompleted = false;
    }
} 