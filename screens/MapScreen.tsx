import React, { useState, useEffect, useRef, useImperativeHandle } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, ScrollView, TextInput } from 'react-native';
import MapView, { Polygon, PROVIDER_GOOGLE, Marker } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import { LocationService, Coordinates } from '../services/LocationService';
import { DatabaseService, BoostState } from '../services/DatabaseService';
import { generateGridSquare, getVisibleGridSquares, isWithinGridSquare, isAdjacentToUser, GridSquare, gridToLatLng } from '../utils/GridUtils';
import BoostModal from '../components/BoostModal';
import { soundService } from '../services/SoundService';

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
  onCheckIn: (propertyId: string, tbEarned: number, propertyOwnerId: string, message?: string, hasPhoto?: boolean, photoUri?: string, visitorNickname?: string) => Promise<void>;
  onBoostUpdate: (boostData: any) => void;
  onEarningsUpdate?: (usdAmount: number) => Promise<void>;
  usdEarnings?: number;
  onNavigateToPropertyDetail?: (property: GridSquare) => void;
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
  usdEarnings = 0,
  onNavigateToPropertyDetail,
}, ref) => {
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [gridSquares, setGridSquares] = useState<Map<string, GridSquare>>(new Map());
  const [selectedSquare, setSelectedSquare] = useState<GridSquare | null>(null);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [checkInMessage, setCheckInMessage] = useState('');
  const [lastCheckIns, setLastCheckIns] = useState<Map<string, string>>(new Map());
  const [propertyCheckIns, setPropertyCheckIns] = useState<Map<string, CheckIn[]>>(new Map());
  
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

  // Update boost timer
  useEffect(() => {
    const updateBoostTimer = () => {
      if (!boostState.boostExpiresAt) {
        setBoostState(prev => ({ ...prev, boostTimeRemaining: 0, isBoostActive: false }));
        return;
      }

      const now = new Date();
      const expiresAt = new Date(boostState.boostExpiresAt);
      const diffMs = expiresAt.getTime() - now.getTime();
      const diffMinutes = Math.max(0, diffMs / (1000 * 60));

      if (diffMinutes <= 0) {
        setBoostState(prev => ({ 
          ...prev, 
          boostTimeRemaining: 0, 
          isBoostActive: false,
          boostExpiresAt: null 
        }));
        dbService.updateBoostState(userId, {
          freeBoostsRemaining: boostState.freeBoostsRemaining,
          adBoostsRemaining: boostState.adBoostsRemaining,
          boostExpiresAt: null,
          nextFreeBoostResetAt: boostState.nextFreeBoostResetAt,
          lastAdBoostRefillAt: boostState.lastAdBoostRefillAt,
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
  }, [boostState.boostExpiresAt]);

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
        setBoostState(state);
        console.log('📊 Initial boost state loaded:', state);
      } catch (error) {
        console.error('Error loading boost state:', error);
      }
    };

    loadBoostState();
    // DON'T set up interval - it causes race conditions
    // The boost handlers will update state directly
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

    const multiplier = boostState.isBoostActive ? 2 : 1;
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
      if (offlineSeconds > MAX_OFFLINE_SECONDS) {
        console.log(`Offline time capped from ${(offlineSeconds/3600).toFixed(1)}h to 24h for earnings`);
      }
      console.log(`User was offline for ${(offlineSeconds / 60).toFixed(1)} minutes (earning for ${(cappedSeconds/60).toFixed(1)} min)`);

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

      // Calculate earnings: boosted time at 2x, rest at 1x
      const boostedEarnings = totalRentPerSecond * (boostedSeconds / 60) * 60 * 2; // per minute * minutes * 2x
      const unboostedEarnings = totalRentPerSecond * (unboostedSeconds / 60) * 60; // per minute * minutes
      const totalOfflineEarnings = boostedEarnings + unboostedEarnings;

      // Update lastActiveAt NOW before saving earnings
      // This prevents any re-fire of calculateOfflineEarnings from using the same old timestamp
      await saveLastActiveTime();

      if (totalOfflineEarnings > 0) {
        console.log(`Offline earnings calculated:`, {
          offlineMinutes: (offlineSeconds / 60).toFixed(1),
          boostedMinutes: (boostedSeconds / 60).toFixed(1),
          unboostedMinutes: (unboostedSeconds / 60).toFixed(1),
          earnings: `$${totalOfflineEarnings.toFixed(8)}`
        });

        // Save offline earnings to Firebase
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
    if (userLocation && allProperties.length > 0) {
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

  const initializeLocation = async () => {
    const location = await locationService.getCurrentLocation();
    if (location) {
      setUserLocation(location);
      loadNearbyProperties(location);
      
      locationService.startWatchingLocation((newLocation) => {
        setUserLocation(newLocation);
        loadNearbyProperties(newLocation);
      });
    }
  };

  const loadNearbyProperties = async (location: Coordinates) => {
    const visibleGridIds = getVisibleGridSquares(location.latitude, location.longitude, 500);
    const newGridSquares = new Map<string, GridSquare>();
    
    visibleGridIds.forEach(gridId => {
      const [x, y] = gridId.split('_').map(Number);
      
      const ownedProperty = allProperties.find(p => p.id === gridId);
      if (ownedProperty) {
        newGridSquares.set(gridId, ownedProperty);
      } else {
        const existingSquare = gridSquares.get(gridId);
        if (existingSquare && existingSquare.isOwned) {
          newGridSquares.set(gridId, existingSquare);
        } else {
          const center = gridToLatLng(x, y, location.latitude);
          const square = generateGridSquare(center.latitude, center.longitude);
          newGridSquares.set(gridId, square);
        }
      }
    });
    
    setGridSquares(newGridSquares);
  };

  const handleSquarePress = (square: GridSquare) => {
    // If this is one of the user's own properties, use the enriched version
    // from ownedProperties which includes customName
    const enriched = ownedProperties.find(p => p.id === square.id);
    setSelectedSquare(enriched || square);
    setShowCheckInModal(false);
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
    
    if (!isWithinGridSquare(userLocation.latitude, userLocation.longitude, selectedSquare)) {
      Alert.alert('Too Far', 'You must be within the property boundaries to check in.');
      return;
    }
    
    if (!canCheckInToday(selectedSquare.id)) {
      Alert.alert('Already Checked In', 'You can only check in once per day (EST timezone).');
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
    
    const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
    setLastCheckIns(prev => new Map(prev).set(selectedSquare.id, today));
    
    let tbEarned = 1;
    if (checkInMessage.trim()) tbEarned += 2;
    if (photoUri) tbEarned += 2;
    
    // Apply boost multiplier
    if (boostState.isBoostActive) {
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
        username
      );
      
      const boostText = boostState.isBoostActive ? ' (2x Boost Applied!)' : '';
      Alert.alert('Success!', `Check-in complete! You earned ${tbEarned} TB${boostText}. The owner earned 1 TB.`);
      setCheckInMessage('');
      setShowCheckInModal(false);
    } catch (error) {
      console.error('Check-in error:', error);
      Alert.alert('Error', 'Failed to save check-in');
    }
  };

  const handlePurchaseProperty = async () => {
    if (!selectedSquare || !userLocation) return;
    
    if (userTB < 100) {
      Alert.alert('Insufficient TB', 'You need 100 TB to purchase a property.');
      return;
    }
    
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
    
    const mineType = assignMineType();
    const updatedSquare = {
      ...selectedSquare,
      isOwned: true,
      ownerId: userId,
      mineType,
    };
    
    onPropertyPurchase(updatedSquare, 100);
    soundService.play('purchase');
    
    setGridSquares(prev => {
      const updated = new Map(prev);
      updated.set(selectedSquare.id, updatedSquare);
      return updated;
    });
    
    setSelectedSquare(updatedSquare);
    
    Alert.alert('Success!', `You purchased a ${mineType} mine!`);
  };

  // Boost handlers
  const handleFreeBoost = async () => {
    // Now handled by DatabaseService.useFreeBoost() method
    try {
      const newState = await dbService.useFreeBoost(userId, boostState);
      setBoostState(newState);
      onBoostUpdate(newState);
      setShowBoostModal(false);
      Alert.alert('Boost Activated!', '+30 minutes of 2x earnings!');
    } catch (error) {
      console.error('Error activating free boost:', error);
      Alert.alert('Error', 'Failed to activate boost. Please try again.');
    }
  };

  const handleAdBoost = async () => {
    // This is now handled by the DatabaseService.useAdBoost() method
    console.log('🎬 Ad boost clicked. Current state:', {
      adBoostsRemaining: boostState.adBoostsRemaining,
      boostExpiresAt: boostState.boostExpiresAt,
    });
    
    try {
      const newState = await dbService.useAdBoost(userId, boostState);
      console.log('✅ Ad boost activated. New state:', {
        adBoostsRemaining: newState.adBoostsRemaining,
        boostExpiresAt: newState.boostExpiresAt,
      });
      
      setBoostState(newState);
      onBoostUpdate(newState);
      setShowBoostModal(false);
      Alert.alert('Boost Activated!', `+30 minutes of 2x earnings from ad! (${newState.adBoostsRemaining}/12 remaining)`);
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

      {/* Earnings Counter */}
      <View style={styles.earningsDisplay}>
        <View style={styles.earningsInner}>
          <Text style={styles.earningsText}>
            ${(usdEarnings + currentEarnings).toFixed(6)} 📈
          </Text>
        </View>
      </View>

      {/* Boost Button */}
      <TouchableOpacity 
        style={styles.boostButton}
        onPress={async () => {
          // Check for ad boost refills before opening modal
          try {
            const refreshedState = await dbService.getBoostState(userId);
            setBoostState(refreshedState);
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

      {selectedSquare && (
        <View style={styles.infoPanel}>
          <Text style={styles.infoTitle}>
            {selectedSquare.customName || (selectedSquare.mineType?.toUpperCase() || 'UNOWNED') + ' MINE'}
          </Text>
          {selectedSquare.isOwned ? (
            <View>
              <Text style={styles.usernameText}>
                Owner: {selectedSquare.ownerId === userId ? 'You' : selectedSquare.ownerId}
              </Text>
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
                    {isWithinGridSquare(
                      userLocation?.latitude || 0,
                      userLocation?.longitude || 0,
                      selectedSquare
                    )
                      ? '✓ You are within property'
                      : '✗ Too far to check in'}
                  </Text>
                  <TouchableOpacity 
                    style={[
                      styles.checkInButton,
                      (!isWithinGridSquare(
                        userLocation?.latitude || 0,
                        userLocation?.longitude || 0,
                        selectedSquare
                      ) || !canCheckInToday(selectedSquare.id)) && styles.disabledButton
                    ]}
                    onPress={handleCheckIn}
                    disabled={
                      !isWithinGridSquare(
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
            Checking in to {selectedSquare.mineType} mine
          </Text>
          
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
              style={styles.modalButton}
              onPress={() => submitCheckIn(false)}
            >
              <Text style={styles.buttonText}>Check In (1 TB{boostState.isBoostActive ? ' x2' : ''})</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.modalButton, styles.photoButton]}
              onPress={() => submitCheckIn(true)}
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
});

export default MapScreen;
