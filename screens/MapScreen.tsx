import React, { useState, useEffect, useRef, useImperativeHandle } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, ScrollView, TextInput, Image, AppState, Modal } from 'react-native';
import MapView, { Polygon, PROVIDER_GOOGLE, Marker } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
// import { AdMobRewarded } from 'expo-ads-admob'; // Temporarily disabled due to compatibility issues
import { LocationService, Coordinates } from '../services/LocationService';
import { 
  generateGridSquare, 
  getVisibleGridSquares, 
  isWithinGridSquare, 
  isAdjacentToUser, 
  GridSquare, 
  gridToLatLng,
  latLngToGridId
} from '../utils/GridUtils';
import { DatabaseService } from '../services/DatabaseService';
// import { AD_CONFIG } from '../config/adConfig'; // Will enable when ads are working

// TODO: Install react-native-google-mobile-ads
// npm install react-native-google-mobile-ads
// Then uncomment these imports:
// import { RewardedAd, RewardedAdEventType, TestIds } from 'react-native-google-mobile-ads';

interface CheckIn {
  id: string;
  userId: string;
  timestamp: Date;
  message?: string;
  hasPhoto: boolean;
  photoURL?: string;
}

interface MapScreenProps {
  userId: string;
  username: string;
  userTB: number;
  ownedProperties: GridSquare[];
  allProperties: GridSquare[];
  onPropertyPurchase: (property: GridSquare, tbSpent: number) => void;
  onCheckIn: (propertyId: string, tbEarned: number, propertyOwnerId: string, message?: string, photoUri?: string) => Promise<void>;
}

const MapScreen = React.forwardRef<any, MapScreenProps>(({ 
  userId,
  username,
  userTB, 
  ownedProperties,
  allProperties,
  onPropertyPurchase,
  onCheckIn 
}, ref) => {
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [gridSquares, setGridSquares] = useState<Map<string, GridSquare>>(new Map());
  const [selectedSquare, setSelectedSquare] = useState<GridSquare | null>(null);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [checkInMessage, setCheckInMessage] = useState('');
  const [lastCheckIns, setLastCheckIns] = useState<Map<string, string>>(new Map());
  const [propertyCheckIns, setPropertyCheckIns] = useState<Map<string, CheckIn[]>>(new Map());
  const [userNicknames, setUserNicknames] = useState<Map<string, string>>(new Map());
  
  // Money counter state
  const [baseEarnings, setBaseEarnings] = useState(0);
  const [displayEarnings, setDisplayEarnings] = useState(0);
  const [earningsRate, setEarningsRate] = useState(0);
  const sessionStartRef = useRef<number>(Date.now());
  
  // Boost state
  const [isBoostActive, setIsBoostActive] = useState(false);
  const [boostRemainingMinutes, setBoostRemainingMinutes] = useState(0);
  const [freeBoostsRemaining, setFreeBoostsRemaining] = useState(4);
  const [timeUntilBoostReset, setTimeUntilBoostReset] = useState(0);
  const [showBoostModal, setShowBoostModal] = useState(false);
  
  const mapRef = useRef<MapView>(null);
  const locationService = useRef(new LocationService()).current;
  const hasInitializedMap = useRef(false);
  const dbService = useRef(new DatabaseService()).current;

  // Set up rewarded ad
  // TODO: Re-enable when AdMob is working properly
  // useEffect(() => {
  //   const adUnitId = AD_CONFIG.getRewardedAdUnitId();
  //   
  //   AdMobRewarded.setAdUnitID(adUnitId);
  //   
  //   // Listen for reward event
  //   AdMobRewarded.addEventListener('rewardedVideoUserDidEarnReward', () => {
  //     console.log('🎁 User earned reward!');
  //     handleAdReward();
  //   });
  //   
  //   // Request ad
  //   AdMobRewarded.requestAdAsync().then(() => {
  //     console.log('✅ Rewarded ad loaded');
  //   }).catch(error => {
  //     console.log('❌ Ad load error:', error);
  //   });
  //   
  //   return () => {
  //     AdMobRewarded.removeAllListeners();
  //   };
  // }, []);

  // Rent rates per second in USD
  const rentRates = {
    rock: 0.0000000011,
    coal: 0.0000000016,
    gold: 0.0000000022,
    diamond: 0.0000000044,
  };

  // Calculate earnings rate based on owned properties
  const calculateEarningsRate = (): number => {
    let totalRate = 0;
    ownedProperties.forEach(property => {
      const rate = rentRates[property.mineType as keyof typeof rentRates] || 0;
      totalRate += rate;
    });
    // Apply 2x multiplier if boost is active
    return isBoostActive ? totalRate * 2 : totalRate;
  };

  // Load offline earnings when component mounts
  useEffect(() => {
    loadOfflineEarnings();
    loadBoostStatus();
  }, [userId]);

  // Update boost status every second
  useEffect(() => {
    const interval = setInterval(() => {
      updateBoostStatus();
    }, 1000);

    return () => clearInterval(interval);
  }, [userId]);

  const loadBoostStatus = async () => {
    try {
      const boostStatus = await dbService.getBoostStatus(userId);
      setIsBoostActive(boostStatus.isActive);
      setBoostRemainingMinutes(boostStatus.remainingMinutes);
      setFreeBoostsRemaining(boostStatus.freeBoostsRemaining);
      setTimeUntilBoostReset(boostStatus.timeUntilReset);
      
      console.log('📊 Boost status loaded:', boostStatus);
    } catch (error) {
      console.error('Error loading boost status:', error);
    }
  };

  const updateBoostStatus = async () => {
    try {
      const boostStatus = await dbService.getBoostStatus(userId);
      setIsBoostActive(boostStatus.isActive);
      setBoostRemainingMinutes(boostStatus.remainingMinutes);
      setFreeBoostsRemaining(boostStatus.freeBoostsRemaining);
      setTimeUntilBoostReset(boostStatus.timeUntilReset);
    } catch (error) {
      // Silent fail for periodic updates
    }
  };

  const handleBoostPress = () => {
    setShowBoostModal(true);
  };

  const handleActivateFreeBoost = async () => {
    if (freeBoostsRemaining <= 0) {
      Alert.alert('No Free Boosts', 'You have no free boosts remaining. Watch an ad to get +30 minutes!');
      return;
    }

    try {
      const result = await dbService.activateBoost(userId, true);
      
      if (result.success) {
        setFreeBoostsRemaining(result.freeBoostsRemaining);
        Alert.alert('Boost Activated! 🚀', result.message);
        setShowBoostModal(false);
        loadBoostStatus();
      } else {
        Alert.alert('Boost Failed', result.message);
      }
    } catch (error) {
      console.error('Error activating boost:', error);
      Alert.alert('Error', 'Failed to activate boost');
    }
  };

  const handleWatchAd = async () => {
    // TODO: Re-enable when AdMob is fixed
    // Temporarily allowing ad rewards for testing the boost system
    Alert.alert(
      'Ad Integration Coming Soon',
      'AdMob ads will be enabled in the next update. For now, would you like to test the boost feature?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Test Boost', 
          onPress: async () => {
            // Temporarily grant boost for testing
            try {
              const result = await dbService.activateBoost(userId, false);
              if (result.success) {
                Alert.alert('Test Boost Activated! 🎁', result.message);
                setShowBoostModal(false);
                loadBoostStatus();
              }
            } catch (error) {
              console.error('Error:', error);
            }
          }
        }
      ]
    );
    
    // Original AdMob code (commented out):
    // try {
    //   const isReady = await AdMobRewarded.getIsReadyAsync();
    //   
    //   if (isReady) {
    //     await AdMobRewarded.showAdAsync();
    //     setShowBoostModal(false);
    //   } else {
    //     Alert.alert('Ad Not Ready', 'Please try again in a moment.');
    //     await AdMobRewarded.requestAdAsync();
    //   }
    // } catch (error) {
    //   console.error('Error showing ad:', error);
    //   Alert.alert('Error', 'Failed to show ad. Please try again.');
    // }
  };

  const handleAdReward = async () => {
    try {
      const result = await dbService.activateBoost(userId, false);
      
      if (result.success) {
        Alert.alert('Reward Earned! 🎁', result.message);
        loadBoostStatus();
        
        // TODO: Re-enable when AdMob is working
        // Reload ad for next time
        // await AdMobRewarded.requestAdAsync();
      }
    } catch (error) {
      console.error('Error applying ad reward:', error);
      Alert.alert('Error', 'Failed to apply reward');
    }
  };

  const loadOfflineEarnings = async () => {
    try {
      console.log('🔄 Calculating offline earnings...');
      
      const earningsData = await dbService.calculateOfflineEarnings(userId);
      
      if (earningsData.newEarnings > 0 && earningsData.secondsElapsed > 60) {
        const hoursOffline = (earningsData.secondsElapsed / 3600).toFixed(1);
        const boostedHours = (earningsData.boostedSeconds / 3600).toFixed(1);
        
        let message = `You earned $${earningsData.newEarnings.toFixed(8)} while you were away (${hoursOffline} hours)!`;
        if (earningsData.boostedSeconds > 0) {
          message += `\n\n🚀 ${boostedHours} hours were boosted (2x earnings)!`;
        }
        
        Alert.alert('Welcome Back!', message, [{ text: 'Awesome!', style: 'default' }]);
      }
      
      setBaseEarnings(earningsData.totalEarnings);
      setDisplayEarnings(earningsData.totalEarnings);
      
      const rate = calculateEarningsRate();
      setEarningsRate(rate);
      
      sessionStartRef.current = Date.now();
      
      console.log('✅ Offline earnings loaded:', {
        previousEarnings: earningsData.previousEarnings,
        newEarnings: earningsData.newEarnings,
        totalEarnings: earningsData.totalEarnings,
        boostedSeconds: earningsData.boostedSeconds,
        rate: rate,
      });
    } catch (error) {
      console.error('Error loading offline earnings:', error);
    }
  };

  // Recalculate earnings rate when properties change or boost status changes
  useEffect(() => {
    const newRate = calculateEarningsRate();
    setEarningsRate(newRate);
    console.log('📊 Earnings rate updated:', newRate, 'USD/sec', isBoostActive ? '(2x BOOST!)' : '');
  }, [ownedProperties, isBoostActive]);

  // Update display earnings every 100ms for smooth animation
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsedSeconds = (Date.now() - sessionStartRef.current) / 1000;
      const sessionEarnings = earningsRate * elapsedSeconds;
      const total = baseEarnings + sessionEarnings;
      setDisplayEarnings(total);
    }, 100);

    return () => clearInterval(interval);
  }, [baseEarnings, earningsRate]);

  // Save earnings to database
  const saveCurrentEarnings = async () => {
    try {
      console.log('💾 Saving current earnings...');
      await dbService.updateUserEarnings(userId, displayEarnings);
      
      setBaseEarnings(displayEarnings);
      sessionStartRef.current = Date.now();
      
      console.log('✅ Earnings saved successfully');
    } catch (error) {
      console.error('❌ Error saving earnings:', error);
    }
  };

  // Auto-save every 5 minutes
  useEffect(() => {
    const saveInterval = setInterval(() => {
      if (displayEarnings > 0) {
        console.log('⏰ Auto-save triggered (5 min interval)');
        saveCurrentEarnings();
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(saveInterval);
  }, [displayEarnings, userId]);

  // Save on component unmount
  useEffect(() => {
    return () => {
      console.log('👋 Component unmounting, saving earnings...');
      if (displayEarnings > 0) {
        saveCurrentEarnings();
      }
    };
  }, [displayEarnings, userId]);

  // Save when app goes to background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        console.log('📱 App going to background, saving earnings...');
        if (displayEarnings > 0) {
          saveCurrentEarnings();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [displayEarnings, userId]);

  // Format earnings display
  const formatEarnings = (amount: number): string => {
    if (amount === 0) return '$0.00';
    
    if (amount < 0.000001) {
      return `$${amount.toFixed(12)}`;
    } else if (amount < 0.0001) {
      return `$${amount.toFixed(10)}`;
    } else if (amount < 0.01) {
      return `$${amount.toFixed(8)}`;
    } else if (amount < 1) {
      return `$${amount.toFixed(6)}`;
    } else {
      return `$${amount.toFixed(2)}`;
    }
  };

  // Format time remaining
  const formatTimeRemaining = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

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
      
      if (mapRef.current && !hasInitializedMap.current) {
        hasInitializedMap.current = true;
        mapRef.current.animateToRegion({
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.0005,
          longitudeDelta: 0.0005,
        }, 1000);
      }
    }
  }, [userLocation]);
  
  useEffect(() => {
    initializeLocation();
    
    return () => {
      locationService.stopWatchingLocation();
    };
  }, []);

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

  const loadUserNickname = async (userId: string): Promise<string> => {
    const cached = userNicknames.get(userId);
    if (cached) return cached;
    
    try {
      const userData = await dbService.getUserData(userId);
      const nickname = userData?.nickname || userData?.email?.split('@')[0] || userId.substring(0, 8);
      
      setUserNicknames(prev => {
        const updated = new Map(prev);
        updated.set(userId, nickname);
        return updated;
      });
      
      return nickname;
    } catch (error) {
      console.error('Error loading nickname:', error);
      const fallback = userId.substring(0, 8);
      setUserNicknames(prev => new Map(prev).set(userId, fallback));
      return fallback;
    }
  };

  const handleSquarePress = (square: GridSquare) => {
    setSelectedSquare(square);
    setShowCheckInModal(false);
    
    if (square.isOwned && square.ownerId) {
      loadUserNickname(square.ownerId);
    }
  };

  const canCheckInToday = (propertyId: string): boolean => {
    const lastCheckIn = lastCheckIns.get(propertyId);
    if (!lastCheckIn) return true;
    
    const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
    return lastCheckIn !== today;
  };

  const handleCheckIn = async () => {
    if (!selectedSquare) return;
    
    const freshLocation = await locationService.getCurrentLocation();
    if (!freshLocation) {
      Alert.alert('Location Error', 'Unable to get your current location');
      return;
    }
    
    if (!selectedSquare.isOwned) {
      Alert.alert('Cannot Check In', 'This property is not owned yet.');
      return;
    }
    
    if (selectedSquare.ownerId === userId) {
      Alert.alert('Cannot Check In', 'You cannot check in to your own properties.');
      return;
    }
    
    const userGridId = latLngToGridId(freshLocation.latitude, freshLocation.longitude);
    const propertyGridId = selectedSquare.id;

    if (userGridId !== propertyGridId) {
      Alert.alert('Too Far', `You must be within the property boundaries to check in.\n\nYour location: ${userGridId}\nProperty: ${propertyGridId}`);
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
        mediaTypes: ['images'],
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
      if (!photoUri) return;
    }
    
    const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
    setLastCheckIns(prev => new Map(prev).set(selectedSquare.id, today));
    
    let tbEarned = 1;
    if (checkInMessage.trim()) tbEarned += 2;
    if (photoUri) tbEarned += 2;
    
    try {
      await onCheckIn(
        selectedSquare.id,
        tbEarned, 
        selectedSquare.ownerId, 
        checkInMessage.trim() || undefined,
        photoUri || undefined
      );
      
      Alert.alert('Success!', `Check-in complete! You earned ${tbEarned} TB. The owner earned 1 TB.`);
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

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: userLocation?.latitude || 42.3601,
          longitude: userLocation?.longitude || -71.0589,
          latitudeDelta: .005,
          longitudeDelta: .005,
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
      </MapView>

      {/* Money Counter - Top Center */}
      <View style={styles.moneyCounter}>
        <View style={[styles.moneyCounterInner, isBoostActive && styles.moneyCounterBoosted]}>
          <Text style={styles.moneyAmount}>{formatEarnings(displayEarnings)}</Text>
          <Text style={styles.moneyLabel}>📈</Text>
        </View>
      </View>

      {/* Earning Boost Button - Below Money Counter */}
      <TouchableOpacity style={styles.boostButton} onPress={handleBoostPress}>
        <View style={[styles.boostButtonInner, isBoostActive && styles.boostButtonActive]}>
          {isBoostActive ? (
            <>
              <Text style={styles.boostIcon}>🚀</Text>
              <View style={styles.boostInfo}>
                <Text style={styles.boostText}>2x BOOST</Text>
                <Text style={styles.boostTime}>{formatTimeRemaining(boostRemainingMinutes)} left</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.boostIcon}>⚡</Text>
              <Text style={styles.boostText}>Earning Boost</Text>
            </>
          )}
        </View>
      </TouchableOpacity>

      {/* Welcome Message */}
      <View style={styles.welcomeDisplay}>
        <Text style={styles.welcomeText}>Welcome, {username}!</Text>
      </View>

      {/* TB Balance */}
      <View style={styles.tbDisplay}>
        <Text style={styles.tbText}>💰 {userTB} TB</Text>
      </View>

      {/* Boost Modal */}
      <Modal
        visible={showBoostModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBoostModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.boostModal}>
            <Text style={styles.boostModalTitle}>⚡ Earning Boost</Text>
            <Text style={styles.boostModalSubtitle}>Get 2x earnings for 30 minutes!</Text>
            
            {isBoostActive && (
              <View style={styles.boostActiveInfo}>
                <Text style={styles.boostActiveText}>🚀 Boost Currently Active</Text>
                <Text style={styles.boostActiveTime}>{formatTimeRemaining(boostRemainingMinutes)} remaining</Text>
              </View>
            )}
            
            <View style={styles.boostOptions}>
              <View style={styles.boostOption}>
                <Text style={styles.boostOptionTitle}>Free Boosts</Text>
                <Text style={styles.boostOptionDesc}>
                  {freeBoostsRemaining}/4 available
                </Text>
                <Text style={styles.boostOptionReset}>
                  Resets in: {formatTimeRemaining(timeUntilBoostReset)}
                </Text>
                <TouchableOpacity 
                  style={[styles.boostOptionButton, freeBoostsRemaining === 0 && styles.boostOptionButtonDisabled]}
                  onPress={handleActivateFreeBoost}
                  disabled={freeBoostsRemaining === 0}
                >
                  <Text style={styles.boostOptionButtonText}>
                    {freeBoostsRemaining > 0 ? 'Activate Free Boost' : 'No Free Boosts'}
                  </Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.boostOption}>
                <Text style={styles.boostOptionTitle}>Watch Ad</Text>
                <Text style={styles.boostOptionDesc}>
                  Get +30 min boost
                </Text>
                <Text style={styles.boostOptionInfo}>
                  Max 6 hours total
                </Text>
                <TouchableOpacity 
                  style={[styles.boostOptionButton, styles.boostAdButton]}
                  onPress={handleWatchAd}
                >
                  <Text style={styles.boostOptionButtonText}>Watch Ad 📺</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <TouchableOpacity 
              style={styles.boostCloseButton}
              onPress={() => setShowBoostModal(false)}
            >
              <Text style={styles.boostCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Rest of your existing modals and UI */}
      {selectedSquare && (
        <View style={styles.infoPanel}>
          <Text style={styles.infoTitle}>
            {selectedSquare.nickname || `${selectedSquare.mineType?.toUpperCase() || 'UNOWNED'} MINE`}
          </Text>
          {selectedSquare.nickname && (
            <Text style={styles.infoSubtitle}>
              {selectedSquare.mineType?.toUpperCase()} MINE
            </Text>
          )}
          
          <View style={styles.gridIdContainer}>
            <Text style={styles.gridIdLabel}>Property Grid ID:</Text>
            <Text style={styles.gridIdValue}>{selectedSquare.id}</Text>
          </View>
          
          {userLocation && (
            <View style={styles.gridIdContainer}>
              <Text style={styles.gridIdLabel}>Your Location Grid ID:</Text>
              <Text style={[
                styles.gridIdValue,
                latLngToGridId(userLocation.latitude, userLocation.longitude) === selectedSquare.id 
                  ? styles.gridIdMatch 
                  : styles.gridIdMismatch
              ]}>
                {latLngToGridId(userLocation.latitude, userLocation.longitude)}
              </Text>
            </View>
          )}
          
          {userLocation && (
            <View style={[
              styles.matchIndicator,
              latLngToGridId(userLocation.latitude, userLocation.longitude) === selectedSquare.id
                ? styles.matchIndicatorSuccess
                : styles.matchIndicatorError
            ]}>
              {latLngToGridId(userLocation.latitude, userLocation.longitude) === selectedSquare.id ? (
                <>
                  <Text style={styles.matchIcon}>✓</Text>
                  <Text style={styles.matchText}>Location Match - You can check in!</Text>
                </>
              ) : (
                <>
                  <Text style={styles.mismatchIcon}>✗</Text>
                  <Text style={styles.mismatchText}>Different Grid Square</Text>
                </>
              )}
            </View>
          )}
          
          {selectedSquare.isOwned ? (
            <View>
              <Text style={styles.usernameText}>
                Owner: {selectedSquare.ownerId === userId ? 'You' : (userNicknames.get(selectedSquare.ownerId || '') || 'Loading...')}
              </Text>
              {selectedSquare.ownerId !== userId && (
                <>
                  <Text style={styles.infoText}>
                    {(() => {
                      if (!userLocation) return '? Location unknown';
                      const userGridId = latLngToGridId(userLocation.latitude, userLocation.longitude);
                      const isInProperty = userGridId === selectedSquare.id;
                      return isInProperty 
                        ? '✓ You are within property' 
                        : `✗ Too far to check in (you're in ${userGridId})`;
                    })()}
                  </Text>
                  <TouchableOpacity 
                    style={[
                      styles.checkInButton,
                      ((() => {
                        if (!userLocation) return true;
                        const userGridId = latLngToGridId(userLocation.latitude, userLocation.longitude);
                        return userGridId !== selectedSquare.id || !canCheckInToday(selectedSquare.id);
                      })()) && styles.disabledButton
                    ]}
                    onPress={handleCheckIn}
                    disabled={
                      !userLocation || 
                      latLngToGridId(userLocation.latitude, userLocation.longitude) !== selectedSquare.id ||
                      !canCheckInToday(selectedSquare.id)
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
                  <Text style={styles.historyTitle}>Recent Visitors ({selectedPropertyCheckIns.length})</Text>
                  <ScrollView style={styles.checkInList} nestedScrollEnabled>
                    {selectedPropertyCheckIns.slice(-5).reverse().map(checkIn => {
                      const [nickname, setNickname] = React.useState<string>('Loading...');
                      
                      React.useEffect(() => {
                        loadUserNickname(checkIn.userId).then(setNickname);
                      }, [checkIn.userId]);
                      
                      const timestamp = new Date(checkIn.timestamp);
                      const timeStr = timestamp.toLocaleString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        hour: 'numeric', 
                        minute: '2-digit'
                      });
                      
                      return (
                        <View key={checkIn.id} style={styles.checkInItem}>
                          <View style={styles.checkInHeader}>
                            <Text style={styles.visitorName}>{nickname}</Text>
                            <Text style={styles.checkInTime}>{timeStr}</Text>
                          </View>
                          {checkIn.message && (
                            <Text style={styles.checkInMessage}>💬 "{checkIn.message}"</Text>
                          )}
                          {checkIn.photoURL && (
                            <View style={styles.photoContainer}>
                              <Image 
                                source={{ uri: checkIn.photoURL }}
                                style={styles.checkInPhoto}
                                resizeMode="cover"
                              />
                            </View>
                          )}
                        </View>
                      );
                    })}
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
              <Text style={styles.buttonText}>Check In (1 TB)</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.modalButton, styles.photoButton]}
              onPress={() => submitCheckIn(true)}
            >
              <Text style={styles.buttonText}>📷 With Photo (+2 TB)</Text>
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

      {userLocation && (
        <View style={styles.currentGridDisplay}>
          <Text style={styles.currentGridLabel}>Your Grid:</Text>
          <Text style={styles.currentGridValue}>
            {latLngToGridId(userLocation.latitude, userLocation.longitude)}
          </Text>
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
  moneyCounter: {
    position: 'absolute',
    top: 50,
    left: '50%',
    transform: [{ translateX: -150 }],
    width: 300,
    zIndex: 100,
  },
  moneyCounterInner: {
    backgroundColor: 'rgba(76, 175, 80, 0.95)',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
    borderWidth: 2,
    borderColor: '#5CB3E6',
  },
  moneyCounterBoosted: {
    backgroundColor: 'rgba(255, 215, 0, 0.95)',
    borderColor: '#FF6B00',
  },
  moneyAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginRight: 8,
    letterSpacing: 0.5,
  },
  moneyLabel: {
    fontSize: 18,
  },
  boostButton: {
    position: 'absolute',
    top: 105,
    left: '50%',
    transform: [{ translateX: -100 }],
    width: 200,
    zIndex: 100,
  },
  boostButtonInner: {
    backgroundColor: 'rgba(91, 179, 230, 0.95)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  boostButtonActive: {
    backgroundColor: 'rgba(255, 165, 0, 0.95)',
    borderColor: '#FF6B00',
  },
  boostIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  boostText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'white',
  },
  boostInfo: {
    alignItems: 'center',
  },
  boostTime: {
    fontSize: 10,
    color: 'white',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  boostModal: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 25,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  boostModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2B6B94',
    marginBottom: 10,
    textAlign: 'center',
  },
  boostModalSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  boostActiveInfo: {
    backgroundColor: '#FFF3CD',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    alignItems: 'center',
  },
  boostActiveText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF6B00',
    marginBottom: 5,
  },
  boostActiveTime: {
    fontSize: 14,
    color: '#666',
  },
  boostOptions: {
    gap: 15,
  },
  boostOption: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 10,
  },
  boostOptionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  boostOptionDesc: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  boostOptionReset: {
    fontSize: 12,
    color: '#999',
    marginBottom: 10,
  },
  boostOptionInfo: {
    fontSize: 12,
    color: '#999',
    marginBottom: 10,
  },
  boostOptionButton: {
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  boostOptionButtonDisabled: {
    backgroundColor: '#ccc',
  },
  boostAdButton: {
    backgroundColor: '#9C27B0',
  },
  boostOptionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  boostCloseButton: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#757575',
    borderRadius: 8,
    alignItems: 'center',
  },
  boostCloseButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  welcomeDisplay: {
    position: 'absolute',
    top: 165,
    left: 20,
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 10,
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
    top: 165,
    right: 20,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 10,
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
  infoSubtitle: {
    fontSize: 14,
    color: '#999',
    marginBottom: 10,
    marginTop: -5,
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
    fontSize: 11,
    color: '#999',
  },
  checkInMessage: {
    fontSize: 13,
    color: '#555',
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 4,
  },
  checkInHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  visitorName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  photoIndicator: {
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#E3F2FD',
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  photoText: {
    fontSize: 12,
    color: '#2196F3',
    fontWeight: '600',
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
  gridIdContainer: {
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  gridIdLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  gridIdValue: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    color: '#333',
  },
  gridIdMatch: {
    color: '#4CAF50',
  },
  gridIdMismatch: {
    color: '#f44336',
  },
  matchIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  matchIndicatorSuccess: {
    backgroundColor: '#E8F5E9',
  },
  matchIndicatorError: {
    backgroundColor: '#FFEBEE',
  },
  matchIcon: {
    fontSize: 20,
    color: '#4CAF50',
    marginRight: 8,
  },
  matchText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  mismatchIcon: {
    fontSize: 20,
    color: '#f44336',
    marginRight: 8,
  },
  mismatchText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f44336',
  },
  currentGridDisplay: {
    position: 'absolute',
    top: 215,
    right: 20,
    backgroundColor: 'rgba(33, 150, 243, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  currentGridLabel: {
    fontSize: 10,
    color: 'white',
    fontWeight: '600',
    marginBottom: 2,
  },
  currentGridValue: {
    fontSize: 12,
    color: 'white',
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  photoContainer: {
    marginTop: 8,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  checkInPhoto: {
    width: '100%',
    height: 200,
    backgroundColor: '#e0e0e0',
  },
});

export default MapScreen;
