import * as Location from 'expo-location';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export class LocationService {
  private watchSubscription: Location.LocationSubscription | null = null;

  // Check current permission status without prompting
  async checkPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      return status as 'granted' | 'denied' | 'undetermined';
    } catch {
      return 'undetermined';
    }
  }

  // Request permission — caller is responsible for showing rationale UI first
  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === 'granted';
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
        // ✅ OPT: Balanced accuracy for initial position — sufficient for a
        // 10-meter grid square. High accuracy is for turn-by-turn navigation
        // and keeps the GPS chip at full power unnecessarily.
        accuracy: Location.Accuracy.Balanced,
      });

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

    const subscription = await Location.watchPositionAsync(
      {
        // ✅ OPT: Three changes here to dramatically reduce device heating:
        //
        // 1. Accuracy.Balanced instead of Accuracy.High.
        //    Balanced uses a combination of cell towers, Wi-Fi, and GPS rather
        //    than GPS-only. Precision is ~10–30m — more than enough to determine
        //    which 10m grid square the user is in. High accuracy keeps the GPS
        //    chip at full power continuously, which is the primary cause of
        //    device heating during long TerraMine sessions.
        //
        // 2. timeInterval: 10000 instead of 3000.
        //    Was firing every 3 seconds regardless of movement — 20 full grid
        //    rebuilds per minute while the user stands still. 10 seconds is
        //    still responsive enough that walking between grid squares feels
        //    instant, but reduces idle GPS callbacks by 66%.
        //
        // 3. distanceInterval: 10 instead of 5.
        //    5 meters is sub-grid-square resolution — the grid is 10m cells,
        //    so updates closer than 10m can never change which cell the user
        //    is in. 10m aligns with the grid and eliminates noise callbacks
        //    from GPS jitter while the user is stationary.
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10000,
        distanceInterval: 10,
      },
      (location) => {
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
