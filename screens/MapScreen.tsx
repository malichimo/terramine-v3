import React, { useState, useEffect, useRef, useImperativeHandle } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, ScrollView, TextInput, Linking, AppState } from 'react-native';
import MapView, { Polygon, PROVIDER_GOOGLE, Marker } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import { LocationService, Coordinates } from '../services/LocationService';
import { DatabaseService, BoostState } from '../services/DatabaseService';
import { dbServicePhase2 } from '../services/DatabaseServicePhase2';
import { generateGridSquare, getVisibleGridSquares, isWithinGridSquare, isAdjacentToUser, GridSquare, gridToLatLng } from '../utils/GridUtils';
import { createSystemMineNear, isSystemMine, SYSTEM_CHECKIN_REWARD_TB } from '../services/SystemMineService';
import BoostModal from '../components/BoostModal';
import TBTradeInModal from '../components/TBTradeInModal';
import { soundService } from '../services/SoundService';
import LeaderboardModal from '../components/LeaderboardModal';
import { ReferralService } from '../services/ReferralService';
import { AdMobService } from '../services/AdMobService';
import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Extend BoostState with computed properties used locally in MapScreen
interface MapScreenBoostState extends BoostState {
  boostTimeRemaining?: number; // minutes
  isBoostActive?: boolean;
}

interface CheckIn {
  id: string;
  userId: string;
  timestamp: Date;
  message?: string;
  hasPhoto: boolean;
}

interface MapScreenProps {
  userId: string;
  username: string;
  userTB: number;
  ownedProperties: GridSquare[];
  allProperties: GridSquare[];
  initialBoostState: BoostState;
  onPropertyPurchase: (property: GridSquare, tbSpent: number) => void;
  onCheckIn: (propertyId: string, tbEarned: number, propertyOwnerId: string, message?: string, hasPhoto?: boolean, photoUri?: string, nickname?: string, mineType?: string) => Promise<void>;
  onBoostUpdate: (boostData: any) => void;
  onEarningsUpdate?: (usdAmount: number) => Promise<void>;
  onTBUpdate?: (tbDelta: number) => void;
  usdEarnings?: number;
  onNavigateToPropertyDetail?: (property: GridSquare) => void;
  onNavigateToVisitorLog?: (property: GridSquare) => void;
  onNavigateToReferral?: () => void;
  onNavigateToLeaderboard?: () => void;
}

const MapScreen = React.forwardRef<any, MapScreenProps>(({ 
  userId,
  username,
  userTB, 
  ownedProperties,
  allProperties,
  initialBoostState,
  onPropertyPurchase,
  onCheckIn,
  onBoostUpdate,
  onEarningsUpdate,
  onTBUpdate,
  usdEarnings = 0,
  onNavigateToPropertyDetail,
  onNavigateToVisitorLog,
  onNavigateToReferral,
}, ref) => {
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [showTradeInModal, setShowTradeInModal] = useState(false);
  const [findingNearestTA, setFindingNearestTA] = useState(false);
  const [gridSquares, setGridSquares] = useState<Map<string, GridSquare>>(new Map());

  // ✅ BUG-029 FOLLOW-UP FIX: Cache of all properties within ~100 miles of the
  // user's location. Loaded once on mount and refreshed when the user moves >10
  // miles from the last fetch point. Stored as RAW Firestore results (other
  // players only) — merged with ownedProperties at point of use to avoid
  // stale closure issues with the ownedProperties prop.
  const radiusPropertiesRef = useRef<GridSquare[]>([]);
  const lastRadiusFetchRef  = useRef<{ lat: number; lng: number } | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<GridSquare | null>(null);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [checkInMessage, setCheckInMessage] = useState('');
  const [lastCheckIns, setLastCheckIns] = useState<Map<string, string>>(new Map());
  const [propertyCheckIns, setPropertyCheckIns] = useState<Map<string, CheckIn[]>>(new Map());
  // ✅ AVATAR: Cache both nickname and avatarUrl per owner so we only
  // fetch each user doc once and can display their avatar in the mine panel.
  const [ownerCache, setOwnerCache] = useState<Map<string, { nickname: string; avatarUrl: string | null }>>(new Map());
  const [showLegend, setShowLegend] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showCommunityModal, setShowCommunityModal] = useState(false);
  
  // Boost state
  const [boostState, setBoostState] = useState<MapScreenBoostState>({
    freeBoostsRemaining: initialBoostState.freeBoostsRemaining || 4,
    adBoostsRemaining: initialBoostState.adBoostsRemaining || 12,
    boostExpiresAt: initialBoostState.boostExpiresAt || null,
    nextFreeBoostResetAt: initialBoostState.nextFreeBoostResetAt || null,
    lastAdBoostRefillAt: initialBoostState.lastAdBoostRefillAt || new Date().toISOString(),
    boostTimeRemaining: 0,
    isBoostActive: false,
  });

  // Earnings state
  const [currentEarnings, setCurrentEarnings] = useState(0);
  
  const mapRef = useRef<MapView>(null);
  const locationService = useRef(new LocationService()).current;
  const dbService = useRef(new DatabaseService()).current;
  const earningsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const earningsStartTime = useRef<Date>(new Date());
  const lastSavedEarnings = useRef<number>(0); // Track what was last saved so we only increment Firebase by the delta
  const hasCalculatedOffline = useRef<boolean>(false); // Guard: offline earnings must only fire once per session

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    navigateToProperty: (property: GridSquare) => {
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: property.centerLat,
          longitude: property.centerLng,
          latitudeDelta: 0.002,
          longitudeDelta: 0.002,
        }, 1000);
        setSelectedSquare(property);
      }
    },
    // NEW: Method to save all data before sign out
    saveBeforeSignOut: async () => {
      try {
        console.log('💾 MapScreen: Saving data before sign out...');
        
        // Stop the earnings timer first
        if (earningsTimerRef.current) {
          clearInterval(earningsTimerRef.current);
          earningsTimerRef.current = null;
        }
        
        // Compute final earnings fresh (currentEarnings state may be stale in closure)
        const now = new Date();
        const elapsedSeconds = (now.getTime() - earningsStartTime.current.getTime()) / 1000;
        const finalEarnings = calculateEarnings() * (elapsedSeconds / 60);
        if (finalEarnings > 0) {
          console.log(`💰 Saving $${finalEarnings.toFixed(8)} USD earnings`);
          await saveEarningsToFirebase(finalEarnings);
        }
        
        // Save last active time
        await saveLastActiveTime();
        
        console.log('✅ MapScreen: All data saved');
      } catch (error) {
        console.error('❌ MapScreen: Error saving data:', error);
        // Don't throw - allow sign out to continue
      }
    }
  }));

  // Update boost timer — uses ref to always read latest boostExpiresAt
  // without re-creating the interval on every state change
  // ✅ FIX BUG-001: Initialize from initialBoostState, NOT boostState.
  // boostState starts with the MainNavigator default (null expiry) and only gets
  // the real Firebase value after loadBoostState() resolves async. If we init
  // from boostState here, the timer fires its first tick before loadBoostState
  // completes, sees null, and immediately kills an active boost.
  const boostExpiresAtRef = useRef(initialBoostState.boostExpiresAt ?? null);

  // Keep a ref for the non-expiry boost fields so the expiry write-back
  // uses current values instead of stale closure values (BUG-001 part 2)
  const boostStateRef = useRef(boostState);
  useEffect(() => {
    boostStateRef.current = boostState;
  }, [boostState]);
  useEffect(() => {
    boostExpiresAtRef.current = boostState.boostExpiresAt;
  }, [boostState.boostExpiresAt]);

  useEffect(() => {
    const updateBoostTimer = () => {
      const expiresAtStr = boostExpiresAtRef.current;
      if (!expiresAtStr) {
        setBoostState(prev => {
          if (!prev.isBoostActive && prev.boostTimeRemaining === 0) return prev; // no change needed
          return { ...prev, boostTimeRemaining: 0, isBoostActive: false };
        });
        return;
      }

      const now = new Date();
      const expiresAt = new Date(expiresAtStr);
      const diffMs = expiresAt.getTime() - now.getTime();
      const diffMinutes = Math.max(0, diffMs / (1000 * 60));

      if (diffMinutes <= 0) {
        boostExpiresAtRef.current = null;
        setBoostState(prev => ({ 
          ...prev, 
          boostTimeRemaining: 0, 
          isBoostActive: false,
          boostExpiresAt: null 
        }));
        dbService.updateBoostState(userId, {
          freeBoostsRemaining: boostStateRef.current.freeBoostsRemaining,
          adBoostsRemaining: boostStateRef.current.adBoostsRemaining,
          boostExpiresAt: null,
          nextFreeBoostResetAt: boostStateRef.current.nextFreeBoostResetAt,
          lastAdBoostRefillAt: boostStateRef.current.lastAdBoostRefillAt,
        });
      } else {
        setBoostState(prev => ({ 
          ...prev, 
          boostTimeRemaining: diffMinutes,
          isBoostActive: true 
        }));
      }
    };

    updateBoostTimer();
    const interval = setInterval(updateBoostTimer, 1000);
    return () => clearInterval(interval);
  }, []); // Run once on mount — reads boostExpiresAt via ref, not closure

  // Check free boost reset
  useEffect(() => {
    const checkResetTimer = () => {
      if (!boostState.nextFreeBoostResetAt) return;

      const now = new Date();
      const resetAt = new Date(boostState.nextFreeBoostResetAt);

      if (now >= resetAt && boostState.freeBoostsRemaining < 4) {  // ✅ Only reset if needed
        const newState: BoostState = {
          freeBoostsRemaining: 4,
          adBoostsRemaining: boostState.adBoostsRemaining,
          boostExpiresAt: boostState.boostExpiresAt,
          nextFreeBoostResetAt: null,
          lastAdBoostRefillAt: boostState.lastAdBoostRefillAt,
        };
        setBoostState(prev => ({ ...prev, ...newState }));
        dbService.updateBoostState(userId, newState);
      }
    };

    const interval = setInterval(checkResetTimer, 60000);
    return () => clearInterval(interval);
  }, []);  // ✅ Only run on mount

  // Load boost state from Firebase ONCE on mount (includes auto-refill logic)
  useEffect(() => {
    const loadBoostState = async () => {
      try {
        const state = await dbService.getBoostState(userId);

        // ✅ BOOST-DROP FIX: Only overwrite boostExpiresAtRef if:
        // (a) Firebase returned a non-null expiry, OR
        // (b) The ref is already null (no active boost to protect)
        // This prevents a slow/failed network read from nulling out an active boost.
        if (state.boostExpiresAt !== null) {
          boostExpiresAtRef.current = state.boostExpiresAt;
        } else if (boostExpiresAtRef.current !== null) {
          // Firebase says null but we have a local expiry — verify it's actually expired
          const localExpiry = new Date(boostExpiresAtRef.current);
          if (localExpiry <= new Date()) {
            // Truly expired — safe to clear
            boostExpiresAtRef.current = null;
          }
          // else: keep local ref intact — network may have returned stale data
        }

        // Preserve display fields — timer will recalculate them on next tick
        setBoostState(prev => ({
          ...prev,
          freeBoostsRemaining: state.freeBoostsRemaining,
          adBoostsRemaining: state.adBoostsRemaining,
          boostExpiresAt: state.boostExpiresAt ?? prev.boostExpiresAt,
          nextFreeBoostResetAt: state.nextFreeBoostResetAt,
          lastAdBoostRefillAt: state.lastAdBoostRefillAt,
          // Keep boostTimeRemaining and isBoostActive — timer recalculates these
        }));
      } catch (error) {
        // ✅ BOOST-DROP FIX: On network error, do NOT touch boost state at all
        // The timer continues running from the ref — boost stays active
        console.error('Error loading boost state (non-fatal, keeping local state):', error);
      }
    };

    loadBoostState();
  }, [userId]);

  // Earnings update timer - updates display every second, saves to Firebase every minute
  useEffect(() => {
    if (ownedProperties.length === 0) return;

    // Use a ref to track cumulative earnings inside the interval
    // so we never read stale state and never trigger re-renders as a side-effect
    const lastSaveTimeRef = { value: Date.now() };

    earningsTimerRef.current = setInterval(() => {
      if (!userId) return; // Don't save if signed out

      const now = new Date();
      const elapsedSeconds = (now.getTime() - earningsStartTime.current.getTime()) / 1000;
      const newEarnings = calculateEarnings() * (elapsedSeconds / 60);

      // Update display (this does NOT re-trigger this useEffect because
      // currentEarnings is no longer in the dependency array)
      setCurrentEarnings(newEarnings);

      // Save to Firebase every minute
      const timeSinceLastSave = Date.now() - lastSaveTimeRef.value;
      if (timeSinceLastSave >= 60000) {
        saveEarningsToFirebase(newEarnings);
        saveLastActiveTime();
        lastSaveTimeRef.value = Date.now();
      }
    }, 1000); // 1-second tick is plenty for display; 100ms was wasteful

    return () => {
      if (earningsTimerRef.current) {
        clearInterval(earningsTimerRef.current);
        earningsTimerRef.current = null;
        // Don't save here — saveBeforeSignOut() handles final save explicitly
        // Saving in cleanup caused double-saves on every re-mount
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedProperties.length, boostState.isBoostActive]); // NOT currentEarnings — that caused re-mount every tick

  const calculateEarnings = (): number => {
    const rentRates = {
      rock: 0.0000000011,
      coal: 0.0000000016,
      gold: 0.0000000022,
      diamond: 0.0000000044,
    };

    const totalRentPerSecond = ownedProperties.reduce((sum, property) => {
      const rate = rentRates[property.mineType as keyof typeof rentRates] || 0;
      return sum + rate;
    }, 0);

    const multiplier = boostState.isBoostActive ? 20 : 1; // 20x boost on passive USD earnings
    return totalRentPerSecond * 60 * multiplier; // Convert to per minute
  };

  const saveEarningsToFirebase = async (earnings: number) => {
    if (earnings <= 0) return;
    
    try {
      const delta = earnings - lastSavedEarnings.current;
      if (delta <= 0) return; // Nothing new to save
      
      console.log(`Saving $${delta.toFixed(8)} USD earnings delta to Firebase (total session: $${earnings.toFixed(8)})`);
      
      if (onEarningsUpdate) {
        await onEarningsUpdate(delta);
        lastSavedEarnings.current = earnings; // Record what we just saved up to
      }
    } catch (error) {
      console.error('Error saving earnings to Firebase:', error);
    }
  };

  const saveLastActiveTime = async () => {
    try {
      await dbService.updateLastActiveTime(userId);
      console.log('Last active time saved');
    } catch (error) {
      console.error('Error saving last active time:', error);
    }
  };

  useEffect(() => {
    if (userLocation) {
      loadNearbyProperties(userLocation);
    }
  }, [userLocation]);
  
  useEffect(() => {
    initializeLocation();
    
    return () => {
      locationService.stopWatchingLocation();
      if (earningsTimerRef.current) {
        clearInterval(earningsTimerRef.current);
      }
      // NOTE: Don't save here - saveBeforeSignOut() is called explicitly before sign out
      // Cleanup still runs on unmount, but data is already saved
    };
  }, []);

  // Calculate and apply offline earnings — fires once when properties first load
  useEffect(() => {
    if (ownedProperties.length > 0 && initialBoostState && !hasCalculatedOffline.current) {
      hasCalculatedOffline.current = true;
      calculateOfflineEarnings();
    }
  }, [ownedProperties.length]);

  // ✅ FEAT-001 BUG-014 FIX: Trigger #1 — nudge new players to buy their first mine.
  // Fires once after data loads, only if they have no properties yet.
  const hasShownFirstPurchaseNudge = useRef(false);
  useEffect(() => {
    if (hasShownFirstPurchaseNudge.current) return;
    if (ownedProperties.length > 0) return; // already have properties
    if (!userId) return;

    const checkFirstPurchaseNudge = async () => {
      try {
        const userData = await dbService.getUserData(userId);
        if (userData && !userData.milestone_firstPurchase) {
          hasShownFirstPurchaseNudge.current = true;
          // Small delay so map has time to render first
          setTimeout(() => {
            Alert.alert(
              '⛏️ Welcome to TerraMine!',
              'Walk to a bright green square on the map and tap it to buy your first mine. You start with 1,000 TB — enough for 10 properties!',
              [{ text: "Let's Go! 🗺️" }]
            );
          }, 2000);
        }
      } catch {
        // Non-fatal
      }
    };

    // Only run after ownedProperties has loaded (length is defined, even if 0)
    checkFirstPurchaseNudge();
  }, [ownedProperties.length, userId]);

  const calculateOfflineEarnings = async () => {
    try {
      // Get the last logout time from Firebase (we'll need to add this field)
      const userData = await dbService.getUserData(userId);
      const lastActiveAt = userData?.lastActiveAt ? new Date(userData.lastActiveAt) : null;
      
      if (!lastActiveAt) {
        // First time login or no previous session, start fresh
        earningsStartTime.current = new Date();
        lastSavedEarnings.current = 0;
        return;
      }

      const now = new Date();
      const offlineSeconds = Math.floor((now.getTime() - lastActiveAt.getTime()) / 1000);
      
      if (offlineSeconds < 60) {
        // Less than a minute offline, just continue
        earningsStartTime.current = new Date();
        lastSavedEarnings.current = 0;
        return;
      }

      // Cap offline earnings at 24 hours to prevent runaway accumulation
      const MAX_OFFLINE_SECONDS = 24 * 60 * 60;
      const cappedSeconds = Math.min(offlineSeconds, MAX_OFFLINE_SECONDS);

      // Calculate base earnings rate
      const rentRates = {
        rock: 0.0000000011,
        coal: 0.0000000016,
        gold: 0.0000000022,
        diamond: 0.0000000044,
      };

      const totalRentPerSecond = ownedProperties.reduce((sum, property) => {
        const rate = rentRates[property.mineType as keyof typeof rentRates] || 0;
        return sum + rate;
      }, 0);

      // Calculate how much time was boosted during offline period (using capped time)
      let boostedSeconds = 0;
      let unboostedSeconds = cappedSeconds;

      if (initialBoostState.boostExpiresAt) {
        const boostExpiry = new Date(initialBoostState.boostExpiresAt);
        
        // If boost was active during offline time
        if (boostExpiry > lastActiveAt) {
          const boostActiveUntil = boostExpiry < now ? boostExpiry : now;
          const rawBoostedSeconds = Math.floor((boostActiveUntil.getTime() - lastActiveAt.getTime()) / 1000);
          boostedSeconds = Math.min(rawBoostedSeconds, cappedSeconds);
          unboostedSeconds = cappedSeconds - boostedSeconds;
        }
      }

      // Calculate earnings: boosted time at 20x passive earnings, rest at 1x
      const boostedEarnings = totalRentPerSecond * (boostedSeconds / 60) * 60 * 20; // per minute * minutes * 20x
      const unboostedEarnings = totalRentPerSecond * (unboostedSeconds / 60) * 60; // per minute * minutes
      const totalOfflineEarnings = boostedEarnings + unboostedEarnings;

      // Update lastActiveAt NOW before saving earnings
      // This prevents any re-fire of calculateOfflineEarnings from using the same old timestamp
      await saveLastActiveTime();

      if (totalOfflineEarnings > 0) {
        if (onEarningsUpdate) {
          await onEarningsUpdate(totalOfflineEarnings);
        }
      }

      // Start fresh timer from now
      earningsStartTime.current = new Date();
      lastSavedEarnings.current = 0; // Reset delta tracking for new session
    } catch (error) {
      console.error('Error calculating offline earnings:', error);
      earningsStartTime.current = new Date();
    }
  };

  useEffect(() => {
    if (userLocation) {
      loadNearbyProperties(userLocation);
    }
  }, [ownedProperties.length]);

  useEffect(() => {
    // Fallback: if radius cache hasn't loaded yet, use allProperties prop
    if (userLocation && allProperties.length > 0 && radiusPropertiesRef.current.length === 0) {
      loadNearbyProperties(userLocation);
    }
  }, [allProperties.length]);

  // Auto-zoom to user location on first load
  useEffect(() => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.001,
        longitudeDelta: 0.001,
      }, 1000);
    }
  }, [userLocation?.latitude, userLocation?.longitude]);

  // ── Radius property loader ─────────────────────────────────────────────────
  // Fetches all properties within 100 miles and caches them in radiusPropertiesRef.
  // Re-fetches only when user moves >10 miles from the last fetch point to avoid
  // hammering Firestore on every GPS tick.
  const loadRadiusProperties = async (location: Coordinates) => {
    const last = lastRadiusFetchRef.current;
    if (last) {
      const R = 3958.8;
      const dLat = (location.latitude  - last.lat) * Math.PI / 180;
      const dLng = (location.longitude - last.lng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(last.lat * Math.PI / 180) *
        Math.cos(location.latitude * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
      const distMiles = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (distMiles < 10) return;
    }

    try {
      const nearby = await dbServicePhase2.getPropertiesInRadius(
        location.latitude, location.longitude, 100
      );
      // ✅ FIX: Store RAW results only — do NOT merge with ownedProperties here.
      // ownedProperties is a prop from MainNavigator and suffers from stale closure
      // when read inside this async function defined at render time.
      // Merging happens at point of use (loadNearbyProperties + visitableTAs)
      // where the latest prop value is always available via the component scope.
      radiusPropertiesRef.current = nearby;
      lastRadiusFetchRef.current  = { lat: location.latitude, lng: location.longitude };
      loadNearbyProperties(location);
    } catch (e) {
      console.warn('loadRadiusProperties failed (non-fatal):', e);
    }
  };

  const initializeLocation = async () => {
    const location = await locationService.getCurrentLocation();
    if (location) {
      setUserLocation(location);
      // Load radius first so the grid renders with full ownership data immediately
      await loadRadiusProperties(location);
      loadNearbyProperties(location);

      locationService.startWatchingLocation((newLocation) => {
        setUserLocation(newLocation);
        loadRadiusProperties(newLocation).catch(() => {});
        loadNearbyProperties(newLocation);
      });
    }
  };

  const loadNearbyProperties = (location: Coordinates, propertiesOverride?: GridSquare[]) => {
    const visibleGridIds = getVisibleGridSquares(location.latitude, location.longitude, 500);
    const newGridSquares = new Map<string, GridSquare>();

    // ✅ FIX: Inject ALL radius cache properties directly into the grid map first,
    // regardless of whether they fall within the visible window.
    // getVisibleGridSquares hard-caps at 150m — properties owned by other players
    // further away were never being added to the grid, making them invisible.
    // The MapView only renders what's in the viewport anyway, so adding extras is free.
    const ownedIds = new Set(ownedProperties.map(p => p.id));
    const propertySource = propertiesOverride
      ? propertiesOverride
      : [
          ...ownedProperties,
          ...radiusPropertiesRef.current.filter(p => !ownedIds.has(p.id)),
        ];

    // Seed the grid with ALL known properties first
    for (const prop of propertySource) {
      newGridSquares.set(prop.id, prop);
    }

    // Then fill in the visible unowned squares around the user
    visibleGridIds.forEach(gridId => {
      if (newGridSquares.has(gridId)) return; // Already set from property source
      const [x, y] = gridId.split('_').map(Number);
      const existingSquare = gridSquares.get(gridId);
      if (existingSquare && existingSquare.isOwned) {
        newGridSquares.set(gridId, existingSquare);
      } else {
        const center = gridToLatLng(x, y, location.latitude);
        const square = generateGridSquare(center.latitude, center.longitude);
        newGridSquares.set(gridId, square);
      }
    });

    setGridSquares(newGridSquares);
  };

  const handleSquarePress = (square: GridSquare) => {
    // If this is one of the user's own properties, use the enriched version
    // from ownedProperties which includes customName
    const enriched = ownedProperties.find(p => p.id === square.id);
    const resolved = enriched || square;
    setSelectedSquare(resolved);
    setShowCheckInModal(false);

    // Fetch owner nickname if needed
    if (resolved.isOwned && resolved.ownerId && resolved.ownerId !== userId) {
      fetchOwnerNickname(resolved.ownerId);
    }
  };

  const fetchOwnerNickname = async (ownerId: string) => {
    if (ownerCache.has(ownerId)) return; // already cached
    try {
      const userData = await dbService.getUserData(ownerId);
      const nickname = userData?.nickname || userData?.email?.split('@')[0] || 'Unknown';
      const avatarUrl = userData?.avatarUrl || null;
      const entry = { nickname, avatarUrl };
      setOwnerCache(prev => {
        // ✅ BUG-029 FIX: Cap cache at 100 entries to prevent unbounded Map growth.
        if (prev.size >= 100) {
          const trimmed = new Map<string, { nickname: string; avatarUrl: string | null }>();
          const entries = Array.from(prev.entries()).slice(-50);
          entries.forEach(([k, v]) => trimmed.set(k, v));
          return trimmed.set(ownerId, entry);
        }
        return new Map(prev).set(ownerId, entry);
      });
    } catch {
      setOwnerCache(prev => new Map(prev).set(ownerId, { nickname: 'Unknown', avatarUrl: null }));
    }
  };

  // ── Cooldown helpers ───────────────────────────────────────────────────────

  /**
   * Returns seconds remaining on a cooldown, or 0 if cooldown has passed.
   */
  const getCooldownRemaining = (lastActionTime: number): number => {
    const elapsed = Date.now() - lastActionTime;
    const remaining = COOLDOWN_MS - elapsed;
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  };

  const formatCooldown = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  /**
   * Shows an Alert offering the user the option to wait out the cooldown
   * or watch a rewarded ad to skip it immediately.
   * onSkipped is called when the ad reward is earned.
   */
  const showCooldownAlert = (
    actionLabel: string,
    secondsRemaining: number,
    onSkipped: () => void,
  ) => {
    Alert.alert(
      '⏳ Cooldown Active',
      `You need to wait ${formatCooldown(secondsRemaining)} before your next ${actionLabel}.\n\nWatch a short ad to skip the cooldown now?`,
      [
        { text: 'Wait', style: 'cancel' },
        {
          text: '📺 Watch Ad to Skip',
          onPress: async () => {
            if (!adService.isAdReady()) {
              Alert.alert('Ad Not Ready', 'The ad is still loading. Please wait a moment and try again.');
              return;
            }
            const shown = await adService.showAd(
              () => {
                // Reward earned — clear the cooldown and proceed
                onSkipped();
              },
              () => {
                // Ad closed without completing — do nothing
              },
            );
            if (!shown) {
              Alert.alert('Ad Unavailable', 'Could not load an ad right now. Please wait out the cooldown.');
            }
          },
        },
      ]
    );
  };

  const canCheckInToday = (propertyId: string): boolean => {
    const lastCheckIn = lastCheckIns.get(propertyId);
    if (!lastCheckIn) return true;
    
    const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
    return lastCheckIn !== today;
  };

  const handleCheckIn = () => {
    if (!selectedSquare || !userLocation) return;
    
    if (!selectedSquare.isOwned) {
      Alert.alert('Cannot Check In', 'This property is not owned yet.');
      return;
    }
    
    if (selectedSquare.ownerId === userId) {
      Alert.alert('Cannot Check In', 'You cannot check in to your own properties.');
      return;
    }
    
    if (!isAdjacentToUser(userLocation.latitude, userLocation.longitude, selectedSquare)) {
      Alert.alert('Too Far', 'You must be within or adjacent to the property to check in.');
      return;
    }
    
    if (!canCheckInToday(selectedSquare.id)) {
      Alert.alert('Already Checked In', 'You can only check in once per day (EST timezone).');
      return;
    }

    // ── Cooldown check ─────────────────────────────────────────────────────
    const cooldownRemaining = getCooldownRemaining(lastCheckInTime.current);
    if (cooldownRemaining > 0) {
      showCooldownAlert('check-in', cooldownRemaining, () => {
        // Ad watched — reset cooldown and open the modal
        lastCheckInTime.current = 0;
        AsyncStorage.removeItem(STORAGE_KEY_CHECKIN).catch(() => {});
        setShowCheckInModal(true);
      });
      return;
    }
    
    setShowCheckInModal(true);
  };

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is needed to take photos.');
      return false;
    }
    return true;
  };

  const takePhoto = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return null;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.5,
      });

      if (!result.canceled && result.assets[0]) {
        return result.assets[0].uri;
      }
      return null;
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
      return null;
    }
  };

  const submitCheckIn = async (withPhoto: boolean) => {
    if (!selectedSquare || !selectedSquare.ownerId) return;

    // ✅ BUG-025 FIX: Block re-entrant calls caused by double-tap or rapid taps.
    // Using a ref means the guard is evaluated synchronously before any await,
    // so a second tap that arrives while the first is in-flight is rejected immediately.
    if (isSubmittingCheckIn.current) return;
    isSubmittingCheckIn.current = true;

    let photoUri = null;
    let photoUrl = undefined;
    
    // Take photo if requested
    if (withPhoto) {
      photoUri = await takePhoto();
      if (!photoUri) {
        return;
      }
      
      // ✅ UPLOAD PHOTO TO FIREBASE STORAGE
      try {
        console.log('📤 Starting upload...');
        photoUrl = await dbService.uploadCheckInPhoto(userId, selectedSquare.id, photoUri);
        console.log('✅ Photo uploaded successfully');
      } catch (uploadError) {
        console.error('❌ Upload failed:', uploadError);
        Alert.alert('Upload Failed', 'Check-in will be saved without photo.');
        photoUri = null;
      }
    }
    
    // Base TB raised to 3
    const isSystem = isSystemMine(selectedSquare.ownerId || '');
    let tbEarned = isSystem ? SYSTEM_CHECKIN_REWARD_TB : 3;
    if (!isSystem) {
      if (checkInMessage.trim()) tbEarned += 2;
      if (photoUri) tbEarned += 2;
    }

    // Apply boost multiplier (not on system mine bonus)
    if (boostState.isBoostActive && !isSystem) {
      tbEarned *= 2;
    }

    try {
      await onCheckIn(
        selectedSquare.id,
        tbEarned,
        selectedSquare.ownerId,
        checkInMessage.trim() || undefined,
        !!photoUri,
        photoUrl,
        username,
        selectedSquare.mineType  // ✅ pass mineType for check-in notification
      );

      // ✅ BUG FIX: Only set the daily guard AFTER a successful Firestore write.
      // Previously this was set before the try block, so a post-save error would
      // show "Failed to save check-in" even though the check-in saved correctly.
      const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
      setLastCheckIns(prev => new Map(prev).set(selectedSquare.id, today));

      // ── Stamp cooldown timestamp ───────────────────────────────────────────
      // Only update after a confirmed successful write so failed check-ins
      // don't incorrectly trigger the cooldown for the next attempt.
      lastCheckInTime.current = Date.now();
      AsyncStorage.setItem(STORAGE_KEY_CHECKIN, String(lastCheckInTime.current)).catch(() => {});

      // ✅ BUG FIX: Post-save side effects are isolated in their own try/catch.
      // A streak update failure will NOT surface as "Failed to save check-in".
      let streakBonus = 0;
      let newStreak = 0;
      try {
        newStreak = await dbService.incrementCheckInStreak(userId);
        streakBonus = dbService.getStreakBonus(newStreak);
        if (streakBonus > 0) {
          await dbService.updateUserBalance(userId, streakBonus);
          tbEarned += streakBonus;
        }
      } catch (streakError) {
        console.warn('Streak update failed (non-fatal):', streakError);
      }

      const boostText = boostState.isBoostActive && !isSystem ? ' (2x Boost Applied!)' : '';
      const streakText = streakBonus > 0 ? `\n\uD83D\uDD25 Streak bonus: +${streakBonus} TB (${newStreak} mines today!)` : '';
      const systemText = isSystem ? '\n Welcome bonus from TerraMine HQ!' : ' The owner earned 1 TB.';
      Alert.alert(
        isSystem ? 'Welcome to TerraMine!' : 'Check-in Complete!',
        `You earned ${tbEarned} TB${boostText}!${systemText}${streakText}`
      );
    } catch (error) {
      console.error('Check-in error:', error);
      Alert.alert('Error', 'Failed to save check-in');
    } finally {
      // ✅ BUG-025 FIX: Release the submission lock so the user can check in again
      // (to a different property, or after a genuine error).
      isSubmittingCheckIn.current = false;

      // ✅ BUG FIX: Always close the modal and clear the message, whether the
      // check-in succeeded or failed. Previously the modal stayed open on error,
      // allowing the user to submit a duplicate check-in.
      setCheckInMessage('');
      setShowCheckInModal(false);
    }
  };

  // ✅ FIX: Prevent double-tap race condition
  const isPurchasing = useRef(false);

  // ✅ BUG-025 FIX: Prevent duplicate check-in submissions on double-tap or rapid taps.
  // Same pattern as isPurchasing — a ref (not state) so it blocks re-entry synchronously
  // without triggering a re-render that could itself race.
  const isSubmittingCheckIn = useRef(false);

  // ── Cooldown system ────────────────────────────────────────────────────────
  // Tracks the timestamp of the last completed check-in and purchase so we can
  // enforce a 5-minute cooldown between consecutive actions. Stored as refs so
  // they survive re-renders without triggering them.
  // Users can watch a rewarded ad to skip the cooldown early.
  const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
  const lastCheckInTime = useRef<number>(0);
  const lastPurchaseTime = useRef<number>(0);
  const adService = useRef(new AdMobService()).current;

  // ✅ BUG-029 FIX: Listen for iOS memory pressure warnings and proactively
  // free the largest in-memory caches before the Hermes GC is forced to OOM.
  // On iOS, the OS fires 'memoryWarning' before killing the process — this
  // gives us a window to shed non-essential cached data gracefully.
  useEffect(() => {
    const subscription = AppState.addEventListener('memoryWarning', () => {
      console.warn('⚠️ Memory warning received — clearing caches');
      setOwnerCache(new Map());
      setPropertyCheckIns(new Map());
    });
    return () => subscription.remove();
  }, []);
  // 5-minute cooldown survives app restarts. AsyncStorage is local and instant —
  // no network call, no login lag. Without this, restarting the app resets both
  // refs to 0 and users can immediately check in or purchase again.
  const STORAGE_KEY_CHECKIN  = `terramine_lastCheckIn_${userId}`;
  const STORAGE_KEY_PURCHASE = `terramine_lastPurchase_${userId}`;

  useEffect(() => {
    (async () => {
      try {
        const [ciVal, puVal] = await AsyncStorage.multiGet([
          STORAGE_KEY_CHECKIN,
          STORAGE_KEY_PURCHASE,
        ]);
        const ciTs = ciVal[1] ? parseInt(ciVal[1], 10) : 0;
        const puTs = puVal[1] ? parseInt(puVal[1], 10) : 0;
        // Only restore if still within the cooldown window — no point enforcing
        // a cooldown from 3 days ago
        const now = Date.now();
        if (ciTs && now - ciTs < COOLDOWN_MS) lastCheckInTime.current = ciTs;
        if (puTs && now - puTs < COOLDOWN_MS) lastPurchaseTime.current = puTs;
      } catch (e) {
        console.warn('Could not restore cooldown timestamps:', e);
      }
    })();
  }, []);

  const handlePurchaseProperty = async () => {
    if (!selectedSquare || !userLocation) return;

    // ✅ FIX: Block re-entrant calls (double-tap)
    if (isPurchasing.current) return;

    // ✅ BUG-030 FIX: Removed local userTB < 100 guard here. The prop from
    // MainNavigator can be stale after onTBUpdate(-100) fires optimistically —
    // causing a false "Insufficient TB" rejection when the user actually has
    // enough. Firestore's purchaseProperty() already does an authoritative
    // balance check at the DB level and throws 'Insufficient TB balance' if
    // genuinely short. That error surfaces cleanly to the user via the catch
    // block below. We keep only the UI-level checks that Firestore can't do.

    if (selectedSquare.isOwned) {
      Alert.alert('Already Owned', 'This property is already owned.');
      return;
    }

    const alreadyOwned = ownedProperties.some(p => p.id === selectedSquare.id);
    if (alreadyOwned) {
      Alert.alert('Already Owned', 'You already own this property.');
      return;
    }

    if (!isAdjacentToUser(userLocation.latitude, userLocation.longitude, selectedSquare)) {
      Alert.alert('Too Far', 'You must be within or adjacent to the property to purchase it.');
      return;
    }

    // ── Cooldown check ─────────────────────────────────────────────────────
    // Only applies to the SECOND+ purchase in a session. First purchase is
    // always free so new players aren't blocked on their very first mine.
    if (lastPurchaseTime.current > 0) {
      const cooldownRemaining = getCooldownRemaining(lastPurchaseTime.current);
      if (cooldownRemaining > 0) {
        showCooldownAlert('purchase', cooldownRemaining, () => {
          // Ad watched — reset cooldown and re-trigger purchase immediately
          lastPurchaseTime.current = 0;
          AsyncStorage.removeItem(STORAGE_KEY_PURCHASE).catch(() => {});
          handlePurchaseProperty();
        });
        return;
      }
    }

    isPurchasing.current = true;

    const mineType = assignMineType();
    const updatedSquare = {
      ...selectedSquare,
      isOwned: true,
      ownerId: userId,
      mineType,
    };

    try {
      // ✅ FIX: Await the Firestore write BEFORE updating UI.
      // Previously onPropertyPurchase() was called without await, so the UI
      // updated optimistically even if the write failed or the balance check
      // threw — allowing unlimited free purchases.
      await onPropertyPurchase(updatedSquare, 100);

      soundService.play('purchase');

      // ── Stamp cooldown timestamp ───────────────────────────────────────────
      lastPurchaseTime.current = Date.now();
      AsyncStorage.setItem(STORAGE_KEY_PURCHASE, String(lastPurchaseTime.current)).catch(() => {});

      // ✅ BUG-026 FIX: Notify parent of the TB deduction immediately so the
      // balance display updates in the same render cycle as the purchase.
      // Without this, userTB (passed as a prop from MainNavigator) doesn't
      // reflect the deduction until the parent re-renders and pushes the new
      // prop down — causing a visible stale balance on slower devices.
      onTBUpdate?.(-100);

      setGridSquares(prev => {
        const updated = new Map(prev);
        updated.set(selectedSquare.id, updatedSquare);
        return updated;
      });

      setSelectedSquare(updatedSquare);

      // Mark first purchase milestone as done (so nudge doesn't re-show)
      dbService.checkAndFireMilestone(userId, 'milestone_firstPurchase').catch(() => {});

      // Fire referral reward if this is the user's first purchase and they were referred
      if (ownedProperties.length === 0) {
        ReferralService.processFirstPurchaseReferral(userId).catch(e =>
          console.warn('Referral reward (non-fatal):', e)
        );
      }

      // Create system mine on first property purchase
      if (ownedProperties.length === 0) {
        createSystemMineNear(updatedSquare).then(systemMine => {
          if (systemMine) {
            setAllProperties(prev => prev.some(p => p.id === systemMine.id) ? prev : [...prev, systemMine]);
          }
        }).catch(e => console.warn('System mine (non-fatal):', e));
      }

      Alert.alert('Success!', `You purchased a ${mineType} mine! Tap it to explore.`);
    } catch (error: any) {
      // ✅ FIX: Surface the error to the user — TB was NOT deducted if this throws
      Alert.alert(
        'Purchase Failed',
        error?.message || 'Could not complete purchase. Please try again.',
      );
    } finally {
      isPurchasing.current = false;
    }
  };

  // Boost handlers
  const handleFreeBoost = async () => {
    try {
      const newState = await dbService.useFreeBoost(userId, boostState);
      boostExpiresAtRef.current = newState.boostExpiresAt;
      setBoostState(newState);
      onBoostUpdate(newState);
      setShowBoostModal(false);
      Alert.alert('Boost Activated!', '+30 minutes of 20x passive earnings! Check-in rewards also get 2x.');
    } catch (error) {
      console.error('Error activating free boost:', error);
      Alert.alert('Error', 'Failed to activate boost. Please try again.');
    }
  };

  const handleAdBoost = async () => {
    try {
      const newState = await dbService.useAdBoost(userId, boostState);
      boostExpiresAtRef.current = newState.boostExpiresAt; // keep ref in sync immediately
      setBoostState(newState);
      onBoostUpdate(newState);
      setShowBoostModal(false);
      Alert.alert('Boost Activated!', `+30 minutes of 20x passive earnings from ad! (${newState.adBoostsRemaining}/12 remaining)`);
    } catch (error) {
      console.error('❌ Error activating ad boost:', error);
      Alert.alert('Error', 'Failed to activate boost. Please try again.');
    }
  };

  const assignMineType = (): 'rock' | 'coal' | 'gold' | 'diamond' => {
    const rand = Math.random() * 100;
    if (rand < 60) return 'rock';
    if (rand < 90) return 'coal';
    if (rand < 99) return 'gold';
    return 'diamond';
  };

  // Smart earnings display: show enough precision to be meaningful
  const formatEarnings = (amount: number): string => {
    if (amount >= 100)   return `$${amount.toFixed(2)}`;
    if (amount >= 1)     return `$${amount.toFixed(2)}`;
    if (amount >= 0.01)  return `$${amount.toFixed(4)}`;
    if (amount >= 0.001) return `$${amount.toFixed(5)}`;
    return `$${amount.toFixed(6)}`;
  };

  const getMineColor = (mineType?: string): string => {
    switch (mineType) {
      case 'rock': return '#808080';
      case 'coal': return '#000000';
      case 'gold': return '#FFD700';
      case 'diamond': return '#B9F2FF';
      default: return '#4CAF50';
    }
  };

  const getMineIcon = (type: string) => {
    switch (type) {
      case 'rock': return '🪨';
      case 'coal': return '⚫';
      case 'gold': return '🟡';
      case 'diamond': return '💎';
      default: return '⬜';
    }
  };

  const getSquareFillColor = (square: GridSquare): string => {
    if (square.isOwned) {
      if (square.ownerId === userId) {
        // Player's own property — solid mine color
        return getMineColor(square.mineType);
      } else {
        // Another player's property — orange fill
        return 'rgba(255, 152, 0, 0.6)';
      }
    }
    return 'rgba(76, 175, 80, 0.3)';
  };

  const getSquareStrokeColor = (square: GridSquare): string => {
    if (square.isOwned) {
      if (square.ownerId === userId) {
        return '#2196F3'; // Blue border for own properties
      } else {
        return '#E65100'; // Dark orange border for others' properties
      }
    }
    return '#4CAF50';
  };

  const selectedPropertyCheckIns = selectedSquare ? 
    (propertyCheckIns.get(selectedSquare.id) || []) : [];

  const formatTimeRemaining = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}`;
    }
    return `${mins}m`;
  };

  // ── Find Nearest TA ──────────────────────────────────────────────────────

  const handleFindNearestTA = () => {
    if (!userLocation) {
      Alert.alert('Location Unavailable', 'We need your location to find the nearest property.');
      return;
    }

    // Merge owned + radius cache at point of use so visitableTAs always has
    // the full picture of nearby other players' mines regardless of load order.
    const ownedIds = new Set(ownedProperties.map(p => p.id));
    const fullPropertySource = [
      ...ownedProperties,
      ...radiusPropertiesRef.current.filter(p => !ownedIds.has(p.id)),
    ];

    const visitableTAs = fullPropertySource.filter(p =>
      p.isOwned &&
      p.ownerId &&
      p.ownerId !== userId &&
      !isSystemMine(p.ownerId)
    );

    if (visitableTAs.length === 0) {
      Alert.alert('No Nearby Mines', 'No other players have mines in this area yet. Check back as more players join!');
      return;
    }

    setFindingNearestTA(true);

    let nearest: GridSquare | null = null;
    let nearestDistKm = Infinity;

    for (const prop of visitableTAs) {
      const dLat = (prop.centerLat - userLocation.latitude) * Math.PI / 180;
      const dLng = (prop.centerLng - userLocation.longitude) * Math.PI / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(userLocation.latitude * Math.PI / 180) *
        Math.cos(prop.centerLat * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
      const dist = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (dist < nearestDistKm) {
        nearestDistKm = dist;
        nearest = prop;
      }
    }

    setFindingNearestTA(false);
    if (!nearest) return;

    mapRef.current?.animateToRegion({
      latitude: nearest.centerLat,
      longitude: nearest.centerLng,
      latitudeDelta: 0.002,
      longitudeDelta: 0.002,
    }, 800);

    const distMiles = nearestDistKm * 0.621371;
    const distLabel = distMiles < 0.1
      ? `${Math.round(distMiles * 5280)} ft away`
      : `${distMiles.toFixed(1)} mi away`;

    const ownerName = ownerCache.get(nearest.ownerId || '')?.nickname || 'another player';
    const mineName = `${nearest.mineType.charAt(0).toUpperCase() + nearest.mineType.slice(1)} Mine`;

    setTimeout(() => {
      Alert.alert(
        `⛏️ ${mineName}`,
        `Owned by ${ownerName} — ${distLabel}. Get directions to check in?`,
        [
          { text: 'No Thanks', style: 'cancel' },
          {
            text: 'Get Directions',
            onPress: () => {
              const url = `https://www.google.com/maps/dir/?api=1&destination=${nearest!.centerLat},${nearest!.centerLng}&travelmode=walking`;
              Linking.openURL(url).catch(() =>
                Alert.alert('Error', 'Could not open Maps.')
              );
            },
          },
        ]
      );
    }, 900);
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: userLocation?.latitude || 42.3601,
          longitude: userLocation?.longitude || -71.0589,
          latitudeDelta: 0.001,
          longitudeDelta: 0.001,
        }}
        showsUserLocation
        showsMyLocationButton
        followsUserLocation={false}
      >
        {Array.from(gridSquares.entries()).map(([squareId, square]) => (
          <Polygon
            key={`polygon-${squareId}`}
            coordinates={square.corners}
            fillColor={getSquareFillColor(square)}
            strokeColor={getSquareStrokeColor(square)}
            strokeWidth={2}
            tappable
            onPress={() => handleSquarePress(square)}
          />
        ))}
        
        {userLocation && (
          <Marker
            coordinate={{
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
            }}
            title="You are here"
            pinColor="blue"
          />
        )}
      </MapView>

      {/* Welcome Badge */}
      <View style={styles.welcomeBadge} pointerEvents="none">
        <Text style={styles.welcomeText}>Welcome, {username}!</Text>
      </View>

      {/* Earnings Counter — tap to open TB trade-in */}
      <TouchableOpacity
        style={styles.earningsDisplay}
        onPress={() => setShowTradeInModal(true)}
        activeOpacity={0.85}
      >
        <View style={styles.earningsInner}>
          <Text style={styles.earningsText}>
            ${(usdEarnings + currentEarnings).toFixed(6)} 📈
          </Text>
          <Text style={styles.earningsTapHint}>Tap to trade for TB</Text>
        </View>
      </TouchableOpacity>

      {/* TB Trade-In Modal */}
      <TBTradeInModal
        visible={showTradeInModal}
        onClose={() => setShowTradeInModal(false)}
        usdEarnings={usdEarnings + currentEarnings}
        userId={userId}
        onTradeComplete={(tbGained, usdSpent) => {
          // Deduct from local currentEarnings so display updates immediately
          setCurrentEarnings(prev => Math.max(0, prev - usdSpent));
          // Notify parent so the TB header updates immediately
          onTBUpdate?.(tbGained);
          setShowTradeInModal(false);
        }}
      />

      {/* Boost Button */}
      <TouchableOpacity 
        style={styles.boostButton}
        onPress={async () => {
          // Only refresh ad boost refill count — do NOT overwrite boostExpiresAt
          // as Firestore may not have committed the write yet on slower devices
          try {
            const refreshedState = await dbService.getBoostState(userId);
            setBoostState(prev => ({
              ...refreshedState,
              // Preserve local boostExpiresAt if it's further in the future than what Firestore returned
              boostExpiresAt: (prev.boostExpiresAt && (!refreshedState.boostExpiresAt || 
                new Date(prev.boostExpiresAt) > new Date(refreshedState.boostExpiresAt)))
                ? prev.boostExpiresAt
                : refreshedState.boostExpiresAt,
              boostTimeRemaining: prev.boostTimeRemaining,
              isBoostActive: prev.isBoostActive,
            }));
          } catch (error) {
            console.error('Error refreshing boost state:', error);
          }
          setShowBoostModal(true);
        }}
      >
        <View style={[styles.boostButtonInner, boostState.isBoostActive && styles.boostButtonActive]}>
          <Text style={styles.boostButtonText}>
            {boostState.isBoostActive 
              ? `⚡ Boost: ${formatTimeRemaining(boostState.boostTimeRemaining || 0)}`
              : '⚡ Get Boost'}
          </Text>
        </View>
      </TouchableOpacity>

      {/* TB Display */}
      <View style={styles.tbDisplay}>
        <Text style={styles.tbText}>💰 {userTB} TB</Text>
      </View>

      {/* Legend Toggle Button */}
      <TouchableOpacity
        style={styles.legendButton}
        onPress={() => setShowLegend(!showLegend)}
      >
        <Text style={styles.legendButtonText}>🗺 Legend</Text>
      </TouchableOpacity>

      {/* Referral Button */}
      <TouchableOpacity
        style={styles.referralButton}
        onPress={() => onNavigateToReferral?.()}
        activeOpacity={0.85}
      >
        <Text style={styles.referralButtonText}>🤝 Refer</Text>
      </TouchableOpacity>

      {/* Find Nearest TA Button */}
      {ownedProperties.length > 0 && (
        <TouchableOpacity
          style={styles.findTAButton}
          onPress={handleFindNearestTA}
          activeOpacity={0.85}
          disabled={findingNearestTA}
        >
          <Text style={styles.findTAButtonText}>
            {findingNearestTA ? '⏳' : '📍 Visit Mine'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Leaderboard Modal */}
      <LeaderboardModal
        visible={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
        currentUserId={userId}
      />

      {/* Leaderboard Button */}
      <TouchableOpacity
        style={styles.leaderboardButton}
        onPress={() => setShowLeaderboard(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.leaderboardButtonText}>🏆 Top 10</Text>
      </TouchableOpacity>

      {/* Legend Overlay */}
      {showLegend && (
        <View style={styles.legendPanel}>
          <Text style={styles.legendTitle}>Map Legend</Text>
          <View style={styles.legendRow}>
            <View style={[styles.legendSwatch, { backgroundColor: 'rgba(76, 175, 80, 0.3)', borderColor: '#4CAF50' }]} />
            <Text style={styles.legendLabel}>Available Property</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendSwatch, { backgroundColor: 'rgba(255, 152, 0, 0.6)', borderColor: '#E65100' }]} />
            <Text style={styles.legendLabel}>Owned by Others</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendSwatch, { backgroundColor: '#808080', borderColor: '#2196F3' }]} />
            <Text style={styles.legendLabel}>Your Rock Mine</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendSwatch, { backgroundColor: '#000000', borderColor: '#2196F3' }]} />
            <Text style={styles.legendLabel}>Your Coal Mine</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendSwatch, { backgroundColor: '#FFD700', borderColor: '#2196F3' }]} />
            <Text style={styles.legendLabel}>Your Gold Mine</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendSwatch, { backgroundColor: '#B9F2FF', borderColor: '#2196F3' }]} />
            <Text style={styles.legendLabel}>Your Diamond Mine</Text>
          </View>
        </View>
      )}

      {selectedSquare && (
        <View style={styles.infoPanel}>
          <Text style={styles.infoTitle}>
            {selectedSquare.isOwned
              ? (selectedSquare.customName || (selectedSquare.mineType?.toUpperCase() || 'UNKNOWN') + ' MINE')
              : 'Mine Available'}
          </Text>
          {selectedSquare.isOwned ? (
            <View>
              {/* ✅ AVATAR: Show owner avatar + nickname in mine panel */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                {selectedSquare.ownerId !== userId && (() => {
                  const cached = ownerCache.get(selectedSquare.ownerId || '');
                  return cached?.avatarUrl ? (
                    <Image
                      source={{ uri: cached.avatarUrl }}
                      style={{ width: 28, height: 28, borderRadius: 14, marginRight: 6, borderWidth: 1, borderColor: '#E65100' }}
                    />
                  ) : (
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#E65100', marginRight: 6, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>
                        {(ownerCache.get(selectedSquare.ownerId || '')?.nickname || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  );
                })()}
                <Text style={styles.usernameText}>
                  Owner: {selectedSquare.ownerId === userId
                    ? 'You'
                    : (ownerCache.get(selectedSquare.ownerId || '')?.nickname || 'Loading...')}
                </Text>
              </View>
              {selectedSquare.ownerId === userId && (
                <TouchableOpacity
                  style={styles.manageButton}
                  onPress={() => {
                    setSelectedSquare(null);
                    onNavigateToPropertyDetail?.(selectedSquare);
                  }}
                >
                  <Text style={styles.buttonText}>⛏️ Manage Property</Text>
                </TouchableOpacity>
              )}
              {selectedSquare.ownerId !== userId && (
                <>
                  <Text style={styles.infoText}>
                    {isAdjacentToUser(
                      userLocation?.latitude || 0,
                      userLocation?.longitude || 0,
                      selectedSquare
                    )
                      ? '✓ Within check-in range'
                      : '✗ Too far to check in'}
                  </Text>
                  <TouchableOpacity 
                    style={[
                      styles.checkInButton,
                      (!isAdjacentToUser(
                        userLocation?.latitude || 0,
                        userLocation?.longitude || 0,
                        selectedSquare
                      ) || !canCheckInToday(selectedSquare.id)) && styles.disabledButton
                    ]}
                    onPress={handleCheckIn}
                    disabled={
                      !isAdjacentToUser(
                        userLocation?.latitude || 0,
                        userLocation?.longitude || 0,
                        selectedSquare
                      ) || !canCheckInToday(selectedSquare.id)
                    }
                  >
                    <Text style={styles.buttonText}>
                      {canCheckInToday(selectedSquare.id) ? 'Check In' : 'Already Checked In Today'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.visitorLogButton}
                    onPress={() => {
                      setSelectedSquare(null);
                      onNavigateToVisitorLog?.(selectedSquare);
                    }}
                  >
                    <Text style={styles.buttonText}>📋 View Visitor Log</Text>
                  </TouchableOpacity>
                </>
              )}
              {selectedPropertyCheckIns.length > 0 && (
                <View style={styles.checkInHistory}>
                  <Text style={styles.historyTitle}>Recent Check-ins ({selectedPropertyCheckIns.length})</Text>
                  <ScrollView style={styles.checkInList} nestedScrollEnabled>
                    {selectedPropertyCheckIns.slice(-5).reverse().map(checkIn => (
                      <View key={checkIn.id} style={styles.checkInItem}>
                        <Text style={styles.checkInTime}>
                          {checkIn.timestamp.toLocaleTimeString()} {checkIn.hasPhoto && '📷'}
                        </Text>
                        {checkIn.message && (
                          <Text style={styles.checkInMessage}>{checkIn.message}</Text>
                        )}
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          ) : (
            <View>
              <Text style={styles.infoText}>Cost: 100 TB</Text>
              <Text style={styles.infoSubtext}>
                {isAdjacentToUser(userLocation?.latitude || 0, userLocation?.longitude || 0, selectedSquare)
                  ? '✓ Within purchase range'
                  : '✗ Too far to purchase'}
              </Text>
              <TouchableOpacity 
                style={[
                  styles.purchaseButton,
                  (userTB < 100 || !isAdjacentToUser(userLocation?.latitude || 0, userLocation?.longitude || 0, selectedSquare)) && styles.disabledButton
                ]}
                onPress={handlePurchaseProperty}
                disabled={userTB < 100 || !isAdjacentToUser(userLocation?.latitude || 0, userLocation?.longitude || 0, selectedSquare)}
              >
                <Text style={styles.buttonText}>Purchase Property</Text>
              </TouchableOpacity>
            </View>
          )}
          
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={() => setSelectedSquare(null)}
          >
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>
        </View>
      )}

      {showCheckInModal && selectedSquare && (
        <View style={styles.checkInModal}>
          <Text style={styles.modalTitle}>Check In</Text>
          <Text style={styles.modalSubtitle}>
            {selectedSquare.customName || (selectedSquare.mineType + ' mine')}
          </Text>
          {selectedSquare.greeting ? (
            <View style={{ backgroundColor: '#FFF8E1', borderRadius: 8, padding: 10, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#FFD700' }}>
              <Text style={{ fontSize: 13, color: '#555', fontStyle: 'italic' }}>
                {'"' + selectedSquare.greeting + '"'}
              </Text>
            </View>
          ) : null}
          
          <TextInput
            style={styles.messageInput}
            placeholder="Leave a message (optional, +2 TB)"
            value={checkInMessage}
            onChangeText={setCheckInMessage}
            multiline
            maxLength={200}
          />
          
          <View style={styles.modalButtons}>
            <TouchableOpacity 
              style={[styles.modalButton, isSubmittingCheckIn.current && styles.disabledButton]}
              onPress={() => submitCheckIn(false)}
              disabled={isSubmittingCheckIn.current}
            >
              <Text style={styles.buttonText}>Check In (1 TB{boostState.isBoostActive ? ' x2' : ''})</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.modalButton, styles.photoButton, isSubmittingCheckIn.current && styles.disabledButton]}
              onPress={() => submitCheckIn(true)}
              disabled={isSubmittingCheckIn.current}
            >
              <Text style={styles.buttonText}>📷 With Photo (+2 TB{boostState.isBoostActive ? ' x2' : ''})</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={() => {
              setShowCheckInModal(false);
              setCheckInMessage('');
            }}
          >
            <Text style={styles.buttonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Boost Modal */}
      <BoostModal
        visible={showBoostModal}
        onClose={() => setShowBoostModal(false)}
        onFreeBoost={handleFreeBoost}
        onAdBoost={handleAdBoost}
        freeBoostsRemaining={boostState.freeBoostsRemaining}
        adBoostsRemaining={boostState.adBoostsRemaining}
        boostTimeRemaining={boostState.boostTimeRemaining || 0}
        maxTotalBoostMinutes={480}
        nextResetTime={boostState.nextFreeBoostResetAt}
        lastAdBoostRefillAt={boostState.lastAdBoostRefillAt}
      />

      {/* ── Community Button (bottom-left floating) ─────────────────────── */}
      {/* ✅ FIX: Hide when any panel/modal is open so it doesn't render on
          top of property panels, check-in modals, or the boost modal.
          selectedSquare being non-null means a property panel is showing. */}
      {!selectedSquare && !showCheckInModal && !showBoostModal && !showCommunityModal && (
        <TouchableOpacity
          style={styles.communityButton}
          onPress={() => setShowCommunityModal(true)}
        >
          <Text style={styles.communityButtonText}>🌐 Community</Text>
        </TouchableOpacity>
      )}

      {/* ── Community Modal ──────────────────────────────────────────────── */}
      {showCommunityModal && (
        <View style={styles.communityModalOverlay}>
          <View style={styles.communityModal}>
            <Text style={styles.communityModalTitle}>🌍 TerraMine Community</Text>
            <Text style={styles.communityModalSubtitle}>
              Connect with other miners, share tips, and stay up to date!
            </Text>

            {/* Discord */}
            <TouchableOpacity
              style={[styles.communityLink, styles.discordLink]}
              onPress={() => Linking.openURL('https://discord.gg/MDJJCQU4C')}
            >
              <FontAwesome name="discord" size={26} color="white" style={styles.communityLinkIcon} />
              <View style={styles.communityLinkText}>
                <Text style={styles.communityLinkTitle}>Discord</Text>
                <Text style={styles.communityLinkDesc}>Chat, report bugs, suggest features</Text>
              </View>
              <Text style={styles.communityLinkArrow}>→</Text>
            </TouchableOpacity>

            {/* Facebook */}
            <TouchableOpacity
              style={[styles.communityLink, styles.facebookLink]}
              onPress={() => Linking.openURL('https://www.facebook.com/share/g/14dumrdaFMK/')}
            >
              <FontAwesome name="facebook" size={26} color="white" style={styles.communityLinkIcon} />
              <View style={styles.communityLinkText}>
                <Text style={styles.communityLinkTitle}>Facebook Group</Text>
                <Text style={styles.communityLinkDesc}>News, updates, and community posts</Text>
              </View>
              <Text style={styles.communityLinkArrow}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.communityCloseButton}
              onPress={() => setShowCommunityModal(false)}
            >
              <Text style={styles.communityCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  welcomeBadge: {
    position: 'absolute',
    bottom: 90,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  welcomeText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  earningsDisplay: {
    position: 'absolute',
    top: 85,
    left: 16,
    right: 0,
    alignItems: 'flex-start',
  },
  earningsInner: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    minWidth: 180,
    alignItems: 'center',
  },
  earningsText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  earningsTapHint: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  boostButton: {
    position: 'absolute',
    top: 160,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  boostButtonActive: {
    backgroundColor: '#FF9800',
  },
  boostButtonInner: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    minWidth: 160,
    alignItems: 'center',
  },
  boostButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tbDisplay: {
    position: 'absolute',
    top: 85,
    right: 16,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  tbText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  infoPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    maxHeight: '70%',
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 16,
    marginBottom: 5,
  },
  infoSubtext: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
  manageButton: {
    backgroundColor: '#92400E',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  purchaseButton: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
    alignItems: 'center',
  },
  checkInButton: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#cccccc',
  },
  closeButton: {
    backgroundColor: '#757575',
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkInHistory: {
    marginTop: 15,
    maxHeight: 200,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  checkInList: {
    maxHeight: 150,
  },
  checkInItem: {
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  checkInTime: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  checkInMessage: {
    fontSize: 14,
    color: '#333',
  },
  checkInModal: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 15,
  },
  messageInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 15,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  modalButton: {
    flex: 1,
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  photoButton: {
    backgroundColor: '#9C27B0',
  },
  cancelButton: {
    backgroundColor: '#757575',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  usernameText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 2,
  },
  legendButton: {
    position: 'absolute',
    bottom: 140,
    right: 16,
    backgroundColor: 'white',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  legendButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  findTAButton: {
    position: 'absolute',
    bottom: 244,
    right: 16,
    backgroundColor: '#1565C0',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  findTAButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'white',
  },
  leaderboardButton: {
    position: 'absolute',
    bottom: 296,
    right: 16,
    backgroundColor: '#1a3a1a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  leaderboardButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFD700',
  },
  referralButton: {
    position: 'absolute',
    bottom: 192,
    right: 16,
    backgroundColor: '#FFD700',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  referralButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A0900',
  },
  legendPanel: {
    position: 'absolute',
    bottom: 185,
    right: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    minWidth: 200,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
  },
  legendSwatch: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    marginRight: 10,
  },
  legendLabel: {
    fontSize: 13,
    color: '#444',
  },
  visitorLogButton: {
    backgroundColor: '#7B3FA0',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },

  // ── Community button (bottom-left floating) ──────────────────────────────
  communityButton: {
    position: 'absolute',
    bottom: 140,
    left: 16,
    backgroundColor: '#1565C0',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  communityButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'white',
  },

  // ── Community modal ───────────────────────────────────────────────────────
  communityModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  communityModal: {
    backgroundColor: '#1A0F00',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 24,
    width: '88%',
    borderWidth: 1,
    borderColor: '#6D4C1F',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },
  communityModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
    marginBottom: 6,
  },
  communityModalSubtitle: {
    fontSize: 13,
    color: '#AAA',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  communityLink: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  discordLink: {
    backgroundColor: '#5865F2',
  },
  facebookLink: {
    backgroundColor: '#1877F2',
  },
  communityLinkIcon: {
    marginRight: 12,
  },
  communityLinkText: {
    flex: 1,
  },
  communityLinkTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: 'white',
  },
  communityLinkDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  communityLinkArrow: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: 'bold',
  },
  communityCloseButton: {
    marginTop: 4,
    backgroundColor: '#3A2000',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6D4C1F',
  },
  communityCloseButtonText: {
    color: '#CCC',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default MapScreen;
