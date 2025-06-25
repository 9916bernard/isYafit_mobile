import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Share,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SavedReport, ReportStorage } from '../utils/reportStorage';
import { Colors, useSafeAreaStyles } from '../styles/commonStyles';
import TestReportScreen from './TestReportScreen';
import { useTranslation } from 'react-i18next';

interface PastReportsScreenProps {
  onBack: () => void;
}

const PastReportsScreen: React.FC<PastReportsScreenProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedReport, setSelectedReport] = useState<SavedReport | null>(null);
  const safeAreaStyles = useSafeAreaStyles();

  const loadReports = async () => {
    try {
      const savedReports = await ReportStorage.getReports();
      setReports(savedReports);
    } catch (error) {
      console.error('Failed to load reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleDeleteReport = async (reportId: string) => {
    Alert.alert(
      t('common.confirm'),
      '정말로 이 보고서를 삭제하시겠습니까?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await ReportStorage.deleteReport(reportId);
              if (success) {
                setReports(prev => prev.filter(report => report.id !== reportId));
                Alert.alert('완료', '보고서가 삭제되었습니다.');
              } else {
                Alert.alert('오류', '보고서 삭제에 실패했습니다.');
              }
            } catch (error) {
              console.error('Failed to delete report:', error);
            }
          },
        },
      ]
    );
  };

  const handleShareReport = async (report: SavedReport) => {
    try {
      const reportText = `테스트 보고서\n장치: ${report.deviceName}\n프로토콜: ${report.results.deviceInfo.protocol || 'Unknown'}\n완료 시간: ${new Date(report.timestamp).toLocaleString()}`;
      
      await Share.share({
        message: reportText,
        title: t('testReport.title'),
      });
    } catch (error) {
      console.error('Failed to share report:', error);
    }
  };

  const getCompatibilityColor = (level: string): string => {
    switch (level) {
      case '완전 호환':
        return '#00c663';
      case '부분 호환':
        return '#f59e0b';
      case '수정 필요':
        return '#ef4444';
      case '불가능':
        return '#6b7280';
      default:
        return '#9ca3af';
    }
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderReportItem = ({ item }: { item: SavedReport }) => (
    <TouchableOpacity
      style={styles.reportCard}
      onPress={() => setSelectedReport(item)}
      activeOpacity={0.7}
    >
      <View style={styles.reportHeader}>
        <View style={styles.deviceInfo}>
          <Icon name="bluetooth" size={20} color={Colors.primary} />
          <Text style={styles.deviceName} numberOfLines={1}>
            {item.deviceName}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteReport(item.id)}
        >
          <Icon name="delete-outline" size={20} color={Colors.error} />
        </TouchableOpacity>
      </View>

      <View style={styles.reportDetails}>
        <View style={styles.compatibilityContainer}>
          <View
            style={[
              styles.compatibilityBadge,
              { backgroundColor: getCompatibilityColor(item.compatibilityLevel) + '20' },
            ]}
          >
            <Text
              style={[
                styles.compatibilityText,
                { color: getCompatibilityColor(item.compatibilityLevel) },
              ]}
            >
              {item.compatibilityLevel}
            </Text>
          </View>
        </View>

        <Text style={styles.deviceAddress} numberOfLines={1}>
          {item.deviceAddress}
        </Text>

        <Text style={styles.timestamp}>
          {formatDate(item.timestamp)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="file-document-outline" size={64} color={Colors.textSecondary} />
      <Text style={styles.emptyStateTitle}>{t('pastReports.noSavedReports')}</Text>
      <Text style={styles.emptyStateSubtitle}>
        호환성 테스트를 완료하면 여기에 보고서가 저장됩니다
      </Text>
    </View>
  );

  if (selectedReport) {
    return (
      <TestReportScreen
        results={selectedReport.results}
        onClose={() => setSelectedReport(null)}
      />
    );
  }

  return (
    <SafeAreaView style={safeAreaStyles.safeContainerMinPadding}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Icon name="arrow-left" size={24} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('pastReports.title')}</Text>
          <View style={{ width: 24 }} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>{t('pastReports.loadingReports')}</Text>
          </View>
        ) : (
          <FlatList
            data={reports}
            renderItem={renderReportItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[Colors.primary]}
                tintColor={Colors.primary}
              />
            }
            ListEmptyComponent={renderEmptyState}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: Colors.secondary,
    marginRight: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.textSecondary,
  },
  listContainer: {
    padding: 16,
    flexGrow: 1,
  },
  reportCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginLeft: 8,
    flex: 1,
  },
  deleteButton: {
    padding: 4,
    borderRadius: 16,
  },
  reportDetails: {
    gap: 8,
  },
  compatibilityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compatibilityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  compatibilityText: {
    fontSize: 12,
    fontWeight: '600',
  },
  deviceAddress: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: 'monospace',
  },
  timestamp: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 16,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default PastReportsScreen; 