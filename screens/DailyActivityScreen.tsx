// screens/DailyActivityScreen.tsx
// Phase 2 Week 3: Daily Activity Games Router

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GridSquare } from '../utils/GridUtils';
import RockConveyorActivity from './activities/RockConveyorActivity';
import CoalPileActivity from './activities/CoalPileActivity';
import SluiceBoxActivity from './activities/SluiceBoxActivity';
import SlotMachineActivity from './activities/SlotMachineActivity';

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

  // Route to the correct activity based on mine type
  const renderActivity = () => {
    switch (property.mineType) {
      case 'rock':
        return (
          <RockConveyorActivity
            property={property}
            propertyDetails={propertyDetails}
            navigation={navigation}
          />
        );
      case 'coal':
        return (
          <CoalPileActivity
            property={property}
            propertyDetails={propertyDetails}
            navigation={navigation}
          />
        );
      case 'gold':
        return (
          <SluiceBoxActivity
            property={property}
            propertyDetails={propertyDetails}
            navigation={navigation}
          />
        );
      case 'diamond':
        return (
          <SlotMachineActivity
            property={property}
            propertyDetails={propertyDetails}
            navigation={navigation}
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
