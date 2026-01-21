import React, { useState, useRef, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import MapScreen from './screens/MapScreen';
import ProfileScreen from './screens/ProfileScreen';
import LoadingScreen from './components/LoadingScreen';
import { GridSquare } from './utils/GridUtils';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './contexts/AuthContext';
import { DatabaseService } from './services/DatabaseService';

const Tab = createBottomTabNavigator();
const dbService = new DatabaseService();

export default function MainNavigator() {
  const { user } = useAuth();
  const [userTB, setUserTB] = useState(1000);
  const [ownedProperties, setOwnedProperties] = useState<GridSquare[]>([]);
  const [allProperties, setAllProperties] = useState<GridSquare[]>([]);
  const [totalCheckIns, setTotalCheckIns] = useState(0);
  const [totalTBEarned, setTotalTBEarned] = useState(0);
  const [dataLoaded, setDataLoaded] = useState(false);
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

      console.log('=== All Properties from DB ===');
      console.log('Count:', allProps.length);
      allProps.forEach(prop => {
        console.log('Property:', {
          id: prop.id,
          isOwned: prop.isOwned,
          ownerId: prop.ownerId,
          mineType: prop.mineType
        });
      });

      setUserTB(userData?.tbBalance || 1000);
      setOwnedProperties(properties);
      setAllProperties(allProps);
      setTotalCheckIns(userData?.totalCheckIns || 0);
      setTotalTBEarned(userData?.totalTBEarned || 0);
      
      console.log('Loaded from Firestore:', {
        tb: userData?.tbBalance,
        ownedCount: properties.length,
        allPropertiesCount: allProps.length
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

  const handleCheckIn = async (
    propertyId: string, 
    tbEarned: number, 
    propertyOwnerId: string, 
    message?: string, 
    photoUri?: string
  ) => {
    if (!user) return;

    try {
      await dbService.createCheckIn(user.uid, propertyId, propertyOwnerId, message, photoUri);
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

  const handlePropertyUpdate = async () => {
    // Reload properties from database to get updated nicknames
    if (!user) return;
    
    try {
      const properties = await dbService.getPropertiesByOwner(user.uid);
      const allProps = await dbService.getAllProperties();
      
      setOwnedProperties(properties);
      setAllProperties(allProps);
      
      console.log('Properties reloaded after nickname update');
    } catch (error) {
      console.error('Error reloading properties:', error);
    }
  };

  if (!dataLoaded) {
    return <LoadingScreen />;
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
              onPropertyPurchase={handlePropertyPurchase}
              onCheckIn={handleCheckIn}
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
              onPropertyUpdate={handlePropertyUpdate}
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}
