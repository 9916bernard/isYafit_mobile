export interface LogEntry {
    timestamp: string;
    message: string;
    type: 'info' | 'error' | 'success' | 'warning';
}

export class LogManager {
    private logs: LogEntry[] = [];
    private logCallback: ((logs: LogEntry[]) => void) | null = null;

    constructor() {
        this.clearLogs();
    }

    setLogCallback(callback: (logs: LogEntry[]) => void): void {
        this.logCallback = callback;
    }

    getLogs(): LogEntry[] {
        return [...this.logs];
    }

    clearLogs(): void {
        this.logs = [];
        if (this.logCallback) {
            this.logCallback([]);
        }
    }

    private addLog(message: string, type: 'info' | 'error' | 'success' | 'warning'): void {
        const timestamp = new Date().toISOString();
        const log: LogEntry = { timestamp, message, type };
        this.logs.push(log);
        console.log(`[${type.toUpperCase()}] ${message}`);
        if (this.logCallback) {
            this.logCallback([...this.logs]);
        }
    }

    logInfo(message: string): void {
        this.addLog(message, 'info');
    }

    logError(message: string): void {
        this.addLog(message, 'error');
    }

    logSuccess(message: string): void {
        this.addLog(message, 'success');
    }

    logWarning(message: string): void {
        this.addLog(message, 'warning');
    }
} 