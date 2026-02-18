# TerraMine Project Instructions

## Project Overview
TerraMine is a location-based mobile game where users purchase virtual properties on a real-world grid, check in to properties owned by others, and earn passive income from their property portfolio.

## Tech Stack
- **Frontend**: React Native with Expo SDK 54
- **Language**: TypeScript (strict mode)
- **Backend**: Firebase (Authentication + Firestore)
- **Maps**: React Native Maps with Google Maps
- **Image Handling**: expo-image-picker
- **Navigation**: React Navigation (Bottom Tabs)

## Project Structure
```
TerraMine/
├── screens/
│   ├── LoginScreen.tsx
│   ├── MapScreen.tsx
│   └── ProfileScreen.tsx
├── services/
│   ├── DatabaseService.ts
│   └── LocationService.ts
├── contexts/
│   └── AuthContext.tsx
├── utils/
│   └── GridUtils.ts
├── App.tsx
├── MainNavigator.tsx
├── firebaseConfig.ts
└── app.json
```

## Core Features

### 1. Currency System
- **TB (TerraBucks)**: Virtual currency for purchasing properties and check-ins
  - Starting balance: 1000 TB
  - Property cost: 100 TB each
  - Check-in earnings: 1 TB (base) + 2 TB (message) + 2 TB (photo)
  - Owner earns: 1 TB per visitor check-in

- **USD Earnings**: Real money accumulated from property rent
  - Rock mine: $0.0000000660/min
  - Coal mine: $0.0000000960/min
  - Gold mine: $0.0000001320/min
  - Diamond mine: $0.0000002640/min
  - Updates every 100ms for smooth animation
  - Saves to Firebase every 60 seconds
  - **Important**: Counter shows total accumulated (never resets to zero)

### 2. Property System
- **Grid System**: Real-world divided into grid squares (~30x30 meters)
- **Mine Types**: Rock (60%), Coal (30%), Gold (9%), Diamond (1%)
- **Purchase Requirements**:
  - Must be within or adjacent to property
  - Costs 100 TB
  - Can only purchase unowned properties
- **Ownership**: Permanent until sold (future feature)

### 3. Check-in System
- **Requirements**:
  - Must be within property boundaries
  - Property must be owned by someone else
  - Once per day per property (EST timezone)
- **Features**:
  - Optional message (+2 TB)
  - Optional photo (+2 TB)
  - Earning Boost multiplier applies (2x when active)
- **Photo Storage**:
  - Photos are stored as base64 strings in Firebase
  - Check-ins with photos show the actual image in the Visitors tab
  - Property owners can see photos left by visitors
  - IMPORTANT: Always store photoUri in check-ins when hasPhoto is true

### 4. Earning Boost System
- **Free Boosts**: 4 boosts per cycle
  - Each boost adds 30 minutes (accumulates, doesn't reset)
  - Maximum total: 8 hours (480 minutes)
  - Resets 6 hours after using the last boost
- **Ad Boosts**: Watch ad for +30 minutes (coming soon)
  - Maximum 8 additional boosts
  - Contributes to 8-hour total limit
- **Persistence**: Boost state saves to Firebase
  - Works across sessions (sign out/in)
  - Calculates remaining time correctly when returning
  - Expires properly even when offline

## Firebase Data Structure

### Users Collection
```typescript
{
  email: string;
  tbBalance: number;                    // TerraBucks balance
  usdEarnings: number;                  // Total USD accumulated from rent
  totalCheckIns: number;                // Total check-ins made
  totalTBEarned: number;                // Total TB earned from activities
  
  // Boost tracking
  freeBoostsRemaining: number;          // 0-4
  boostExpiresAt: string | null;        // ISO timestamp when boost expires
  nextFreeBoostResetAt: string | null;  // ISO timestamp when boosts reset to 4
  
  createdAt: string;                    // ISO timestamp
}
```

### Properties Collection
```typescript
{
  id: string;                           // Grid coordinate "x_y"
  ownerId: string;                      // User UID
  mineType: 'rock' | 'coal' | 'gold' | 'diamond';
  centerLat: number;
  centerLng: number;
  corners: Array<{latitude: number, longitude: number}>;
  purchasedAt: string;                  // ISO timestamp
}
```

### CheckIns Collection
```typescript
{
  userId: string;                       // Visitor UID
  propertyId: string;                   // Property grid ID
  propertyOwnerId: string;              // Owner UID
  message?: string;                     // Optional message
  hasPhoto: boolean;                    // Whether photo was taken
  photoUri?: string;                    // Base64 encoded photo data (if hasPhoto is true)
  timestamp: string;                    // ISO timestamp
}
```

## Development Workflow

### Standard Workflow (No Rebuild Needed - 90% of development)
1. Make code changes in VS Code
2. Save files
3. Run: `npx expo start --dev-client`
4. App automatically reloads on phone
5. Test changes
6. Commit to Git: `git add . && git commit -m "message" && git push`

### When Rebuild Is Required (Consumes build quota)
Only rebuild when:
- Adding/removing native npm packages
- Changing app.json configuration
- Updating app permissions
- Changing app name, icon, or package identifier

**Build command**: `npx eas-cli build --platform android --profile development`

### Build Limit Management
- Free plan: 30 builds/month
- Batch native changes together
- Test all JS changes with dev build first
- Development build lasts until native changes needed

## Coding Standards

### TypeScript
- Use strict mode
- Explicit types for all function parameters
- Interface for all component props
- Avoid `any` type unless absolutely necessary

### React Native
- Use functional components with hooks
- No class components
- Use `useRef` for services (LocationService, DatabaseService)
- Proper cleanup in `useEffect` return functions

### State Management
- Local state with `useState` for UI
- Props for data flow (no Context except Auth)
- Firebase as source of truth

### File Organization
- One component per file
- Services in `/services`
- Utilities in `/utils`
- Screens in `/screens`

## Common Patterns

### Timers and Intervals
```typescript
const timerRef = useRef<NodeJS.Timeout | null>(null);

useEffect(() => {
  timerRef.current = setInterval(() => {
    // Do something
  }, 1000);

  return () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  };
}, [dependencies]);
```

### Firebase Updates
```typescript
// Always use DatabaseService methods
await dbService.updateUserBalance(userId, amount);
await dbService.updateUSDEarnings(userId, amount);
await dbService.updateBoostState(userId, boostData);

// Never directly call Firebase - use service layer
```

### Props Callback Pattern
```typescript
// Parent (MainNavigator)
const handleAction = async (data: Type) => {
  await dbService.doSomething(data);
  setLocalState(prev => prev + data);
};

// Child (MapScreen)
interface Props {
  onAction: (data: Type) => Promise<void>;
}

// Usage in child
await onAction(data);
```

## UI/UX Guidelines

### Colors
- Primary Blue: `#2196F3` (buttons, accents)
- Success Green: `#4CAF50` (earnings, purchase button)
- Warning Orange: `#FF9800` (active boost, owned by others)
- Background: `#f5f5f5`
- Disabled: `#cccccc`

### Map Property Colors
- **Fill**: Based on mine type
  - Rock: `#808080` (gray)
  - Coal: `#000000` (black)
  - Gold: `#FFD700` (gold)
  - Diamond: `#B9F2FF` (light blue)
- **Stroke**: Based on ownership
  - Your properties: `#2196F3` (blue)
  - Others' properties: `#FF9800` (orange)
  - Unowned: `#4CAF50` (green)

### Button States
- Active: Solid color with white text
- Disabled: Gray (`#cccccc`)
- Loading: Show ActivityIndicator

### Positioning
- Earnings display: Top center
- Boost button: Below earnings, centered, narrow
- Welcome badge: Top left
- TB balance: Top right
- Info panels: Bottom, full width

### Map Zoom Level
- Initial region (before location found): `latitudeDelta: 0.01` (zoomed out placeholder)
- Auto-zoom to user location: `latitudeDelta: 0.001` (shows ~10 grid squares across)
- This provides a good balance between seeing nearby properties and detail

## Testing Checklist

### Before Committing
- [ ] App runs without crashes
- [ ] Console has no errors
- [ ] TypeScript compiles without errors
- [ ] Firebase operations succeed
- [ ] State updates correctly

### Before Rebuilding
- [ ] All JavaScript changes tested
- [ ] Native changes necessary
- [ ] app.json changes verified
- [ ] Build quota available (check EAS dashboard)

## Security Notes

### API Keys
- Firebase API keys: Public by design (security via Firestore rules)
- Google Maps API key: Restricted to package name `com.terramine.app`
- Both stored in code (safe with restrictions)

### .gitignore Requirements
```
.env
node_modules/
.expo/
dist/
npm-debug.*
*.jks
*.p8
*.p12
*.key
*.mobileprovision
```

### Never Commit
- `.env` files
- Private keys
- Keystores
- Personal credentials

## Troubleshooting

### Common Issues

**App crashes on launch:**
1. Check console logs with `npx expo start --dev-client`
2. Verify Firebase config is correct
3. Check for missing npm packages
4. Ensure Google Maps API key is valid

**Boost counter shows NaN:**
- Check that `initialBoostState` is passed from MainNavigator
- Verify Firebase has boost fields initialized
- Check useEffect dependencies for loadBoostData

**Earnings not updating:**
- Verify properties are owned
- Check timer is running (console.log in interval)
- Confirm Firebase saves are succeeding
- Check calculation: `rentRate * (elapsedSeconds / 60)`

**Map not showing location:**
- Grant location permissions
- Check LocationService.getCurrentLocation()
- Verify Google Maps API key
- Check map initialRegion has valid coords

### Debug Commands
```bash
# View logs
npx expo start --dev-client

# Clear Metro cache
npx expo start --clear

# Check build status
npx eas-cli build:list

# View specific build
npx eas-cli build:view --platform android
```

## Future Features (Planned)
- Property selling/trading
- Leaderboards
- Social features (friends, messaging)
- Property upgrades
- Special events
- Achievement system
- Property neighborhoods/regions
- Weather effects on earnings
- Real cash out system for USD earnings

## Git Workflow

### Commit Messages
- `feat: Add boost persistence to Firebase`
- `fix: Resolve NaN in boost counter`
- `refactor: Extract boost logic to service`
- `docs: Update project instructions`
- `style: Adjust button positioning`

### Branch Strategy
- `main`: Production-ready code
- Feature branches: Create as needed
- Test thoroughly before merging to main

## Contact & Resources
- Firebase Console: https://console.firebase.google.com/project/terramine-5cda5
- Google Cloud: https://console.cloud.google.com/ (project: terramine-5cda5)
- EAS Builds: https://expo.dev/accounts/malichimo/projects/TerraMine
- GitHub: https://github.com/malichimo/terramine-v3

---

**Last Updated**: January 23, 2026
**Version**: 1.0.0
**Developer**: @malichimo
