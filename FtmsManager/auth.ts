export function generateRandomBytes(length: number): Buffer {
    const bytes = Buffer.alloc(length);
    for (let i = 0; i < length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes;
}

export function calculateChecksum(buffer: Buffer): number {
    let sum = 0;
    for (let i = 0; i < buffer.length - 1; i++) {
        sum += buffer[i];
    }
    return sum & 0xFF;
} 