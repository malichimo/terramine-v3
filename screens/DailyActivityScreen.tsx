// screens/DailyActivityScreen.tsx
// Phase 2 Week 3: Daily Activity Games Router

import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { GridSquare } from '../utils/GridUtils';
import RockConveyorActivity from './activities/RockConveyorActivity';
import CoalPileActivity from './activities/CoalPileActivity';
import SluiceBoxActivity from './activities/SluiceBoxActivity';
import SlotMachineActivity from './activities/SlotMachineActivity';
import { DatabaseService } from '../services/DatabaseService';
import { useAuth } from '../contexts/AuthContext';

const dbService = new DatabaseService();

interface DailyActivityScreenProps {
  route: {
    params: {
      property: GridSquare;
      propertyDetails: any;
    };
  };
  navigation: any;
}

export default function DailyActivityScreen({ route, navigation }: any) {
  const { property, propertyDetails } = route.params;
  const { user } = useAuth();

  // ✅ FEAT-001: Trigger #5 — fires once after any daily activity completes
  const handleActivityComplete = useCallback(async () => {
    if (!user) return;
    try {
      const isFirst = await dbService.checkAndFireMilestone(user.uid, 'milestone_firstDailyActivity');
      if (isFirst) {
        Alert.alert(
          '⛏️ Daily Miner!',
          'You completed your first daily mining activity! Come back every day to collect resources and earn TB bonuses. Activities reset at 4 AM EST.',
          [{ text: 'Keep Mining! 💪' }]
        );
      }
    } catch {
      // Non-fatal
    }
  }, [user]);

  // Route to the correct activity based on mine type
  const renderActivity = () => {
    switch (property.mineType) {
      case 'rock':
        return (
          <RockConveyorActivity
            property={property}
            propertyDetails={propertyDetails}
            navigation={navigation}
            onActivityComplete={handleActivityComplete}
          />
        );
      case 'coal':
        return (
          <CoalPileActivity
            property={property}
            propertyDetails={propertyDetails}
            navigation={navigation}
            onActivityComplete={handleActivityComplete}
          />
        );
      case 'gold':
        return (
          <SluiceBoxActivity
            property={property}
            propertyDetails={propertyDetails}
            navigation={navigation}
            onActivityComplete={handleActivityComplete}
          />
        );
      case 'diamond':
        return (
          <SlotMachineActivity
            property={property}
            propertyDetails={propertyDetails}
            navigation={navigation}
            onActivityComplete={handleActivityComplete}
          />
        );
      default:
        return (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Unknown mine type</Text>
          </View>
        );
    }
  };

  return <View style={styles.container}>{renderActivity()}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e8d5b7',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 18,
    color: '#f44336',
  },
});
