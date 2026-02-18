// Temporary Migration Screen
// Add this to your app temporarily to run the Phase 2 migration
// Remove it after migration is complete

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { 
  checkMigrationStatus, 
  runAllMigrations, 
  migrateUsersToPhase2, 
  migratePropertiesToPhase2,
  migratePropertiesToAdTracking
} from '../utils/MigrationUtils';
import { resetBoostData } from '../utils/BoostTimerFix';
import { useAuth } from '../contexts/AuthContext';

export default function MigrationScreen() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const { user } = useAuth();

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const handleCheckStatus = async () => {
    setLoading(true);
    addLog('Checking migration status...');
    
    try {
      const result = await checkMigrationStatus();
      setStatus(result);
      addLog('Status check complete');
    } catch (error: any) {
      addLog(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMigrateUsers = async () => {
    setLoading(true);
    addLog('Starting user migration...');
    
    try {
      await migrateUsersToPhase2();
      addLog('✅ User migration complete!');
      await handleCheckStatus(); // Refresh status
    } catch (error: any) {
      addLog(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMigrateProperties = async () => {
    setLoading(true);
    addLog('Starting property migration...');
    
    try {
      await migratePropertiesToPhase2();
      addLog('✅ Property migration complete!');
      await handleCheckStatus(); // Refresh status
    } catch (error: any) {
      addLog(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRunAll = async () => {
    setLoading(true);
    addLog('Starting full migration...');
    
    try {
      await runAllMigrations();
      addLog('✅ All migrations complete!');
      await handleCheckStatus(); // Refresh status
    } catch (error: any) {
      addLog(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResetBoosts = async () => {
    if (!user) {
      addLog('❌ No user logged in');
      return;
    }

    setLoading(true);
    addLog('Resetting boost data...');
    
    try {
      await resetBoostData(user.uid);
      addLog('✅ Boost data reset! You now have 4 free boosts.');
      addLog('⚠️ Reload the app to see changes');
    } catch (error: any) {
      addLog(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMigrateAdTracking = async () => {
    setLoading(true);
    addLog('Starting ad tracking migration...');
    
    try {
      await migratePropertiesToAdTracking();
      addLog('✅ Ad tracking migration complete!');
      await handleCheckStatus(); // Refresh status
    } catch (error: any) {
      addLog(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Phase 2 Migration</Text>
        <Text style={styles.subtitle}>Run once to update Firebase</Text>
      </View>

      {status && (
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Current Status</Text>
          <Text style={styles.statusText}>
            Users: {status.usersMigrated}/{status.usersTotal} migrated
          </Text>
          <Text style={styles.statusText}>
            Properties: {status.propertiesMigrated}/{status.propertiesTotal} migrated
          </Text>
          {status.usersMigrated === status.usersTotal && 
           status.propertiesMigrated === status.propertiesTotal && (
            <Text style={styles.successText}>✅ All data migrated!</Text>
          )}
        </View>
      )}

      <View style={styles.buttonsContainer}>
        <TouchableOpacity 
          style={[styles.button, styles.checkButton]}
          onPress={handleCheckStatus}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Check Status</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.migrateButton]}
          onPress={handleMigrateUsers}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Migrate Users</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.migrateButton]}
          onPress={handleMigrateProperties}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Migrate Properties</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.runAllButton]}
          onPress={handleRunAll}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Run All Migrations</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.boostResetButton]}
          onPress={handleResetBoosts}
          disabled={loading}
        >
          <Text style={styles.buttonText}>🔄 Reset Boost Timer</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.adTrackingButton]}
          onPress={handleMigrateAdTracking}
          disabled={loading}
        >
          <Text style={styles.buttonText}>📊 Migrate Ad Tracking</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Processing...</Text>
        </View>
      )}

      <View style={styles.logsContainer}>
        <Text style={styles.logsTitle}>Logs</Text>
        <ScrollView style={styles.logsScroll}>
          {logs.map((log, index) => (
            <Text key={index} style={styles.logText}>{log}</Text>
          ))}
        </ScrollView>
      </View>

      <View style={styles.warningContainer}>
        <Text style={styles.warningText}>
          ⚠️ After migration is complete, remove this screen from your app
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  header: {
    marginTop: 40,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 5,
  },
  statusCard: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  statusText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  successText: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: 'bold',
    marginTop: 10,
  },
  buttonsContainer: {
    gap: 10,
    marginBottom: 20,
  },
  button: {
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  checkButton: {
    backgroundColor: '#2196F3',
  },
  migrateButton: {
    backgroundColor: '#FF9800',
  },
  runAllButton: {
    backgroundColor: '#4CAF50',
  },
  boostResetButton: {
    backgroundColor: '#9C27B0',
  },
  adTrackingButton: {
    backgroundColor: '#00ACC1',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  logsContainer: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
  },
  logsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  logsScroll: {
    flex: 1,
  },
  logText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
    fontFamily: 'monospace',
  },
  warningContainer: {
    backgroundColor: '#FFF3CD',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFC107',
  },
  warningText: {
    fontSize: 14,
    color: '#856404',
    textAlign: 'center',
  },
});
