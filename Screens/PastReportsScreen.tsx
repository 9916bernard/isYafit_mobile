import React, { useState, useEffect, useRef } from 'react';
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
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SavedReport, ReportStorage } from '../utils/reportStorage';
import { Colors, useSafeAreaStyles } from '../styles/commonStyles';
import TestReportScreen from './TestReportScreen';
import { useTranslation } from 'react-i18next';
import { useCompatibilityUtils } from '../utils/compatibilityUtils';

interface PastReportsScreenProps {
  onBack: () => void;
}

const PastReportsScreen: React.FC<PastReportsScreenProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const { translateCompatibilityLevel, getCompatibilityColorForPastReports } = useCompatibilityUtils();
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedReport, setSelectedReport] = useState<SavedReport | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const safeAreaStyles = useSafeAreaStyles();
  const toolbarAnim = useRef(new Animated.Value(0)).current;
  const checkboxAnimMap = useRef<{ [id: string]: Animated.Value }>({}).current;

  useEffect(() => {
    Animated.timing(toolbarAnim, {
      toValue: isSelectionMode ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isSelectionMode]);

  useEffect(() => {
    if (isSelectionMode) {
      reports.forEach((report) => {
        if (!checkboxAnimMap[report.id]) {
          checkboxAnimMap[report.id] = new Animated.Value(0);
        }
        Animated.timing(checkboxAnimMap[report.id], {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }).start();
      });
    } else {
      reports.forEach((report) => {
        if (checkboxAnimMap[report.id]) {
          Animated.timing(checkboxAnimMap[report.id], {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start();
        }
      });
    }
  }, [isSelectionMode, reports]);

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
      t('pastReports.confirmDelete'),
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
                Alert.alert(t('common.success'), t('pastReports.deleteSuccess'));
              } else {
                Alert.alert(t('common.error'), t('pastReports.deleteError'));
              }
            } catch (error) {
              console.error('Failed to delete report:', error);
            }
          },
        },
      ]
    );
  };

  const handleDeleteMultipleReports = async () => {
    if (selectedItems.size === 0) {
      Alert.alert(t('common.error'), t('pastReports.noItemsSelected'));
      return;
    }

    Alert.alert(
      t('common.confirm'),
      t('pastReports.confirmDeleteMultiple', { count: selectedItems.size }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              const selectedIds = Array.from(selectedItems);
              let successCount = 0;
              
              for (const reportId of selectedIds) {
                const success = await ReportStorage.deleteReport(reportId);
                if (success) {
                  successCount++;
                }
              }

              if (successCount > 0) {
                setReports(prev => prev.filter(report => !selectedItems.has(report.id)));
                Alert.alert(
                  t('common.success'), 
                  t('pastReports.deleteMultipleSuccess', { count: successCount })
                );
              } else {
                Alert.alert(t('common.error'), t('pastReports.deleteError'));
              }
              
              // 선택 모드 종료
              exitSelectionMode();
            } catch (error) {
              console.error('Failed to delete reports:', error);
              Alert.alert(t('common.error'), t('pastReports.deleteError'));
            }
          },
        },
      ]
    );
  };

  const enterSelectionMode = () => {
    setIsSelectionMode(true);
    setSelectedItems(new Set());
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedItems(new Set());
  };

  const toggleItemSelection = (reportId: string) => {
    const newSelectedItems = new Set(selectedItems);
    if (newSelectedItems.has(reportId)) {
      newSelectedItems.delete(reportId);
    } else {
      newSelectedItems.add(reportId);
    }
    setSelectedItems(newSelectedItems);
  };

  const selectAll = () => {
    const allIds = reports.map(report => report.id);
    setSelectedItems(new Set(allIds));
  };

  const deselectAll = () => {
    setSelectedItems(new Set());
  };

  const handleShareReport = async (report: SavedReport) => {
    try {
      const reportText = `${t('testReport.share.title')}\n${t('testReport.share.deviceName')} ${report.deviceName}\n${t('testReport.share.mainProtocol')} ${report.results.deviceInfo.protocol || t('common.unknown')}\n${t('testReport.share.testDateTime')} ${new Date(report.timestamp).toLocaleString()}`;
      
      await Share.share({
        message: reportText,
        title: t('testReport.title'),
      });
    } catch (error) {
      console.error('Failed to share report:', error);
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
      style={[
        styles.reportCard,
        isSelectionMode && selectedItems.has(item.id) && styles.selectedCard
      ]}
      onPress={() => {
        if (isSelectionMode) {
          toggleItemSelection(item.id);
        } else {
          setSelectedReport(item);
        }
      }}
      onLongPress={() => {
        if (!isSelectionMode) {
          enterSelectionMode();
          toggleItemSelection(item.id);
        }
      }}
      activeOpacity={0.7}
    >
      {isSelectionMode && (
        <Animated.View
          style={{
            ...styles.selectionIndicator,
            opacity: checkboxAnimMap[item.id] || 0,
            transform: [
              {
                scale: (checkboxAnimMap[item.id] || new Animated.Value(0)).interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.7, 1],
                }),
              },
            ],
          }}
        >
          <Icon
            name={selectedItems.has(item.id) ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"}
            size={24}
            color={selectedItems.has(item.id) ? Colors.primary : Colors.textSecondary}
          />
        </Animated.View>
      )}
      
      <View style={styles.reportHeader}>
        <View style={styles.deviceInfo}>
          <Icon name="bluetooth" size={20} color={Colors.primary} />
          <Text style={styles.deviceName} numberOfLines={1}>
            {item.deviceName}
          </Text>
        </View>
        {!isSelectionMode && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeleteReport(item.id)}
          >
            <Icon name="delete-outline" size={20} color={Colors.error} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.reportDetails}>
        <View style={styles.compatibilityContainer}>
          <View
            style={[
              styles.compatibilityBadge,
              { backgroundColor: getCompatibilityColorForPastReports(item.compatibilityLevel) + '20' },
            ]}
          >
            <Text
              style={[
                styles.compatibilityText,
                { color: getCompatibilityColorForPastReports(item.compatibilityLevel) },
              ]}
            >
              {translateCompatibilityLevel(item.compatibilityLevel)}
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
        {t('pastReports.emptyStateDescription')}
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
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.title}>
              {isSelectionMode ? t('pastReports.selectMode') : t('pastReports.title')}
            </Text>
            {isSelectionMode ? (
              <Text style={styles.selectedCount}>
                {t('pastReports.selectedCount', { count: selectedItems.size })}
              </Text>
            ) : (
              <Text style={styles.languageNote}>{t('pastReports.languageNote')}</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            {!isSelectionMode && reports.length > 0 && (
              <TouchableOpacity style={styles.selectButton} onPress={enterSelectionMode}>
                <Icon name="checkbox-multiple-blank-outline" size={24} color={Colors.primary} />
              </TouchableOpacity>
            )}
            {isSelectionMode && (
              <TouchableOpacity style={styles.selectButton} onPress={exitSelectionMode}>
                <Icon name="close" size={24} color={Colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Animated.View
          style={[
            styles.selectionToolbar,
            {
              transform: [
                {
                  translateY: toolbarAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [40, 0],
                  }),
                },
              ],
              opacity: toolbarAnim,
            },
          ]}
          pointerEvents={isSelectionMode ? 'auto' : 'none'}
        >
          {isSelectionMode ? (
            <>
              <View style={styles.selectionRow}>
                <TouchableOpacity style={styles.toolbarButton} onPress={selectAll}>
                  <Icon name="select-all" size={18} color={Colors.primary} />
                  <Text style={styles.toolbarButtonText}>{t('pastReports.selectAll')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.toolbarButton} onPress={deselectAll}>
                  <Icon name="select-off" size={18} color={Colors.primary} />
                  <Text style={styles.toolbarButtonText}>{t('pastReports.deselectAll')}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.selectionRow}>
                <TouchableOpacity
                  style={[styles.toolbarButton, selectedItems.size === 0 && styles.disabledButton]}
                  onPress={handleDeleteMultipleReports}
                  disabled={selectedItems.size === 0}
                >
                  <Icon name="delete" size={18} color={selectedItems.size === 0 ? Colors.textSecondary : Colors.error} />
                  <Text style={[styles.toolbarButtonText, selectedItems.size === 0 && styles.disabledText]}>
                    {t('pastReports.deleteSelected')}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </Animated.View>

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
  languageNote: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
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
  selectedCard: {
    borderColor: Colors.primary,
    borderWidth: 2,
    backgroundColor: Colors.primary + '10',
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
  selectionIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
  },
  selectionToolbar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  selectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  toolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.secondary,
    minWidth: 80,
    justifyContent: 'center',
  },
  toolbarButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    marginLeft: 4,
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledText: {
    color: Colors.textSecondary,
  },
  selectedCount: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  selectButton: {
    padding: 8,
    borderRadius: 16,
    backgroundColor: Colors.secondary,
  },
  headerRight: {
    width: 48,
    alignItems: 'flex-end',
  },
});

export default PastReportsScreen; 