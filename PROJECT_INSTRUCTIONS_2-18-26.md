# TerraMine Project Instructions

## Project Overview
TerraMine is a location-based mobile game where users purchase virtual properties on a real-world grid, check in to properties owned by others, earn passive income from their property portfolio, and complete daily mining activities for resource rewards.

## Tech Stack
- **Frontend**: React Native with Expo SDK 54
- **Language**: TypeScript (strict mode)
- **Backend**: Firebase (Authentication + Firestore + Storage)
- **Maps**: React Native Maps with Google Maps
- **Image Handling**: expo-image-picker
- **Navigation**: React Navigation (Bottom Tabs + Stack)
- **Ads**: Google AdMob (rewarded video ads)

## Project Structure
```
TerraMine/
├── screens/
│   ├── LoginScreen.tsx
│   ├── MapScreen.tsx
│   ├── ProfileScreen.tsx
│   ├── PropertyDetailScreen.tsx
│   └── activities/
│       ├── RockConveyorActivity.tsx
│       ├── CoalPileActivity.tsx
│       ├── SluiceBoxActivity.tsx
│       └── SlotMachineActivity.tsx
├── services/
│   ├── DatabaseService.ts
│   ├── DatabaseServicePhase2.ts
│   ├── LocationService.ts
│   └── AdMobService.ts
├── contexts/
│   └── AuthContext.tsx
├── utils/
│   ├── GridUtils.ts
│   ├── TimeUtils.ts
│   └── MigrationUtils.ts
├── types/
│   └── PropertyTypes.ts
├── assets/
│   └── images/
│       ├── conveyor-belt.png
│       ├── coal-pile-no-axe.png
│       ├── axe.png
│       ├── sluice-box-no-shovel.png
│       ├── shovel.png
│       ├── slot-machine-no-arm.png
│       └── lever_arm_clear.png
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
  - Daily activity TB bonuses: 10-100 TB (25% chance, varies by mine type)

- **USD Earnings**: Real money accumulated from property rent
  - Rock mine: $0.0000000011/sec (base rate)
  - Coal mine: $0.0000000016/sec (1.5x rock)
  - Gold mine: $0.0000000022/sec (2x rock)
  - Diamond mine: $0.0000000044/sec (4x rock)
  - Updates every 100ms for smooth animation
  - Saves to Firebase every 60 seconds
  - **Production Bonus**: Properties can be upgraded 1-100 for +1-99% earnings boost
  - **Important**: Counter shows total accumulated (never resets to zero)

### 2. Property System
- **Grid System**: Real-world divided into grid squares (~10 meters)
- **Mine Types**: Rock (60%), Coal (30%), Gold (9%), Diamond (1%)
- **Purchase Requirements**:
  - Must be within or adjacent to property
  - Costs 100 TB
  - Can only purchase unowned properties
- **Ownership**: Permanent until sold (future feature)
- **Property Details**: Each property has production level, game level, daily activities

### 3. Check-in System
- **Requirements**:
  - Must be within property boundaries
  - Property must be owned by someone else
  - Once per day per property (EST timezone)
- **Features**:
  - Optional message (+2 TB)
  - Optional photo (+2 TB) with Firebase Storage upload
  - Earning Boost multiplier applies (2x when active)
  - Photos viewable in check-in history

### 4. Earning Boost System
- **Free Boosts**: 4 boosts per cycle
  - Each boost adds 30 minutes (accumulates, doesn't reset)
  - Maximum total: 8 hours (480 minutes)
  - Resets 6 hours after using the last boost
- **Ad Boosts**: Watch ad for +30 minutes
  - Auto-refills at 1 boost per 30 minutes
  - Maximum 12 ad boosts stored
  - Contributes to 8-hour total limit
- **Persistence**: Boost state saves to Firebase
  - Works across sessions (sign out/in)
  - Calculates remaining time correctly when returning
  - Expires properly even when offline

### 5. Daily Mining Activities (Phase 2 Week 3)
Each owned property has a unique daily mining mini-game based on mine type:

#### **Rock Mine - Conveyor Belt**
- **Animation**: Rocks move diagonally along conveyor belt
- **Rewards**: Single-tier random (60% Common, 25% Uncommon, 12% Rare, 3% Epic)
  - Common: 300-600 Gravel
  - Uncommon: 30-60 Slate
  - Rare: 3-10 Granite
  - Epic: 1-2 Marble
- **TB Bonus**: 25% chance for 10 TB
- **Attempts**: 3 per day (resets 4 AM EST)
- **Ad Features**:
  - Watch ad for 2x rewards (first attempt only)
  - Watch ad for +2 attempts (anytime)

#### **Coal Mine - Coal Pile Breaking**
- **Animation**: Pickaxe swings 3 times, coal pile breaks
- **Rewards**: 1.5x rock mine rates
  - Common: 450-900 Lignite
  - Uncommon: 45-90 Soft Coal
  - Rare: 5-15 Anthracite
  - Epic: 1-3 Diamond
- **TB Bonus**: 25% chance for 25 TB
- **Same ad features as rock mine**

#### **Gold Mine - Sluice Box Panning**
- **Animation**: Shovel dumps dirt → water washes → gold appears
- **Rewards**: 2x rock mine rates
  - Common: 600-1200 Gold Dust
  - Uncommon: 60-120 Gold Flakes
  - Rare: 6-20 Gold Nuggets
  - Epic: 1-4 Gold Bars
- **TB Bonus**: 25% chance for 50 TB
- **Same ad features as rock mine**

#### **Diamond Mine - Slot Machine**
- **Animation**: Lever pulls down (rotates clockwise), reels spin, symbols appear
- **Rewards**: 3x rock mine rates (jackpot-based)
  - Triple match (💎💎💎): 1-6 Diamonds (Epic)
  - Triple match (🟨🟨🟨): 9-30 Diamond Stones (Rare)
  - Triple match (🟠🟠🟠): 90-180 Diamond Pieces (Uncommon)
  - Two match: 90-180 Diamond Pieces (Uncommon)
  - No match: 900-1800 Diamond Shards (Common)
- **TB Bonus**: 25% chance for 100 TB
- **Same ad features as rock mine**

**Daily Activity Rules**:
- Resets at 4 AM EST daily
- Base: 1 free attempt per day
- Watch ad for 2x rewards (first attempt only, cannot stack with extra turns)
- Watch ad for +2 attempts (can use multiple times, no 2x bonus on extra turns)
- Resources stored per mine type in Firebase
- Used for property upgrades (future feature)

### 6. Resource Management (Phase 2)
- **4 Tiers**: Common, Uncommon, Rare, Epic
- **4 Types**: Rock, Coal, Gold, Diamond resources
- **Storage**: Separate pools per mine type in user document
- **Usage**: Upgrade properties for production bonuses (future implementation)

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
  adBoostsRemaining: number;            // 0-12 (auto-refills)
  boostExpiresAt: string | null;        // ISO timestamp when boost expires
  nextFreeBoostResetAt: string | null;  // ISO timestamp when boosts reset to 4
  lastAdBoostRefillAt: string;          // ISO timestamp for ad boost refill timer
  
  // Resource pools (Phase 2)
  rockResources: { common: number, uncommon: number, rare: number, epic: number };
  coalResources: { common: number, uncommon: number, rare: number, epic: number };
  goldResources: { common: number, uncommon: number, rare: number, epic: number };
  diamondResources: { common: number, uncommon: number, rare: number, epic: number };
  
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

### PropertyDetails Collection (Phase 2)
```typescript
{
  propertyId: string;                   // References properties collection
  customName?: string;                  // User-set property name
  productionLevel: number;              // 1-100 (affects USD earnings)
  gameLevel: number;                    // Matching game difficulty
  gameXP: number;                       // Progress to next game level (0-999)
  gamesPlayed: number;                  // Total games played
  gamesWon: number;                     // Total games won
  dailyActivitiesRemaining: number;     // 1-3 (resets at 4 AM EST)
  doubleRewardAvailable: boolean;       // Can watch ad for 2x (resets daily)
  lastDailyReset: string;               // ISO timestamp of last 4 AM EST reset
  createdAt: string;
  lastUpdated: string;
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
  photoURL?: string;                    // Firebase Storage URL if photo exists
  timestamp: string;                    // ISO timestamp
}
```

### DailyActivities Collection (Phase 2)
```typescript
{
  propertyId: string;
  userId: string;
  attemptNumber: number;                // 1, 2, or 3
  rewardsEarned: ResourcePool;          // What resources were earned
  wasDoubled: boolean;                  // Whether 2x ad was active
  perfectTiming: boolean;               // Future: timing bonus (not implemented)
  wasAdPurchased: boolean;              // Whether this was an ad-unlocked attempt
  timestamp: string;
  resetDay: string;                     // YYYY-MM-DD in EST for grouping
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
- Use `??` instead of `||` for null checking (falsy value safety)

### React Native
- Use functional components with hooks
- No class components
- Use `useRef` for services (LocationService, DatabaseService, AdMobService)
- Proper cleanup in `useEffect` return functions
- Add safe area padding for Android: `paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0`

### State Management
- Local state with `useState` for UI
- Props for data flow (no Context except Auth)
- Firebase as source of truth
- Always reload property details when returning from activities

### File Organization
- One component per file
- Services in `/services`
- Utilities in `/utils`
- Screens in `/screens`
- Activity screens in `/screens/activities`
- Types in `/types`

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

// Phase 2 methods
await dbServicePhase2.performDailyActivity(...);
await dbServicePhase2.addResourcesToPool(...);
await dbServicePhase2.unlockAdditionalAttempt(...);

// Never directly call Firebase - use service layer
```

### Navigation with Refresh
```typescript
// Navigate back and trigger refresh
navigation.navigate('PropertyDetail', {
  property: property,
  refresh: true,
});

// In PropertyDetailScreen, watch for refresh param
useEffect(() => {
  if (route.params?.refresh) {
    loadPropertyDetails();
  }
}, [route.params]);
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
- Purple: `#9C27B0` (ad buttons)
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

### Daily Activity Backgrounds
- Rock Mine: `#5d4e37` (brown/industrial)
- Coal Mine: `#3e2723` (dark brown)
- Gold Mine: `#4a3c2a` (brown/tan)
- Diamond Mine: `#1a0f29` (dark purple/casino)

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

## Testing Checklist

### Before Committing
- [ ] App runs without crashes
- [ ] Console has no errors
- [ ] TypeScript compiles without errors
- [ ] Firebase operations succeed
- [ ] State updates correctly
- [ ] Animations run smoothly
- [ ] Daily activities reset properly
- [ ] Ad integration works (or fails gracefully)

### Before Rebuilding
- [ ] All JavaScript changes tested
- [ ] Native changes necessary
- [ ] app.json changes verified
- [ ] Build quota available (check EAS dashboard)

## Security Notes

### API Keys
- Firebase API keys: Public by design (security via Firestore rules)
- Google Maps API key: Restricted to package name `com.terramine.app`
- AdMob App ID: In app.json, restricted by package name
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
- Check calculation: `rentRate * productionMultiplier`

**Map not showing location:**
- Grant location permissions
- Check LocationService.getCurrentLocation()
- Verify Google Maps API key
- Check map initialRegion has valid coords

**Daily activities not resetting:**
- Check TimeUtils.shouldResetDailyActivity() logic
- Verify lastDailyReset timestamp in Firebase
- Confirm 4 AM EST boundary calculation

**AdMob errors:**
- Test ads can be unreliable - this is normal
- Production ads are more stable
- Check AdMobService error handling
- Verify AdMob app is approved and live

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

## Phase 2 Development Status

### ✅ Completed (Week 3)
- [x] PropertyDetailScreen with mine visualization
- [x] Daily activity system (4 AM EST resets)
- [x] Rock Mine - Conveyor Belt activity
- [x] Coal Mine - Coal Pile Breaking activity
- [x] Gold Mine - Sluice Box Panning activity
- [x] Diamond Mine - Slot Machine activity
- [x] Resource pools (4 types x 4 tiers)
- [x] Ad integration (2x rewards, extra attempts)
- [x] Ad boost auto-refill system
- [x] All custom game assets (AI-generated images)
- [x] Single-tier reward distribution
- [x] Turn tracking and refresh logic

### 🔄 In Progress
- [ ] Wire up navigation from PropertyDetailScreen to activities

### 📋 Upcoming (Week 4+)
- [ ] Property upgrade system (spend resources for production boost)
- [ ] Matching game for earning resources
- [ ] Visitor log with photo viewing
- [ ] Property naming/customization
- [ ] Achievement system

## Monetization Strategy & Economics

### **Daily Activity Ad System (Phase 2 - Implemented)**

#### **Current Implementation:**
- Base: 1 free attempt per day (resets 4 AM EST)
- Watch ad for 2x rewards (first attempt only)
- Watch ad for +2 attempts (unlimited, implemented with 6/day cap)

#### **Daily Cap System (Option B - Active):**
```typescript
// Maximum 6 extra attempts per day via ads (3 ads × 2 attempts each)
MAX_AD_ATTEMPTS_PER_DAY = 6

Daily Structure:
- 1 base attempt (free)
- Up to 6 ad attempts (watch 3 ads)
- Total: 7 attempts per property per day maximum
```

#### **Economics Analysis:**

**Ad Revenue Potential:**
- 4 mine types × 3 ads each = 12 ads/day max per active player
- Average CPM: ~$10-20
- Revenue per player per day: ~$0.12-0.24

**Resource Value:**
- Resources are non-tradeable
- Only used for property upgrades
- Property upgrades increase USD earnings by microscopic amounts
- Effectively zero real-world value

**Conclusion:**
- ✅ Ad revenue is real and profitable
- ✅ Daily cap prevents player burnout
- ✅ Progression still gated by exponential upgrade costs
- ✅ System is sustainable long-term

#### **RE-EVALUATION TRIGGERS:**
⚠️ **Review this system when:**
1. Player retention drops (cap too restrictive?)
2. Ad fill rates decline (too many ads requested?)
3. USD cashout system implemented (resource value becomes real)
4. Player feedback indicates grinding issues
5. Before public launch / app store submission

**Alternative Models to Consider:**
- Energy/stamina system (100 energy, 20 per game, ads restore 50)
- Weekly caps instead of daily
- Premium subscription for unlimited attempts
- Dynamic caps based on player engagement level

---

## Future Features & To-Do List

### High Priority
- [ ] Add sound effects to all daily activities
  - Conveyor belt mechanical sounds
  - Pickaxe hitting coal
  - Water rushing in sluice box
  - Slot machine spin/win sounds
- [ ] Replace resource emojis with custom images
  - Rock: Gravel, Slate, Granite, Marble images
  - Coal: Lignite, Soft Coal, Anthracite, Diamond images
  - Gold: Gold Dust, Flakes, Nuggets, Bars images
  - Diamond: Shards, Pieces, Stones, Diamonds images
- [ ] Navigation integration (PropertyDetail → Daily Activities)

### Medium Priority
- Property selling/trading
- Leaderboards
- Social features (friends, messaging)
- Special events
- Achievement system
- Property neighborhoods/regions
- Weather effects on earnings
- Real cash out system for USD earnings

### Low Priority (Polish)
- Better ad error handling and user feedback
- Animations polish and timing adjustments
- Loading states for all async operations
- Offline mode improvements

## Git Workflow

### Commit Messages
- `feat: Add slot machine daily activity`
- `fix: Resolve lever rotation direction`
- `refactor: Extract reward generation logic`
- `docs: Update project instructions Phase 2`
- `style: Adjust reel positioning on slot machine`

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

**Last Updated**: February 18, 2026
**Version**: 2.1.0 (Phase 2 Week 5 - Memory Match + Daily Ad Caps)
**Developer**: @malichimo
