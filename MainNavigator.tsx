// MainNavigator.tsx - Phase 3: Map tab wrapped in Stack → PropertyDetail reachable from map

import React, { useState, useRef, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import MapScreen from './screens/MapScreen';
import ProfileScreen from './screens/ProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import PropertyDetailScreen from './screens/PropertyDetailScreen';
import UpgradeScreen from './screens/UpgradeScreen';
import MemoryMatchScreen from './screens/games/MemoryMatch/MemoryMatchScreen';
import GoldRushGame from './screens/games/GoldRush/GoldRushGame';
import MinerMazeScreen from './screens/games/MinerMaze/MinerMazeScreen';
import LaserBlastGame from './screens/games/LaserBlast/LaserBlastGame';
import { GridSquare } from './utils/GridUtils';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'react-native';
import { useAuth } from './contexts/AuthContext';
import { DatabaseService } from './services/DatabaseService';
import { ConsentService } from './services/ConsentService';
import { soundService } from './services/SoundService';
import { View, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OnboardingScreen, { ONBOARDING_SEEN_KEY } from './screens/OnboardingScreen';
import AgeGateScreen from './screens/AgeGateScreen';
import DailyActivityScreen from './screens/DailyActivityScreen';
import VisitorLogScreen from './screens/VisitorLogScreen';
import ReferralScreen from './screens/ReferralScreen';
import { ReferralService } from './services/ReferralService';
import { NotificationService } from './services/NotificationService';
import * as StoreReview from 'expo-store-review';

const Tab = createBottomTabNavigator();
const MapStack = createStackNavigator();
const ProfileStack = createStackNavigator();
const SettingsStack = createStackNavigator(); // ✅ Added
const dbService = new DatabaseService();
const REVIEW_PROMPTED_KEY = 'terramine_review_prompted';
const REVIEW_CHECKIN_THRESHOLD = 5;

// ─── Map Stack ────────────────────────────────────────────────────────────────
interface MapStackProps {
  userId: string;
  username: string;
  userTB: number;
  usdEarnings: number;
  ownedProperties: GridSquare[];
  allProperties: GridSquare[];
  boostState: any;
  onPropertyPurchase: (property: GridSquare, tbSpent: number) => void;
  onCheckIn: (...args: any[]) => Promise<void>;
  onBoostUpdate: (data: any) => void;
  onEarningsUpdate: (amount: number) => Promise<void>;
  mapRef: React.RefObject<any>;
  onPropertyUpdate: () => void;
  onNavigateToReferral: () => void;
  onTBUpdate: (tbDelta: number) => void;
}

function MapStackNavigator({
  userId, username, userTB, usdEarnings,
  ownedProperties, allProperties, boostState,
  onPropertyPurchase, onCheckIn, onBoostUpdate, onEarningsUpdate,
  mapRef, onPropertyUpdate, onNavigateToReferral, onTBUpdate,
}: MapStackProps) {
  return (
    <MapStack.Navigator screenOptions={{ headerShown: false }}>
      <MapStack.Screen name="MapMain">
        {(props) => (
          <MapScreen
            {...(props as any)}
            ref={mapRef}
            userId={userId}
            username={username}
            userTB={userTB}
            usdEarnings={usdEarnings}
            ownedProperties={ownedProperties}
            allProperties={allProperties}
            onPropertyPurchase={onPropertyPurchase}
            onCheckIn={onCheckIn}
            initialBoostState={boostState}
            onBoostUpdate={onBoostUpdate}
            onEarningsUpdate={onEarningsUpdate}
            onTBUpdate={onTBUpdate}
            onNavigateToPropertyDetail={(property: GridSquare) =>
              props.navigation.navigate('PropertyDetail', { property, userId })
            }
            onNavigateToVisitorLog={(property: GridSquare) =>
              props.navigation.navigate('VisitorLog', { property })
            }
            onNavigateToReferral={() =>
              props.navigation.navigate('Referral')
            }
          />
        )}
      </MapStack.Screen>
      <MapStack.Screen name="PropertyDetail">
        {(props) => <PropertyDetailScreen {...props} onPropertyUpdate={onPropertyUpdate} />}
      </MapStack.Screen>
      <MapStack.Screen name="DailyActivity">
        {(props) => (
          <DailyActivityScreen
            {...props}
            route={{
              ...props.route,
              params: {
                ...(props.route.params as any),
                onBalanceUpdate: (amount: number) => onTBUpdate(amount),
              },
            }}
          />
        )}
      </MapStack.Screen>
      <MapStack.Screen name="Upgrade" component={UpgradeScreen as any} />
      <MapStack.Screen name="MemoryMatch" component={MemoryMatchScreen as any} />
      <MapStack.Screen name="GoldRush" component={GoldRushGame as any} />
      <MapStack.Screen name="MinerMaze" component={MinerMazeScreen as any} />
      <MapStack.Screen name="LaserBlast" component={LaserBlastGame as any} />
      <MapStack.Screen name="VisitorLog" component={VisitorLogScreen as any} />
      <MapStack.Screen name="Referral" component={ReferralScreen as any} />
    </MapStack.Navigator>
  );
}

// ─── Profile Stack ────────────────────────────────────────────────────────────
interface ProfileStackProps {
  userTB: number;
  usdEarnings: number;
  username: string;
  ownedProperties: GridSquare[];
  totalCheckIns: number;
  totalTBEarned: number;
  userId: string;
  onSignOut: () => Promise<void>;
  onPropertyUpdate: () => void;
  onUsernameChange: (newUsername: string) => void;
  onTBUpdate: (tbDelta: number) => void;
}

function ProfileStackNavigator({
  userTB, usdEarnings, username, ownedProperties,
  totalCheckIns, totalTBEarned, userId, onSignOut, onPropertyUpdate, onUsernameChange, onTBUpdate,
}: ProfileStackProps) {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileMain">
        {(props) => (
          <ProfileScreen
            {...(props as any)}
            userTB={userTB}
            usdEarnings={usdEarnings}
            username={username}
            ownedProperties={ownedProperties}
            totalCheckIns={totalCheckIns}
            totalTBEarned={totalTBEarned}
            onPropertyPress={(property: GridSquare) =>
              props.navigation.navigate('PropertyDetail', { property, userId })
            }
            onSignOut={onSignOut}
            onUsernameChange={onUsernameChange}
            onNavigateToReferral={() =>
              props.navigation.navigate('Referral')
            }
          />
        )}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="PropertyDetail">
        {(props) => <PropertyDetailScreen {...props} onPropertyUpdate={onPropertyUpdate} />}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="DailyActivity">
        {(props) => (
          <DailyActivityScreen
            {...props}
            route={{
              ...props.route,
              params: {
                ...(props.route.params as any),
                onBalanceUpdate: (amount: number) => onTBUpdate(amount),
              },
            }}
          />
        )}
      </ProfileStack.Screen>
      <ProfileStack.Screen name="Upgrade" component={UpgradeScreen as any} />
      <ProfileStack.Screen name="MemoryMatch" component={MemoryMatchScreen as any} />
      <ProfileStack.Screen name="GoldRush" component={GoldRushGame as any} />
      <ProfileStack.Screen name="MinerMaze" component={MinerMazeScreen as any} />
      <ProfileStack.Screen name="LaserBlast" component={LaserBlastGame as any} />
      <ProfileStack.Screen name="VisitorLog" component={VisitorLogScreen as any} />
      <ProfileStack.Screen name="Referral" component={ReferralScreen as any} />
    </ProfileStack.Navigator>
  );
}

// ─── Settings Stack ───────────────────────────────────────────────────────────
// ✅ Wrapping SettingsScreen in its own stack prevents the crash caused by
//    React Navigation mounting it as a bare tab screen without a navigation context.
interface SettingsStackProps {
  onSignOut: () => Promise<void>;
}

function SettingsStackNavigator({ onSignOut }: SettingsStackProps) {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettingsStack.Screen name="SettingsMain">
        {() => <SettingsScreen onSignOut={onSignOut} />}
      </SettingsStack.Screen>
    </SettingsStack.Navigator>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MainNavigator() {
  const { user, signOut } = useAuth();
  const [userTB, setUserTB] = useState(1000);
  const [usdEarnings, setUsdEarnings] = useState(0);
  const [ownedProperties, setOwnedProperties] = useState<GridSquare[]>([]);
  const [allProperties, setAllProperties] = useState<GridSquare[]>([]);
  const [totalCheckIns, setTotalCheckIns] = useState(0);
  const [totalTBEarned, setTotalTBEarned] = useState(0);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [needsAgeGate, setNeedsAgeGate] = useState<boolean | null>(null);
  const [consentReady, setConsentReady] = useState(false);
  const [boostState, setBoostState] = useState({
    freeBoostsRemaining: 4,
    adBoostsRemaining: 12,
    boostExpiresAt: null as string | null,
    nextFreeBoostResetAt: null as string | null,
    lastAdBoostRefillAt: new Date().toISOString(),
  });
  const [username, setUsername] = useState(
    user?.displayName || user?.email?.split('@')[0] || 'User'
  );
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (user) {
      loadUserData();
      checkOnboarding();
      checkAgeGate();
      // ✅ Wrapped in try/catch — a ConsentService failure no longer blocks the app
      ConsentService.initialize()
        .catch(e => console.warn('ConsentService init failed (non-fatal):', e))
        .finally(() => setConsentReady(true));
      soundService.init().catch(e => console.warn('SoundService init failed', e));
    }
  }, [user]);

  const checkOnboarding = async () => {
    try {
      const seen = await AsyncStorage.getItem(ONBOARDING_SEEN_KEY);
      setOnboardingDone(seen === 'true');
    } catch {
      setOnboardingDone(true); // fail open — don't block the app
    }
  };

  const checkAgeGate = async () => {
    if (!user) return;
    try {
      const userData = await dbService.getUserData(user.uid);
      // Show age gate if dateOfBirth has never been set
      const hasDOB = userData?.dateOfBirth != null && userData.dateOfBirth !== '';
      setNeedsAgeGate(!hasDOB);
    } catch {
      setNeedsAgeGate(false); // fail open
    }
  };

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
      if (userData?.nickname) setUsername(userData.nickname);

      const boostData = await dbService.getBoostState(user.uid);
      setBoostState({
        freeBoostsRemaining: boostData.freeBoostsRemaining,
        adBoostsRemaining: boostData.adBoostsRemaining,
        boostExpiresAt: boostData.boostExpiresAt,
        nextFreeBoostResetAt: boostData.nextFreeBoostResetAt,
        lastAdBoostRefillAt: boostData.lastAdBoostRefillAt,
      });

      ReferralService.getOrCreateReferralCode(user.uid).catch(e =>
        console.warn('Referral code init failed (non-fatal):', e)
      );

      // Grant first-session auto-boost to new users
      dbService.grantFirstSessionBoost(user.uid, {
        freeBoostsRemaining: boostData.freeBoostsRemaining,
        adBoostsRemaining: boostData.adBoostsRemaining,
        boostExpiresAt: boostData.boostExpiresAt,
        nextFreeBoostResetAt: boostData.nextFreeBoostResetAt,
        lastAdBoostRefillAt: boostData.lastAdBoostRefillAt,
      }).then(newBoostState => {
        if (newBoostState) {
          setBoostState(prev => ({ ...prev, ...newBoostState }));
          Alert.alert(
            '⚡ Welcome Boost Activated!',
            'You have a free 30-minute 20x earning boost to get you started. Check your earnings counter!'
          );
        }
      }).catch(() => {});

      setDataLoaded(true);

      // ✅ Re-schedule daily reminder on every login so it picks up
      // the latest message from Firestore (remote notification feature)
      NotificationService.scheduleDailyReminder().catch(e =>
        console.warn('Daily reminder reschedule failed (non-fatal):', e)
      );

    } catch (error) {
      console.error('Error loading data:', error);
      setDataLoaded(true); // ✅ Always unblock the app even on error
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

  const handleCheckIn = async (
    propertyId: string, tbEarned: number, propertyOwnerId: string,
    message?: string, hasPhoto?: boolean, photoUri?: string, nickname?: string,
    mineType?: string
  ) => {
    if (!user) return;
    try {
      await dbService.createCheckIn(user.uid, propertyId, propertyOwnerId, message, hasPhoto, photoUri, nickname, mineType);
      await dbService.updateUserBalance(user.uid, tbEarned);
      setUserTB(prev => prev + tbEarned);
      setTotalCheckIns(prev => {
        const newCount = prev + 1;
        // ✅ Rate prompt: trigger after REVIEW_CHECKIN_THRESHOLD check-ins, once per install
        if (newCount >= REVIEW_CHECKIN_THRESHOLD) {
          maybeRequestReview();
        }
        return newCount;
      });
      setTotalTBEarned(prev => prev + tbEarned);
    } catch (error) {
      console.error('Error during check-in:', error);
      throw error;
    }
  };

  // ✅ Rate This App: shows native store review prompt after meaningful use.
  // Only fires once per install (guarded by AsyncStorage flag).
  // Non-fatal — review failure should never affect the user experience.
  const maybeRequestReview = async () => {
    try {
      const alreadyPrompted = await AsyncStorage.getItem(REVIEW_PROMPTED_KEY);
      if (alreadyPrompted === 'true') return;

      const isAvailable = await StoreReview.isAvailableAsync();
      if (!isAvailable) return;

      // Small delay so the check-in success UI can settle first
      setTimeout(async () => {
        try {
          await StoreReview.requestReview();
          await AsyncStorage.setItem(REVIEW_PROMPTED_KEY, 'true');
        } catch (e) {
          console.warn('StoreReview.requestReview failed (non-fatal):', e);
        }
      }, 1500);
    } catch (e) {
      console.warn('maybeRequestReview failed (non-fatal):', e);
    }
  };

  const handleBoostUpdate = (newBoostData: any) => {
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

  const handlePropertyUpdate = () => {
    loadUserData();
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (!dataLoaded || onboardingDone === null || needsAgeGate === null || !consentReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  if (!onboardingDone) {
    return (
      <OnboardingScreen
        onDone={() => setOnboardingDone(true)}
      />
    );
  }

  if (needsAgeGate && user) {
    return (
      <AgeGateScreen
        userId={user.uid}
        onDone={(isAdult) => setNeedsAgeGate(false)}
      />
    );
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            if (route.name === 'Map') {
              return (
                <Image
                  source={require('./assets/images/map.png')}
                  style={{ width: size + 4, height: size + 4, opacity: focused ? 1 : 0.45 }}
                  resizeMode="contain"
                />
              );
            } else if (route.name === 'Profile') {
              return (
                <Image
                  source={require('./assets/images/miner_face.png')}
                  style={{ width: size + 4, height: size + 4, opacity: focused ? 1 : 0.45 }}
                  resizeMode="contain"
                />
              );
            } else if (route.name === 'Settings') {
              return (
                <Image
                  source={require('./assets/images/gear.png')}
                  style={{ width: size + 4, height: size + 4, opacity: focused ? 1 : 0.45 }}
                  resizeMode="contain"
                />
              );
            }
            return null;
          },
          tabBarActiveTintColor: '#FFD700',
          tabBarInactiveTintColor: '#8B7355',
          tabBarStyle: {
            backgroundColor: '#1A0900',
            borderTopColor: '#6D4C1F',
            borderTopWidth: 2,
            paddingBottom: 4,
            paddingTop: 4,
            height: 60,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
          },
          headerShown: false,
        })}
      >
        <Tab.Screen name="Map">
          {() => (
            <MapStackNavigator
              userId={user?.uid || ''}
              username={username}
              userTB={userTB}
              usdEarnings={usdEarnings}
              ownedProperties={ownedProperties}
              allProperties={allProperties}
              boostState={boostState}
              onPropertyPurchase={handlePropertyPurchase}
              onCheckIn={handleCheckIn}
              onBoostUpdate={handleBoostUpdate}
              onEarningsUpdate={handleEarningsUpdate}
              mapRef={mapRef}
              onPropertyUpdate={handlePropertyUpdate}
              onNavigateToReferral={() => {}}
              onTBUpdate={(delta) => setUserTB(prev => prev + delta)}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Profile">
          {() => (
            <ProfileStackNavigator
              userTB={userTB}
              usdEarnings={usdEarnings}
              username={username}
              ownedProperties={ownedProperties}
              totalCheckIns={totalCheckIns}
              totalTBEarned={totalTBEarned}
              userId={user?.uid || ''}
              onSignOut={handleSignOut}
              onPropertyUpdate={handlePropertyUpdate}
              onUsernameChange={setUsername}
              onTBUpdate={(delta) => setUserTB(prev => prev + delta)}
            />
          )}
        </Tab.Screen>
        {/* ✅ Settings now wrapped in its own stack navigator */}
        <Tab.Screen name="Settings">
          {() => (
            <SettingsStackNavigator onSignOut={handleSignOut} />
          )}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}
