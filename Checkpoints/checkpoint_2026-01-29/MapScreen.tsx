import React, { useState, useEffect, useRef, useImperativeHandle } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, ScrollView, TextInput, Modal } from 'react-native';
import MapView, { Polygon, PROVIDER_GOOGLE, Marker } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import { LocationService, Coordinates } from '../services/LocationService';
import { DatabaseService } from '../services/DatabaseService';
import { generateGridSquare, getVisibleGridSquares, isWithinGridSquare, isAdjacentToUser, GridSquare, gridToLatLng } from '../utils/GridUtils';

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
  usdEarnings: number;
  ownedProperties: GridSquare[];
  allProperties: GridSquare[];
  initialBoostState?: {
    freeBoostsRemaining: number;
    boostExpiresAt: string | null;
    nextFreeBoostResetAt: string | null;
  };
  onPropertyPurchase: (property: GridSquare, tbSpent: number) => void;
  onCheckIn: (propertyId: string, tbEarned: number, propertyOwnerId: string, message?: string, hasPhoto?: boolean, photoUri?: string, visitorNickname?: string) => Promise<void>;
  onEarningsUpdate?: (tbEarned: number) => Promise<void>;
}

const MapScreen = React.forwardRef<any, MapScreenProps>(({ 
  userId,
  username,
  userTB,
  usdEarnings,
  ownedProperties,
  allProperties,
  initialBoostState,
  onPropertyPurchase,
  onCheckIn,
  onEarningsUpdate
}, ref) => {
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [gridSquares, setGridSquares] = useState<Map<string, GridSquare>>(new Map());
  const [selectedSquare, setSelectedSquare] = useState<GridSquare | null>(null);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [checkInMessage, setCheckInMessage] = useState('');
  const [lastCheckIns, setLastCheckIns] = useState<Map<string, string>>(new Map());
  const [propertyCheckIns, setPropertyCheckIns] = useState<Map<string, CheckIn[]>>(new Map());
  
  // Earning Boost states
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [freeBoostsRemaining, setFreeBoostsRemaining] = useState(4);
  const [boostActive, setBoostActive] = useState(false);
  const [boostTimeRemaining, setBoostTimeRemaining] = useState(0); // in seconds
  const [nextFreeBoostTime, setNextFreeBoostTime] = useState<Date | null>(null);
  const [currentEarnings, setCurrentEarnings] = useState(0);
  
  const mapRef = useRef<MapView>(null);
  const locationService = useRef(new LocationService()).current;
  const dbService = useRef(new DatabaseService()).current;
  const boostTimerRef = useRef<NodeJS.Timeout | null>(null);
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

  useEffect(() => {
    if (userLocation) {
      loadNearbyProperties(userLocation);
    }
  }, [userLocation]);
  
  useEffect(() => {
    initializeLocation();
    earningsStartTime.current = new Date();
    
    return () => {
      locationService.stopWatchingLocation();
      if (boostTimerRef.current) {
        clearInterval(boostTimerRef.current);
      }
      if (earningsTimerRef.current) {
        clearInterval(earningsTimerRef.current);
      }
    };
  }, []);

  // Load boost data when initialBoostState is available
  useEffect(() => {
    loadBoostData();
  }, [initialBoostState]);

  // Update grid squares when owned properties change
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

  // Boost timer effect
  useEffect(() => {
    if (boostActive && boostTimeRemaining > 0) {
      let lastSaveTime = Date.now();
      
      boostTimerRef.current = setInterval(() => {
        setBoostTimeRemaining(prev => {
          if (prev <= 1) {
            setBoostActive(false);
            saveBoostData();
            if (boostTimerRef.current) {
              clearInterval(boostTimerRef.current);
            }
            return 0;
          }
          
          // Save to Firebase every 30 seconds
          const timeSinceLastSave = Date.now() - lastSaveTime;
          if (timeSinceLastSave >= 30000) {
            saveBoostData();
            lastSaveTime = Date.now();
          }
          
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (boostTimerRef.current) {
          clearInterval(boostTimerRef.current);
        }
        // Save when component unmounts (user logs out)
        saveBoostData();
      };
    }
  }, [boostActive, boostTimeRemaining]);

  // Free boost reset timer
  useEffect(() => {
    if (nextFreeBoostTime && freeBoostsRemaining < 4) {
      const checkResetTimer = setInterval(() => {
        const now = new Date();
        if (now >= nextFreeBoostTime) {
          setFreeBoostsRemaining(4);
          setNextFreeBoostTime(null);
          saveBoostData();
        }
      }, 60000); // Check every minute

      return () => clearInterval(checkResetTimer);
    }
  }, [nextFreeBoostTime, freeBoostsRemaining]);

  // Earnings update timer - updates every 100ms, saves to Firebase every minute
  useEffect(() => {
    if (ownedProperties.length > 0) {
      let lastSaveTime = Date.now();
      
      earningsTimerRef.current = setInterval(() => {
        const now = new Date();
        const elapsedSeconds = (now.getTime() - earningsStartTime.current.getTime()) / 1000;
        const newEarnings = calculateEarnings() * (elapsedSeconds / 60); // earnings per minute * elapsed minutes
        
        // Add to the total USD earnings from Firebase
        setCurrentEarnings(newEarnings);
        
        // Save to Firebase every minute
        const timeSinceLastSave = Date.now() - lastSaveTime;
        if (timeSinceLastSave >= 60000) { // 60 seconds
          saveEarningsToFirebase(newEarnings);
          lastSaveTime = Date.now();
        }
      }, 100); // Update every 100ms for smooth animation

      return () => {
        if (earningsTimerRef.current) {
          clearInterval(earningsTimerRef.current);
          // Save any remaining earnings when component unmounts
          if (currentEarnings > 0) {
            saveEarningsToFirebase(currentEarnings);
          }
        }
      };
    }
  }, [ownedProperties, currentEarnings]);

  const saveEarningsToFirebase = async (earnings: number) => {
    if (earnings <= 0) return;
    
    try {
      // Save earnings as real USD money (not converting to TB)
      console.log(`Saving $${earnings.toFixed(8)} USD earnings to Firebase`);
      
      if (onEarningsUpdate) {
        // Pass the USD amount to be saved
        await onEarningsUpdate(earnings);
        
        // Reset the timer but keep displaying the total
        earningsStartTime.current = new Date();
      }
    } catch (error) {
      console.error('Error saving earnings to Firebase:', error);
    }
  };

  const loadBoostData = () => {
    if (!initialBoostState) {
      // No boost state from Firebase, use defaults
      setFreeBoostsRemaining(4);
      setBoostActive(false);
      setBoostTimeRemaining(0);
      return;
    }

    // Restore boost state from Firebase
    setFreeBoostsRemaining(initialBoostState.freeBoostsRemaining);

    // Check if boost is still active
    if (initialBoostState.boostExpiresAt) {
      const expiresAt = new Date(initialBoostState.boostExpiresAt);
      const now = new Date();
      
      if (now < expiresAt) {
        // Boost is still active
        const remainingSeconds = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
        setBoostActive(true);
        setBoostTimeRemaining(remainingSeconds);
      } else {
        // Boost expired while offline
        setBoostActive(false);
        setBoostTimeRemaining(0);
        saveBoostData(); // Clear expired boost from Firebase
      }
    }

    // Restore next free boost reset time
    if (initialBoostState.nextFreeBoostResetAt) {
      const resetAt = new Date(initialBoostState.nextFreeBoostResetAt);
      const now = new Date();
      
      if (now < resetAt) {
        setNextFreeBoostTime(resetAt);
      } else {
        // Reset time passed while offline
        setFreeBoostsRemaining(4);
        setNextFreeBoostTime(null);
        saveBoostData();
      }
    }
  };

  const saveBoostData = async () => {
    try {
      const boostExpiresAt = boostActive && boostTimeRemaining > 0
        ? new Date(Date.now() + boostTimeRemaining * 1000).toISOString()
        : null;
      
      const nextFreeBoostResetAt = nextFreeBoostTime
        ? nextFreeBoostTime.toISOString()
        : null;

      await dbService.updateBoostState(userId, {
        freeBoostsRemaining,
        boostExpiresAt,
        nextFreeBoostResetAt,
      });

      console.log('Boost state saved to Firebase:', {
        freeBoostsRemaining,
        boostExpiresAt,
        nextFreeBoostResetAt,
      });
    } catch (error) {
      console.error('Error saving boost data:', error);
    }
  };

  const activateFreeBoost = async () => {
    if (freeBoostsRemaining <= 0) {
      Alert.alert('No Free Boosts', 'You have no free boosts remaining. Wait for the timer to reset or watch an ad.');
      return;
    }

    const MAX_BOOST_TIME = 8 * 60 * 60; // 8 hours in seconds
    const BOOST_DURATION = 30 * 60; // 30 minutes in seconds
    
    // Calculate new boost time (add 30 minutes to existing time)
    const newBoostTime = Math.min(boostTimeRemaining + BOOST_DURATION, MAX_BOOST_TIME);
    
    if (boostTimeRemaining >= MAX_BOOST_TIME) {
      Alert.alert('Max Boost Time', 'You already have the maximum boost time of 8 hours!');
      return;
    }
    
    const timeAdded = newBoostTime - boostTimeRemaining;
    const minutesAdded = Math.floor(timeAdded / 60);
    const newFreeBoosts = freeBoostsRemaining - 1;

    // Calculate next free boost reset time if this will be the last boost
    let newResetTime = nextFreeBoostTime;
    if (freeBoostsRemaining === 1) {
      const resetTime = new Date();
      resetTime.setHours(resetTime.getHours() + 6); // Reset in 6 hours
      newResetTime = resetTime;
      setNextFreeBoostTime(resetTime);
    }

    // Update state
    setFreeBoostsRemaining(newFreeBoosts);
    setBoostActive(true);
    setBoostTimeRemaining(newBoostTime);
    
    // Save to Firebase with the NEW values
    try {
      const boostExpiresAt = new Date(Date.now() + newBoostTime * 1000).toISOString();
      const nextFreeBoostResetAt = newResetTime ? newResetTime.toISOString() : null;

      await dbService.updateBoostState(userId, {
        freeBoostsRemaining: newFreeBoosts,
        boostExpiresAt,
        nextFreeBoostResetAt,
      });

      console.log('Boost state saved to Firebase:', {
        freeBoostsRemaining: newFreeBoosts,
        boostExpiresAt,
        nextFreeBoostResetAt,
      });
    } catch (error) {
      console.error('Error saving boost data:', error);
    }
    
    setShowBoostModal(false);
    Alert.alert('Boost Activated!', `Added ${minutesAdded} minutes! Total boost time: ${formatBoostTime(newBoostTime)}\n\nYou will earn 2x earnings!`);
  };

  const activateAdBoost = () => {
    // TODO: Implement ad watching
    Alert.alert('Coming Soon', 'Ad integration coming soon!');
  };

  const formatBoostTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimeUntilReset = (): string => {
    if (!nextFreeBoostTime) return '--';
    
    const now = new Date();
    const diff = nextFreeBoostTime.getTime() - now.getTime();
    
    if (diff <= 0) return '0m';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const initializeLocation = async () => {
    const location = await locationService.getCurrentLocation();
    if (location) {
      setUserLocation(location);
      loadNearbyProperties(location);
      
      // Auto-zoom to user location
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.001,
          longitudeDelta: 0.001,
        }, 1000);
      }
      
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
      
      // Check if this square is in allProperties (owned by anyone)
      const ownedProperty = allProperties.find(p => p.id === gridId);
      if (ownedProperty) {
        newGridSquares.set(gridId, ownedProperty);
      } else {
        // Check if already exists in grid with ownership
        const existingSquare = gridSquares.get(gridId);
        if (existingSquare && existingSquare.isOwned) {
          newGridSquares.set(gridId, existingSquare);
        } else {
          // Generate new unowned square
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

  // Request camera permissions
  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is needed to take photos.');
      return false;
    }
    return true;
  };

  // Take a photo
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
    
    // If withPhoto is true, actually take the photo
    if (withPhoto) {
      photoUri = await takePhoto();
      if (!photoUri) {
        // User cancelled or photo failed
        return;
      }
    }
    
    const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
    setLastCheckIns(prev => new Map(prev).set(selectedSquare.id, today));
    
    let tbEarned = 1;
    if (checkInMessage.trim()) tbEarned += 2;
    if (photoUri) tbEarned += 2;
    
    // Apply boost multiplier
    if (boostActive) {
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
      
      const boostText = boostActive ? ' (2x Boost Applied!)' : '';
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
      ownerNickname: username,
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
      if (square.ownerId === userId) {
        return getMineColor(square.mineType);
      } else {
        return getMineColor(square.mineType);
      }
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

  // Calculate estimated earnings per minute
  const rentRates = {
    rock: 0.0000000011 * 60, // per minute
    coal: 0.0000000016 * 60,
    gold: 0.0000000022 * 60,
    diamond: 0.0000000044 * 60,
  };

  const calculateEarnings = () => {
    let earnings = 0;
    ownedProperties.forEach(prop => {
      const rate = rentRates[prop.mineType as keyof typeof rentRates] || 0;
      earnings += rate;
    });
    return earnings;
  };

  const earningsPerMinute = calculateEarnings();

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: userLocation?.latitude || 42.3601,
          longitude: userLocation?.longitude || -71.0589,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        followsUserLocation={false}
      >
        {Array.from(gridSquares.entries()).map(([squareId, square]) => (
          <Polygon
            key={`polygon-${squareId}`}
            coordinates={square.corners}
            fillColor={getSquareFillColor(square)}
            strokeColor={selectedSquare?.id === square.id ? '#FF0000' : getSquareStrokeColor(square)}
            strokeWidth={selectedSquare?.id === square.id ? 4 : 2}
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

      {/* Earnings Display */}
      <View style={styles.earningsDisplay}>
        <Text style={styles.earningsText}>
          ${(usdEarnings + currentEarnings).toFixed(8)} 📈
        </Text>
      </View>

      {/* Earning Boost Button */}
      <TouchableOpacity 
        style={styles.boostButton}
        onPress={() => setShowBoostModal(true)}
      >
        <Text style={[
          styles.boostButtonText,
          boostActive && { backgroundColor: '#FF9800' }
        ]}>
          {boostActive ? `⚡ Boost: ${formatBoostTime(boostTimeRemaining)}` : '⚡ Earning Boost'}
        </Text>
      </TouchableOpacity>

      {/* Welcome Badge */}
      <View style={styles.welcomeBadge}>
        <Text style={styles.welcomeText}>Welcome, {username}!</Text>
      </View>

      {/* TB Display */}
      <View style={styles.tbDisplay}>
        <Text style={styles.tbText}>💰 {userTB} TB</Text>
      </View>

      {/* Custom Location Button - Bottom Right */}
      <TouchableOpacity
        style={styles.locationButton}
        onPress={() => {
          if (userLocation && mapRef.current) {
            mapRef.current.animateToRegion({
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
              latitudeDelta: 0.001,
              longitudeDelta: 0.001,
            }, 1000);
          }
        }}
      >
        <Text style={styles.locationButtonIcon}>📍</Text>
      </TouchableOpacity>

      {/* Earning Boost Modal */}
      <Modal
        visible={showBoostModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBoostModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.boostModalContent}>
            <Text style={styles.boostModalTitle}>⚡ Earning Boost</Text>
            <Text style={styles.boostModalSubtitle}>Get 2x earnings for 30 minutes!</Text>

            {/* Free Boosts Section */}
            <View style={styles.boostSection}>
              <Text style={styles.boostSectionTitle}>Free Boosts</Text>
              <Text style={styles.boostInfo}>
                {freeBoostsRemaining}/4 available
              </Text>
              {boostActive && (
                <Text style={styles.boostActiveInfo}>
                  ⚡ Active: {formatBoostTime(boostTimeRemaining)} remaining
                </Text>
              )}
              <Text style={styles.boostResetInfo}>
                Resets in: {getTimeUntilReset()}
              </Text>
              <Text style={styles.boostLimitInfo}>
                Max total: 8 hours
              </Text>
              <TouchableOpacity
                style={[
                  styles.boostActionButton,
                  styles.freeBoostButton,
                  (freeBoostsRemaining === 0 || boostTimeRemaining >= 8 * 60 * 60) && styles.disabledBoostButton
                ]}
                onPress={activateFreeBoost}
                disabled={freeBoostsRemaining === 0 || boostTimeRemaining >= 8 * 60 * 60}
              >
                <Text style={styles.boostActionButtonText}>
                  {freeBoostsRemaining > 0 ? (boostTimeRemaining >= 8 * 60 * 60 ? 'Max Time Reached' : 'Add 30 Minutes') : 'No Free Boosts'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Watch Ad Section */}
            <View style={styles.boostSection}>
              <Text style={styles.boostSectionTitle}>Watch Ad</Text>
              <Text style={styles.boostInfo}>Get +30 min boost</Text>
              <Text style={styles.boostResetInfo}>Max 6 hours total</Text>
              <TouchableOpacity
                style={[styles.boostActionButton, styles.adBoostButton]}
                onPress={activateAdBoost}
              >
                <Text style={styles.boostActionButtonText}>Watch Ad 📺</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.closeBoostButton}
              onPress={() => setShowBoostModal(false)}
            >
              <Text style={styles.closeBoostButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {selectedSquare && (
        <View style={styles.infoPanel}>
          <Text style={styles.infoTitle}>
            {selectedSquare.mineType?.toUpperCase() || 'UNOWNED'} MINE
          </Text>
          {selectedSquare.isOwned ? (
            <View>
              <Text style={styles.usernameText}>
                Owner: {selectedSquare.ownerId === userId ? 'You' : (selectedSquare.ownerNickname || selectedSquare.ownerId)}
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
              <Text style={styles.buttonText}>
                Check In ({boostActive ? '2' : '1'} TB{boostActive ? ' - 2x Boost!' : ''})
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.modalButton, styles.photoButton]}
              onPress={() => submitCheckIn(true)}
            >
              <Text style={styles.buttonText}>
                📷 With Photo (+{boostActive ? '4' : '2'} TB)
              </Text>
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
  earningsDisplay: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  earningsText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    backgroundColor: 'rgba(76, 175, 80, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  boostButton: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  boostButtonActive: {
  },
  boostButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    backgroundColor: '#2196F3',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  welcomeBadge: {
    position: 'absolute',
    top: 150,
    left: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 12,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  welcomeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2196F3',
  },
  tbDisplay: {
    position: 'absolute',
    top: 150,
    right: 20,
    backgroundColor: 'rgba(76, 175, 80, 0.95)',
    padding: 12,
    borderRadius: 20,
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
  locationButton: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    backgroundColor: 'white',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  locationButtonIcon: {
    fontSize: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  boostModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  boostModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
    textAlign: 'center',
    marginBottom: 8,
  },
  boostModalSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  boostSection: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  boostSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  boostInfo: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  boostActiveInfo: {
    fontSize: 14,
    color: '#FF9800',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  boostResetInfo: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  boostLimitInfo: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  boostActionButton: {
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  freeBoostButton: {
    backgroundColor: '#2196F3',
  },
  adBoostButton: {
    backgroundColor: '#9C27B0',
  },
  disabledBoostButton: {
    backgroundColor: '#cccccc',
  },
  boostActionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeBoostButton: {
    backgroundColor: '#757575',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  closeBoostButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
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
