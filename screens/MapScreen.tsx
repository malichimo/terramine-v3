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
  onPropertyPurchase: (property: GridSquare, tbSpent: number) => void;
  onCheckIn: (propertyId: string, tbEarned: number, propertyOwnerId: string, message?: string, hasPhoto?: boolean) => Promise<void>;
  initialBoostState: {
    freeBoostsRemaining: number;
    adBoostsUsed: number;
    boostExpiresAt: string | null;
    nextFreeBoostResetAt: string | null;
  };
  onBoostUpdate: (boostData: any) => void;
}

const MapScreen = React.forwardRef<any, MapScreenProps>(({ 
  userId,
  username,
  userTB, 
  ownedProperties,
  allProperties,
  onPropertyPurchase,
  onCheckIn,
  initialBoostState,
  onBoostUpdate
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
  
  const mapRef = useRef<MapView>(null);
  const locationService = useRef(new LocationService()).current;
  const dbService = useRef(new DatabaseService()).current;

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
        // Boost expired
        setBoostState(prev => ({ 
          ...prev, 
          boostTimeRemaining: 0, 
          isBoostActive: false,
          boostExpiresAt: null 
        }));
        dbService.updateBoostState(userId, {
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
        // Reset free boosts
        const newState = {
          freeBoostsRemaining: 4,
          nextFreeBoostResetAt: null,
        };
        setBoostState(prev => ({ ...prev, ...newState }));
        dbService.updateBoostState(userId, {
          freeBoostsRemaining: 4,
          boostExpiresAt: boostState.boostExpiresAt,
          nextFreeBoostResetAt: null,
        });
      }
    };

    checkResetTimer();
    const interval = setInterval(checkResetTimer, 60000);
    return () => clearInterval(interval);
  }, [boostState.nextFreeBoostResetAt]);

  useEffect(() => {
    if (userLocation) {
      loadNearbyProperties(userLocation);
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
    
    try {
      await onCheckIn(
        selectedSquare.id,
        tbEarned, 
        selectedSquare.ownerId, 
        checkInMessage.trim() || undefined,
        !!photoUri
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

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: userLocation?.latitude || 42.3601,
          longitude: userLocation?.longitude || -71.0589,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
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

      <View style={styles.tbDisplay}>
        <Text style={styles.tbText}>💰 {userTB} TB</Text>
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
            ? `⚡ Boost: ${Math.floor(boostState.boostTimeRemaining)}m`
            : '⚡ Get Boost'}
        </Text>
      </TouchableOpacity>

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
  tbDisplay: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'white',
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
  },
  boostButton: {
    position: 'absolute',
    top: 110,
    alignSelf: 'center',
    backgroundColor: '#2196F3',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  boostButtonActive: {
    backgroundColor: '#FF9800',
  },
  boostButtonText: {
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
