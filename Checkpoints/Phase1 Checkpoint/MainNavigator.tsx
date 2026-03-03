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
  const { user, signOut } = useAuth();
  const [userTB, setUserTB] = useState(1000);
  const [usdEarnings, setUsdEarnings] = useState(0);
  const [ownedProperties, setOwnedProperties] = useState<GridSquare[]>([]);
  const [allProperties, setAllProperties] = useState<GridSquare[]>([]);
  const [totalCheckIns, setTotalCheckIns] = useState(0);
  const [totalTBEarned, setTotalTBEarned] = useState(0);
  const [dataLoaded, setDataLoaded] = useState(false);
  
  // Boost state
  const [boostState, setBoostState] = useState({
    freeBoostsRemaining: 4,
    adBoostsRemaining: 12,
    boostExpiresAt: null as string | null,
    nextFreeBoostResetAt: null as string | null,
    lastAdBoostRefillAt: new Date().toISOString(),
  });
  
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
      
      // Load boost state
      setBoostState({
        freeBoostsRemaining: userData?.freeBoostsRemaining ?? 4,
        adBoostsRemaining: userData?.adBoostsRemaining ?? 12,
        boostExpiresAt: userData?.boostExpiresAt ?? null,
        nextFreeBoostResetAt: userData?.nextFreeBoostResetAt ?? null,
        lastAdBoostRefillAt: userData?.lastAdBoostRefillAt ?? new Date().toISOString(),
      });
      
      console.log('Loaded from Firestore:', {
        tb: userData?.tbBalance,
        usd: userData?.usdEarnings,
        ownedCount: properties.length,
        allPropertiesCount: allProps.length,
        boostState: {
          freeBoosts: userData?.freeBoostsRemaining ?? 4,
          adBoosts: userData?.adBoostsRemaining ?? 12,
          expiresAt: userData?.boostExpiresAt,
        }
      });

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

  const handleCheckIn = async (propertyId: string, tbEarned: number, propertyOwnerId: string, message?: string, hasPhoto?: boolean, photoUrl?: string, visitorNickname?: string) => {
    if (!user) return;

    try {
      await dbService.createCheckIn(user.uid, propertyId, propertyOwnerId, message, hasPhoto, photoUrl, visitorNickname);  // ✅ Add photoUrl and visitorNickname
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

  const handlePropertyPress = (property: GridSquare) => {
    if (mapRef.current) {
      mapRef.current.navigateToProperty(property);
    }
  };

  const handleBoostUpdate = (newBoostData: {
    freeBoostsRemaining?: number;
    adBoostsRemaining?: number;
    boostExpiresAt: string | null;
    nextFreeBoostResetAt: string | null;
    lastAdBoostRefillAt?: string;
  }) => {
    setBoostState(prev => ({ ...prev, ...newBoostData }));
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

  // Handle sign out with data saving
  const handleSignOut = async () => {
    try {
      // Call MapScreen's save function before signing out
      await signOut(async () => {
        if (mapRef.current?.saveBeforeSignOut) {
          await mapRef.current.saveBeforeSignOut();
        }
      });
    } catch (error) {
      console.error('Error during sign out:', error);
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
              ownedProperties={ownedProperties}
              allProperties={allProperties}
              initialBoostState={boostState}
              onPropertyPurchase={handlePropertyPurchase}
              onCheckIn={handleCheckIn}
              onBoostUpdate={handleBoostUpdate}
              onEarningsUpdate={handleEarningsUpdate}
              usdEarnings={usdEarnings}
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
              onSignOut={handleSignOut}
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}
