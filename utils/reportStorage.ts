import AsyncStorage from '@react-native-async-storage/async-storage';
import { TestResults } from '../FtmsTestReport';

export interface SavedReport {
  id: string;
  timestamp: number;
  deviceName: string;
  deviceAddress: string;
  compatibilityLevel: string;
  results: TestResults;
}

const REPORTS_STORAGE_KEY = 'isyafit_saved_reports';
const MAX_REPORTS = 50; // 최대 저장할 보고서 수

export class ReportStorage {
  // 보고서 저장
  static async saveReport(results: TestResults): Promise<string> {
    try {
      const existingReports = await this.getReports();
      
      const newReport: SavedReport = {
        id: results.reportId || `report_${Date.now()}`,
        timestamp: results.testCompletedTimestamp || Date.now(),
        deviceName: results.deviceInfo.name || 'Unknown Device',
        deviceAddress: results.deviceInfo.address || 'Unknown Address',
        compatibilityLevel: results.compatibilityLevel || 'Unknown',
        results: results,
      };

      // 기존 보고서가 있으면 업데이트, 없으면 새로 추가
      const existingIndex = existingReports.findIndex(report => report.id === newReport.id);
      if (existingIndex >= 0) {
        existingReports[existingIndex] = newReport;
      } else {
        existingReports.unshift(newReport); // 최신 보고서를 맨 앞에 추가
      }

      // 최대 개수 제한
      if (existingReports.length > MAX_REPORTS) {
        existingReports.splice(MAX_REPORTS);
      }

      await AsyncStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(existingReports));
      return newReport.id;
    } catch (error) {
      console.error('Error saving report:', error);
      throw error;
    }
  }

  // 모든 보고서 가져오기
  static async getReports(): Promise<SavedReport[]> {
    try {
      const reportsJson = await AsyncStorage.getItem(REPORTS_STORAGE_KEY);
      if (reportsJson) {
        return JSON.parse(reportsJson);
      }
      return [];
    } catch (error) {
      console.error('Error getting reports:', error);
      return [];
    }
  }

  // 특정 보고서 가져오기
  static async getReport(id: string): Promise<SavedReport | null> {
    try {
      const reports = await this.getReports();
      return reports.find(report => report.id === id) || null;
    } catch (error) {
      console.error('Error getting report:', error);
      return null;
    }
  }

  // 보고서 삭제
  static async deleteReport(id: string): Promise<boolean> {
    try {
      const reports = await this.getReports();
      const filteredReports = reports.filter(report => report.id !== id);
      await AsyncStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(filteredReports));
      return true;
    } catch (error) {
      console.error('Error deleting report:', error);
      return false;
    }
  }

  // 모든 보고서 삭제
  static async clearAllReports(): Promise<boolean> {
    try {
      await AsyncStorage.removeItem(REPORTS_STORAGE_KEY);
      return true;
    } catch (error) {
      console.error('Error clearing all reports:', error);
      return false;
    }
  }

  // 보고서 개수 가져오기
  static async getReportCount(): Promise<number> {
    try {
      const reports = await this.getReports();
      return reports.length;
    } catch (error) {
      console.error('Error getting report count:', error);
      return 0;
    }
  }

  // 최근 보고서 가져오기 (최신 N개)
  static async getRecentReports(limit: number = 10): Promise<SavedReport[]> {
    try {
      const reports = await this.getReports();
      return reports.slice(0, limit);
    } catch (error) {
      console.error('Error getting recent reports:', error);
      return [];
    }
  }
} 