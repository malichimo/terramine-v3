import * as Location from 'expo-location';
import { Alert } from 'react-native';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export class LocationService {
  private watchSubscription: Location.LocationSubscription | null = null;

  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'TerraMine needs location access to show properties near you.'
        );
        return false;
      }
      return true;
    } catch (error) {
      console.error('Permission error:', error);
      return false;
    }
  }

  async getCurrentLocation(): Promise<Coordinates | null> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return null;

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      // Validate coordinates
      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      if (isFinite(coords.latitude) && 
          isFinite(coords.longitude) &&
          Math.abs(coords.latitude) <= 90 &&
          Math.abs(coords.longitude) <= 180) {
        return coords;
      } else {
        console.error('Invalid coordinates from GPS:', coords);
        return null;
      }
    } catch (error) {
      console.error('Get location error:', error);
      return null;
    }
  }

  async startWatchingLocation(
    callback: (coords: Coordinates) => void
  ): Promise<void> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return;

    // watchPositionAsync returns a Promise, so we need to await it
    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 3000, // Update every 3 seconds
        distanceInterval: 5, // Or when moved 5 meters
      },
      (location) => {
        // Validate coordinates before calling callback
        const coords = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
        
        if (isFinite(coords.latitude) && 
            isFinite(coords.longitude) &&
            Math.abs(coords.latitude) <= 90 &&
            Math.abs(coords.longitude) <= 180) {
          callback(coords);
        } else {
          console.error('Invalid location update:', coords);
        }
      }
    );

    this.watchSubscription = subscription;
  }

  stopWatchingLocation(): void {
    if (this.watchSubscription) {
      this.watchSubscription.remove();
      this.watchSubscription = null;
    }
  }
}
