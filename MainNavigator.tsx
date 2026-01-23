import React, { useState, useRef, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import MapScreen from './screens/MapScreen';
import ProfileScreen from './screens/ProfileScreen';
import { GridSquare } from './utils/GridUtils';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './contexts/AuthContext';
import { DatabaseService } from './services/DatabaseService';
import { View, ActivityIndicator } from 'react-native';

const Tab = createBottomTabNavigator();
const dbService = new DatabaseService();

export default function MainNavigator() {
  const { user } = useAuth();
  const [userTB, setUserTB] = useState(1000);
  const [usdEarnings, setUsdEarnings] = useState(0);
  const [ownedProperties, setOwnedProperties] = useState<GridSquare[]>([]);
  const [allProperties, setAllProperties] = useState<GridSquare[]>([]);
  const [totalCheckIns, setTotalCheckIns] = useState(0);
  const [totalTBEarned, setTotalTBEarned] = useState(0);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [boostState, setBoostState] = useState<{
    freeBoostsRemaining: number;
    boostExpiresAt: string | null;
    nextFreeBoostResetAt: string | null;
  } | undefined>(undefined);
  const username = user?.displayName || user?.email?.split('@')[0] || 'User';
  const mapRef = useRef<any>(null);

  // Load data when user logs in
  useEffect(() => {
    if (user) {
      loadUserData();
    }
  }, [user]);

  const loadUserData = async () => {
    if (!user) return;
    
    try {
      // Get or create user data
      let userData = await dbService.getUserData(user.uid);
      if (!userData) {
        await dbService.createUser(user.uid, user.email || '');
        userData = await dbService.getUserData(user.uid);
      }

      // Load user's owned properties
      const properties = await dbService.getPropertiesByOwner(user.uid);
      
      // Load all properties (so you can see other users' properties)
      const allProps = await dbService.getAllProperties();

      setUserTB(userData?.tbBalance || 1000);
      setUsdEarnings(userData?.usdEarnings || 0);
      setOwnedProperties(properties);
      setAllProperties(allProps);
      setTotalCheckIns(userData?.totalCheckIns || 0);
      setTotalTBEarned(userData?.totalTBEarned || 0);
      
      // Store boost state for passing to MapScreen
      const boostState = {
        freeBoostsRemaining: userData?.freeBoostsRemaining ?? 4,
        boostExpiresAt: userData?.boostExpiresAt || null,
        nextFreeBoostResetAt: userData?.nextFreeBoostResetAt || null,
      };
      
      console.log('Loaded from Firestore:', {
        tb: userData?.tbBalance,
        usd: userData?.usdEarnings,
        ownedCount: properties.length,
        allPropertiesCount: allProps.length,
        boostState,
      });

      // Store in state to pass to MapScreen
      setBoostState(boostState);
      setDataLoaded(true);
    } catch (error) {
      console.error('Error loading data:', error);
      setDataLoaded(true);
    }
  };

  const handlePropertyPurchase = async (property: GridSquare, tbSpent: number) => {
    if (!user) return;

    try {
      await dbService.purchaseProperty(user.uid, property, tbSpent);
      
      // Update local state
      setOwnedProperties(prev => [...prev, property]);
      setAllProperties(prev => [...prev, property]);
      setUserTB(prev => prev - tbSpent);

      console.log('Property purchased and saved to Firestore');
    } catch (error) {
      console.error('Error purchasing property:', error);
      throw error;
    }
  };

  const handleCheckIn = async (propertyId: string, tbEarned: number, propertyOwnerId: string, message?: string, hasPhoto?: boolean) => {
    if (!user) return;

    try {
      await dbService.createCheckIn(user.uid, propertyId, propertyOwnerId, message, hasPhoto);
      await dbService.updateUserBalance(user.uid, tbEarned);
      
      setUserTB(prev => prev + tbEarned);
      setTotalCheckIns(prev => prev + 1);
      setTotalTBEarned(prev => prev + tbEarned);

      console.log(`Check-in saved! Visitor earned ${tbEarned} TB, owner earned 1 TB`);
    } catch (error) {
      console.error('Error during check-in:', error);
      throw error;
    }
  };

  const handleEarningsUpdate = async (usdAmount: number) => {
    if (!user) return;

    try {
      await dbService.updateUSDEarnings(user.uid, usdAmount);
      
      setUsdEarnings(prev => prev + usdAmount);

      console.log(`Earnings saved! User earned $${usdAmount.toFixed(8)} USD from property rent`);
    } catch (error) {
      console.error('Error saving earnings:', error);
      throw error;
    }
  };

  const handlePropertyPress = (property: GridSquare) => {
    if (mapRef.current) {
      mapRef.current.navigateToProperty(property);
    }
  };

  if (!dataLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap = 'map';

            if (route.name === 'Map') {
              iconName = focused ? 'map' : 'map-outline';
            } else if (route.name === 'Profile') {
              iconName = focused ? 'person' : 'person-outline';
            }

            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: '#2196F3',
          tabBarInactiveTintColor: 'gray',
          headerShown: false,
        })}
      >
        <Tab.Screen name="Map">
          {(props) => (
            <MapScreen
              {...props}
              ref={mapRef}
              userId={user?.uid || ''}
              username={username}
              userTB={userTB}
              usdEarnings={usdEarnings}
              ownedProperties={ownedProperties}
              allProperties={allProperties}
              initialBoostState={boostState}
              onPropertyPurchase={handlePropertyPurchase}
              onCheckIn={handleCheckIn}
              onEarningsUpdate={handleEarningsUpdate}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Profile">
          {(props) => (
            <ProfileScreen
              {...props}
              userTB={userTB}
              username={username}
              ownedProperties={ownedProperties}
              totalCheckIns={totalCheckIns}
              totalTBEarned={totalTBEarned}
              onPropertyPress={handlePropertyPress}
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}
