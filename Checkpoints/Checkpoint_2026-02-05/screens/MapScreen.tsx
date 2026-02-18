import React, { useState, useEffect, useRef, useImperativeHandle } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, ScrollView, TextInput } from 'react-native';
import MapView, { Polygon, PROVIDER_GOOGLE, Marker } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import { LocationService, Coordinates } from '../services/LocationService';
import { DatabaseService } from '../services/DatabaseService';
import { generateGridSquare, getVisibleGridSquares, isWithinGridSquare, isAdjacentToUser, GridSquare, gridToLatLng } from '../utils/GridUtils';
import BoostModal from '../components/BoostModal';

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
  initialBoostState: {
    freeBoostsRemaining: number;
    adBoostsUsed: number;
    boostExpiresAt: string | null;
    nextFreeBoostResetAt: string | null;
  };
  onPropertyPurchase: (property: GridSquare, tbSpent: number) => void;
  onCheckIn: (propertyId: string, tbEarned: number, propertyOwnerId: string, message?: string, hasPhoto?: boolean, photoUri?: string, visitorNickname?: string) => Promise<void>;
  onBoostUpdate: (boostData: any) => void;
  onEarningsUpdate?: (usdAmount: number) => Promise<void>;
  usdEarnings?: number;
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
  const [boostState, setBoostState] = useState({
    freeBoostsRemaining: initialBoostState.freeBoostsRemaining,
    adBoostsUsed: initialBoostState.adBoostsUsed,
    boostExpiresAt: initialBoostState.boostExpiresAt,
    nextFreeBoostResetAt: initialBoostState.nextFreeBoostResetAt,
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

  // Expose method to navigate to property from Profile screen
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
          adBoostsUsed: boostState.adBoostsUsed,
          boostExpiresAt: null,
          nextFreeBoostResetAt: boostState.nextFreeBoostResetAt,
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

      if (now >= resetAt) {
        const newState = {
          freeBoostsRemaining: 4,
          adBoostsUsed: boostState.adBoostsUsed,
          boostExpiresAt: boostState.boostExpiresAt,
          nextFreeBoostResetAt: null,
        };
        setBoostState(prev => ({ ...prev, ...newState }));
        dbService.updateBoostState(userId, newState);
      }
    };

    checkResetTimer();
    const interval = setInterval(checkResetTimer, 60000);
    return () => clearInterval(interval);
  }, [boostState.nextFreeBoostResetAt]);

  // Earnings update timer - updates every 100ms
  useEffect(() => {
    if (ownedProperties.length > 0) {
      let lastSaveTime = Date.now();
      
      earningsTimerRef.current = setInterval(() => {
        const now = new Date();
        const elapsedSeconds = (now.getTime() - earningsStartTime.current.getTime()) / 1000;
        const newEarnings = calculateEarnings() * (elapsedSeconds / 60);
        
        setCurrentEarnings(newEarnings);
        
        // Save to Firebase every minute
        const timeSinceLastSave = Date.now() - lastSaveTime;
        if (timeSinceLastSave >= 60000) {
          saveEarningsToFirebase(newEarnings);
          lastSaveTime = Date.now();
        }
      }, 100);

      return () => {
        if (earningsTimerRef.current) {
          clearInterval(earningsTimerRef.current);
          if (currentEarnings > 0) {
            saveEarningsToFirebase(currentEarnings);
          }
        }
      };
    }
  }, [ownedProperties, currentEarnings, boostState.isBoostActive]);

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
      console.log(`Saving $${earnings.toFixed(8)} USD earnings to Firebase`);
      
      if (onEarningsUpdate) {
        await onEarningsUpdate(earnings);
        earningsStartTime.current = new Date();
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
        // Save any remaining earnings
        if (currentEarnings > 0) {
          saveEarningsToFirebase(currentEarnings);
        }
      }
      // Save logout time to Firebase for offline earnings calculation
      saveLastActiveTime();
    };
  }, []);

  // Calculate and apply offline earnings when component mounts
  useEffect(() => {
    if (ownedProperties.length > 0 && initialBoostState) {
      calculateOfflineEarnings();
    }
  }, [ownedProperties.length]); // Only run once when properties load

  const calculateOfflineEarnings = async () => {
    try {
      // Get the last logout time from Firebase (we'll need to add this field)
      const userData = await dbService.getUserData(userId);
      const lastActiveAt = userData?.lastActiveAt ? new Date(userData.lastActiveAt) : null;
      
      if (!lastActiveAt) {
        // First time login or no previous session, start fresh
        earningsStartTime.current = new Date();
        return;
      }

      const now = new Date();
      const offlineSeconds = Math.floor((now.getTime() - lastActiveAt.getTime()) / 1000);
      
      if (offlineSeconds < 60) {
        // Less than a minute offline, just continue
        earningsStartTime.current = new Date();
        return;
      }

      console.log(`User was offline for ${(offlineSeconds / 60).toFixed(1)} minutes`);

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

      // Calculate how much time was boosted during offline period
      let boostedSeconds = 0;
      let unboostedSeconds = offlineSeconds;

      if (initialBoostState.boostExpiresAt) {
        const boostExpiry = new Date(initialBoostState.boostExpiresAt);
        
        // If boost was active during offline time
        if (boostExpiry > lastActiveAt) {
          // Calculate how much of the offline time had boost active
          const boostActiveUntil = boostExpiry < now ? boostExpiry : now;
          boostedSeconds = Math.floor((boostActiveUntil.getTime() - lastActiveAt.getTime()) / 1000);
          unboostedSeconds = offlineSeconds - boostedSeconds;
        }
      }

      // Calculate earnings: boosted time at 2x, rest at 1x
      const boostedEarnings = totalRentPerSecond * (boostedSeconds / 60) * 60 * 2; // per minute * minutes * 2x
      const unboostedEarnings = totalRentPerSecond * (unboostedSeconds / 60) * 60; // per minute * minutes
      const totalOfflineEarnings = boostedEarnings + unboostedEarnings;

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
    } catch (error) {
      console.error('Error calculating offline earnings:', error);
      earningsStartTime.current = new Date();
    }
  };

  useEffect(() => {
    if (userLocation) {
      loadNearbyProperties(userLocation);
    }
  }, [ownedProperties]);

  useEffect(() => {
    if (userLocation && allProperties.length >= 0) {
      loadNearbyProperties(userLocation);
    }
  }, [allProperties]);

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
    setSelectedSquare(square);
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
    
    if (withPhoto) {
      photoUri = await takePhoto();
      if (!photoUri) {
        return;
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
        photoUri || undefined,
        username
      );
      
      Alert.alert('Success!', `Check-in complete! You earned ${tbEarned} TB${boostState.isBoostActive ? ' (2x boost!)' : ''}. The owner earned 1 TB.`);
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
    if (boostState.freeBoostsRemaining <= 0) {
      Alert.alert('No Free Boosts', 'You have no free boosts remaining.');
      return;
    }

    const MAX_BOOST_MINUTES = 480;
    if (boostState.boostTimeRemaining >= MAX_BOOST_MINUTES) {
      Alert.alert('Max Boost Reached', 'You have reached the maximum boost time of 8 hours.');
      return;
    }

    try {
      const now = new Date();
      const newExpiresAt = boostState.boostExpiresAt 
        ? new Date(new Date(boostState.boostExpiresAt).getTime() + 30 * 60 * 1000)
        : new Date(now.getTime() + 30 * 60 * 1000);
      
      const newFreeBoosts = boostState.freeBoostsRemaining - 1;
      let resetAt = boostState.nextFreeBoostResetAt;
      
      if (newFreeBoosts === 0 && !resetAt) {
        resetAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
      }
      
      const newState = {
        freeBoostsRemaining: newFreeBoosts,
        adBoostsUsed: boostState.adBoostsUsed,
        boostExpiresAt: newExpiresAt.toISOString(),
        nextFreeBoostResetAt: resetAt,
      };
      
      await dbService.updateBoostState(userId, newState);
      setBoostState(prev => ({ ...prev, ...newState }));
      onBoostUpdate(newState);
      setShowBoostModal(false);
      Alert.alert('Boost Activated!', '+30 minutes of 2x earnings!');
    } catch (error) {
      console.error('Error activating free boost:', error);
      Alert.alert('Error', 'Failed to activate boost. Please try again.');
    }
  };

  const handleAdBoost = async () => {
    const MAX_AD_BOOSTS = 12;
    const MAX_BOOST_MINUTES = 480;

    if (boostState.adBoostsUsed >= MAX_AD_BOOSTS) {
      Alert.alert('No Ad Boosts', 'You have used all 12 ad boosts.');
      return;
    }

    if (boostState.boostTimeRemaining >= MAX_BOOST_MINUTES) {
      Alert.alert('Max Boost Reached', 'You have reached the maximum boost time of 8 hours.');
      return;
    }

    try {
      const now = new Date();
      const newExpiresAt = boostState.boostExpiresAt 
        ? new Date(new Date(boostState.boostExpiresAt).getTime() + 30 * 60 * 1000)
        : new Date(now.getTime() + 30 * 60 * 1000);
      
      const newState = {
        freeBoostsRemaining: boostState.freeBoostsRemaining,
        adBoostsUsed: boostState.adBoostsUsed + 1,
        boostExpiresAt: newExpiresAt.toISOString(),
        nextFreeBoostResetAt: boostState.nextFreeBoostResetAt,
      };
      
      await dbService.updateBoostState(userId, newState);
      setBoostState(prev => ({ ...prev, ...newState }));
      onBoostUpdate(newState);
      Alert.alert('Boost Activated!', '+30 minutes of 2x earnings from ad!');
    } catch (error) {
      console.error('Error activating ad boost:', error);
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

  const getMineColor = (mineType?: string): string => {
    switch (mineType) {
      case 'rock': return '#808080';
      case 'coal': return '#000000';
      case 'gold': return '#FFD700';
      case 'diamond': return '#B9F2FF';
      default: return '#4CAF50';
    }
  };

  const getSquareFillColor = (square: GridSquare): string => {
    if (square.isOwned) {
      return getMineColor(square.mineType);
    }
    return 'rgba(76, 175, 80, 0.3)';
  };

  const getSquareStrokeColor = (square: GridSquare): string => {
    if (square.isOwned) {
      if (square.ownerId === userId) {
        return '#2196F3';
      } else {
        return '#FF9800';
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
      <View style={styles.welcomeBadge}>
        <Text style={styles.welcomeText}>Welcome, {username}!</Text>
      </View>

      {/* Earnings Counter */}
      <View style={styles.earningsDisplay}>
        <Text style={styles.earningsText}>
          ${(usdEarnings + currentEarnings).toFixed(8)} 📈
        </Text>
      </View>

      {/* Boost Button */}
      <TouchableOpacity 
        style={[
          styles.boostButton,
          boostState.isBoostActive && styles.boostButtonActive
        ]}
        onPress={() => setShowBoostModal(true)}
      >
        <Text style={styles.boostButtonText}>
          {boostState.isBoostActive 
            ? `⚡ Boost: ${formatTimeRemaining(boostState.boostTimeRemaining)}`
            : '⚡ Get Boost'}
        </Text>
      </TouchableOpacity>

      {/* TB Display */}
      <View style={styles.tbDisplay}>
        <Text style={styles.tbText}>💰 {userTB} TB</Text>
      </View>

      {selectedSquare && (
        <View style={styles.infoPanel}>
          <Text style={styles.infoTitle}>
            {selectedSquare.mineType?.toUpperCase() || 'UNOWNED'} MINE
          </Text>
          {selectedSquare.isOwned ? (
            <View>
              <Text style={styles.usernameText}>
                Owner: {selectedSquare.ownerId === userId ? 'You' : selectedSquare.ownerId}
              </Text>
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
        adBoostsUsed={boostState.adBoostsUsed}
        boostTimeRemaining={boostState.boostTimeRemaining}
        maxTotalBoostMinutes={480}
        nextResetTime={boostState.nextFreeBoostResetAt}
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
    top: 250,
    left: 35,
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  welcomeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  earningsDisplay: {
    position: 'absolute',
    top: 85,
    alignSelf: 'center',
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
    alignSelf: 'center',
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
  },
  boostButtonActive: {
    backgroundColor: '#FF9800',
  },
  boostButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tbDisplay: {
    position: 'absolute',
    top: 250,
    right: 35,
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
    fontSize: 18,
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
