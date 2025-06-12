// AppLogButton.tsx - Log Button Component for App.tsx
import React, { useState, useEffect } from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { LogEntry } from './FtmsManager';
import LogDisplay from './LogDisplay';

interface AppLogButtonProps {
  logs: LogEntry[];
}

const AppLogButton: React.FC<AppLogButtonProps> = ({ logs }) => {
  const [showLogs, setShowLogs] = useState(false);
  const [formattedLogs, setFormattedLogs] = useState<string[]>([]);

  useEffect(() => {
    // Format logs for display
    const formatted = logs.map(log => 
      `${new Date(log.timestamp).toLocaleTimeString()} - ${log.message}`
    );
    setFormattedLogs(formatted);
  }, [logs]);

  const toggleLogs = () => {
    setShowLogs(!showLogs);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.logButton}
        onPress={toggleLogs}
      >
        <Icon name="text-box-outline" size={18} color="#fff" />
        <Text style={styles.logButtonText}>로그</Text>
        {logs.length > 0 && (
          <View style={styles.logBadge}>
            <Text style={styles.logBadgeText}>{logs.length}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Log Display */}
      <LogDisplay 
        logs={formattedLogs}
        visible={showLogs}
        onClose={toggleLogs}
      />
    </>
  );
};

const styles = StyleSheet.create({
  logButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2d3748',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginVertical: 8,
  },
  logButtonText: {
    color: '#fff',
    marginLeft: 6,
    fontSize: 14,
  },
  logBadge: {
    backgroundColor: '#00c663',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  logBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});

export default AppLogButton;
