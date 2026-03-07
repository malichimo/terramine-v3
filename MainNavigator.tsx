// MainNavigator.tsx - UPDATED FOR PHASE 2 PROPERTYDETAILSCREEN

import React, { useState, useRef, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import MapScreen from './screens/MapScreen';
import ProfileScreen from './screens/ProfileScreen';
import PropertyDetailScreen from './screens/PropertyDetailScreen';
import UpgradeScreen from './screens/UpgradeScreen';
import MemoryMatchScreen from './screens/games/MemoryMatch/MemoryMatchScreen';
import GoldRushGame from './screens/games/GoldRush/GoldRushGame';
import MinerMazeScreen from './screens/games/MinerMaze/MinerMazeScreen';
import LaserBlastGame from './screens/games/LaserBlast/LaserBlastGame';
import { GridSquare } from './utils/GridUtils';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './contexts/AuthContext';
import { DatabaseService } from './services/DatabaseService';
import { View, ActivityIndicator } from 'react-native';
import DailyActivityScreen from './screens/DailyActivityScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();
const dbService = new DatabaseService();

// ✨ Defined OUTSIDE MainNavigator so React never treats it as a new component type on re-render
interface ProfileStackProps {
  userTB: number;
  username: string;
  ownedProperties: GridSquare[];
  totalCheckIns: number;
  totalTBEarned: number;
  userId: string;
  onSignOut: () => Promise<void>;
}

function ProfileStackNavigator({
  userTB,
  username,
  ownedProperties,
  totalCheckIns,
  totalTBEarned,
  userId,
  onSignOut,
}: ProfileStackProps) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain">
        {(props) => (
          <ProfileScreen
            {...props as any}
            userTB={userTB}
            username={username}
            ownedProperties={ownedProperties}
            totalCheckIns={totalCheckIns}
            totalTBEarned={totalTBEarned}
            onPropertyPress={(property: GridSquare) =>
              props.navigation.navigate('PropertyDetail', {
                property,
                userId,
              })
            }
            onSignOut={onSignOut}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="PropertyDetail" component={PropertyDetailScreen as any} />
      <Stack.Screen name="DailyActivity" component={DailyActivityScreen as any} />
      <Stack.Screen name="Upgrade" component={UpgradeScreen as any} />
      <Stack.Screen name="MemoryMatch" component={MemoryMatchScreen as any} />
      <Stack.Screen name="GoldRush" component={GoldRushGame as any} />
      <Stack.Screen name="MinerMaze" component={MinerMazeScreen as any} />
      <Stack.Screen name="LaserBlast" component={LaserBlastGame as any} />
    </Stack.Navigator>
  );
}

export default function MainNavigator() {
  const { user, signOut } = useAuth();
  const [userTB, setUserTB] = useState(1000);
  const [usdEarnings, setUsdEarnings] = useState(0);
  const [ownedProperties, setOwnedProperties] = useState<GridSquare[]>([]);
  const [allProperties, setAllProperties] = useState<GridSquare[]>([]);
  const [totalCheckIns, setTotalCheckIns] = useState(0);
  const [totalTBEarned, setTotalTBEarned] = useState(0);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [boostState, setBoostState] = useState({
    freeBoostsRemaining: 4,
    adBoostsRemaining: 12,
    boostExpiresAt: null as string | null,
    nextFreeBoostResetAt: null as string | null,
    lastAdBoostRefillAt: new Date().toISOString(),
  });
  const username = user?.displayName || user?.email?.split('@')[0] || 'User';
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (user) {
      loadUserData();
    }
  }, [user]);

  const loadUserData = async () => {
    if (!user) return;
    try {
      let userData = await dbService.getUserData(user.uid);
      if (!userData) {
        await dbService.createUser(user.uid, user.email || '');
        userData = await dbService.getUserData(user.uid);
      }
      const properties = await dbService.getPropertiesByOwner(user.uid);
      const allProps = await dbService.getAllProperties();

      setUserTB(userData?.tbBalance || 1000);
      setUsdEarnings(userData?.usdEarnings || 0);
      setOwnedProperties(properties);
      setAllProperties(allProps);
      setTotalCheckIns(userData?.totalCheckIns || 0);
      setTotalTBEarned(userData?.totalTBEarned || 0);

      const boostData = await dbService.getBoostState(user.uid);
      setBoostState({
        freeBoostsRemaining: boostData.freeBoostsRemaining,
        adBoostsRemaining: boostData.adBoostsRemaining,
        boostExpiresAt: boostData.boostExpiresAt,
        nextFreeBoostResetAt: boostData.nextFreeBoostResetAt,
        lastAdBoostRefillAt: boostData.lastAdBoostRefillAt,
      });

      console.log('Loaded from Firestore:', {
        tb: userData?.tbBalance,
        ownedCount: properties.length,
        allPropertiesCount: allProps.length,
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
      setOwnedProperties(prev => [...prev, property]);
      setAllProperties(prev => [...prev, property]);
      setUserTB(prev => prev - tbSpent);
    } catch (error) {
      console.error('Error purchasing property:', error);
      throw error;
    }
  };

  const handleCheckIn = async (propertyId: string, tbEarned: number, propertyOwnerId: string, message?: string, hasPhoto?: boolean, photoUri?: string, visitorNickname?: string) => {
    if (!user) return;
    try {
      await dbService.createCheckIn(user.uid, propertyId, propertyOwnerId, message, hasPhoto, photoUri, visitorNickname);
      await dbService.updateUserBalance(user.uid, tbEarned);
      setUserTB(prev => prev + tbEarned);
      setTotalCheckIns(prev => prev + 1);
      setTotalTBEarned(prev => prev + tbEarned);
    } catch (error) {
      console.error('Error during check-in:', error);
      throw error;
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
    } catch (error) {
      console.error('Error saving earnings:', error);
      throw error;
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
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
              onPropertyPurchase={handlePropertyPurchase}
              onCheckIn={handleCheckIn}
              initialBoostState={boostState}
              onBoostUpdate={handleBoostUpdate}
              onEarningsUpdate={handleEarningsUpdate}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Profile">
          {() => (
            <ProfileStackNavigator
              userTB={userTB}
              username={username}
              ownedProperties={ownedProperties}
              totalCheckIns={totalCheckIns}
              totalTBEarned={totalTBEarned}
              userId={user?.uid || ''}
              onSignOut={handleSignOut}
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}
