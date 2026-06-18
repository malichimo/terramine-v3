// MainNavigator.tsx - Phase 3: Map tab wrapped in Stack → PropertyDetail reachable from map

import React, { useState, useRef, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
const NOTIF_PROMPT_KEY = 'terramine_notif_prompted'; // ✅ One-time notification opt-in prompt

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
      <MapStack.Screen name="MemoryMatch">
        {(props) => (
          <MemoryMatchScreen
            {...(props as any)}
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
      <MapStack.Screen name="GoldRush">
        {(props) => (
          <GoldRushGame
            {...(props as any)}
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
      <MapStack.Screen name="MinerMaze">
        {(props) => (
          <MinerMazeScreen
            {...(props as any)}
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
      <MapStack.Screen name="LaserBlast">
        {(props) => (
          <LaserBlastGame
            {...(props as any)}
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
      <ProfileStack.Screen name="MemoryMatch">
        {(props) => (
          <MemoryMatchScreen
            {...(props as any)}
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
      <ProfileStack.Screen name="GoldRush">
        {(props) => (
          <GoldRushGame
            {...(props as any)}
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
      <ProfileStack.Screen name="MinerMaze">
        {(props) => (
          <MinerMazeScreen
            {...(props as any)}
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
      <ProfileStack.Screen name="LaserBlast">
        {(props) => (
          <LaserBlastGame
            {...(props as any)}
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
  const insets = useSafeAreaInsets();
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
      // ✅ BUG-033 FIX: loadUserData MUST complete before checkAgeGate runs.
      // Both functions read the user Firestore doc. For new Google/Apple sign-in
      // users, the doc doesn't exist yet — loadUserData creates it via createUser().
      // If checkAgeGate races loadUserData (as it did before), it may read the doc
      // before createUser() finishes, finding tbBalance=null. purchaseProperty()
      // then does a fresh Firestore read and gets tbBalance ?? 0 = 0 < 100 →
      // "Insufficient TB balance" — blocking ALL new users from buying their first mine.
      // Sequencing guarantees the doc exists with tbBalance:1000 before anything else reads it.
      loadUserData().then(() => checkAgeGate());
      checkOnboarding();
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
        // ✅ FIX: Retry user doc creation up to 3 times with 1-second backoff.
        // A single Firestore network blip during the first-write window silently
        // swallows createUser(), leaving the user with no tbBalance or email in
        // Firestore. The outer catch then calls setDataLoaded(true) and the app
        // opens normally — but the user can't purchase any properties because
        // purchaseProperty() finds tbBalance=null → 0 < 100 → "Insufficient TB".
        // Retrying here ensures the doc is created before anything else proceeds.
        // Google/Apple Sign-In users may also have user.email === null (Apple only
        // provides it on the very first sign-in), so we always fall back to ''.
        let created = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await dbService.createUser(user.uid, user.email || '');
            created = true;
            break;
          } catch (e) {
            console.warn(`createUser attempt ${attempt + 1} failed:`, e);
            if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
          }
        }
        if (!created) {
          console.error('createUser failed after 3 attempts — user doc may be missing. User will need to sign out and back in.');
        }
        userData = await dbService.getUserData(user.uid);
      }

      const properties = await dbService.getPropertiesByOwner(user.uid);

      // ✅ BUG-029 FIX: Removed getAllProperties() — it fetched the ENTIRE
      // properties collection into JS memory on every login, causing a Hermes
      // GC OOM crash (EXC_CRASH/SIGABRT) as the player base grows. The full
      // table scan also spread the array on every purchase, hitting the exact
      // hermesBuiltinCopyDataProperties → ArrayStorageBase::reallocateToLarger
      // crash chain in the reported stack trace.
      // MapScreen.loadNearbyProperties() only uses allProperties to check if a
      // visible grid square is owned — passing only the current user's own
      // properties is correct. Nearby owned properties from OTHER players are
      // fetched on-demand in loadNearbyProperties() via getVisibleGridSquares().
      setUserTB(userData?.tbBalance || 1000);
      setUsdEarnings(userData?.usdEarnings || 0);
      setOwnedProperties(properties);
      setAllProperties(properties);
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
      // ✅ BUG-035 FIX: Removed setUserTB(prev => prev - tbSpent) here.
      // MapScreen already calls onTBUpdate(-100) as an optimistic update immediately
      // after purchase — which maps to setUserTB(prev => prev + delta) on line 698.
      // Deducting again here caused a double-deduction of 200 TB instead of 100.
      // TB state is owned by MapScreen's optimistic call; this handler owns property state only.

      // ✅ One-time notification opt-in prompt shown after first purchase.
      // Uses AsyncStorage so it fires once per install — covers both new users
      // and existing users who bought properties before this was added.
      // Small delay so the purchase success alert settles first.
      setTimeout(async () => {
        try {
          const alreadyPrompted = await AsyncStorage.getItem(NOTIF_PROMPT_KEY);
          if (alreadyPrompted === 'true') return;

          await AsyncStorage.setItem(NOTIF_PROMPT_KEY, 'true');

          Alert.alert(
            '⛏️ Get Notified When Visitors Arrive!',
            'Want to know when someone checks in to your mine? Enable notifications to get an instant alert.',
            [
              { text: 'Not Now', style: 'cancel' },
              {
                text: 'Enable Notifications',
                onPress: async () => {
                  const token = await NotificationService.registerForPushNotifications();
                  if (token) {
                    await dbService.savePushToken(user.uid, token);
                    await NotificationService.scheduleDailyReminder();
                    Alert.alert(
                      '✅ Notifications Enabled!',
                      "You'll get an alert whenever someone visits your mine."
                    );
                  } else {
                    Alert.alert(
                      'Permission Required',
                      'To enable notifications, go to your device Settings and allow notifications for TerraMine.'
                    );
                  }
                },
              },
            ]
          );
        } catch (e) {
          console.warn('Notification prompt failed (non-fatal):', e);
        }
      }, 2000);

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

      // ✅ Push notification to property owner on check-in.
      // Runs fire-and-forget — a notification failure must never break the check-in.
      // Only fires for real player mines (not system mines — ownerId starts with 'terramine-').
      if (propertyOwnerId && !propertyOwnerId.startsWith('terramine-')) {
        dbService.getPushToken(propertyOwnerId).then(ownerToken => {
          if (ownerToken) {
            const visitorName = nickname || 'Someone';
            const mine = mineType || 'mine';
            NotificationService.sendCheckInNotification(ownerToken, visitorName, mine)
              .catch(e => console.warn('Check-in notification failed (non-fatal):', e));
          }
        }).catch(e => console.warn('Failed to fetch owner push token (non-fatal):', e));
      }

    } catch (error: any) {
      // ✅ BUG-053 FIX: Surface the server-side duplicate check-in rejection
      // as a friendly alert rather than a raw error. This fires when the client-side
      // guard was bypassed (app restart, cache clear, multiple devices).
      if (error?.message === 'ALREADY_CHECKED_IN_TODAY') {
        Alert.alert('Already Checked In', 'You have already checked in to this property today.');
        return;
      }
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
            paddingBottom: 8 + insets.bottom,
            paddingTop: 4,
            height: 68 + insets.bottom,
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
