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
│   ├── LoginScreen.tsx              ← canonical login (screens/, NOT components/)
│   ├── MapScreen.tsx
│   ├── ProfileScreen.tsx
│   ├── PropertyDetailScreen.tsx
│   ├── SettingsScreen.tsx
│   ├── DailyActivityScreen.tsx      ← routes to activity by mine type
│   ├── UpgradeScreen.tsx
│   ├── VisitorLogScreen.tsx
│   ├── OnboardingScreen.tsx
│   ├── WelcomeScreen.tsx
│   └── activities/
│       ├── RockConveyorActivity.tsx
│       ├── CoalPileActivity.tsx
│       ├── SluiceBoxActivity.tsx
│       └── SlotMachineActivity.tsx
│   └── games/
│       ├── MemoryMatch/MemoryMatchScreen.tsx
│       ├── GoldRush/GoldRushGame.tsx
│       ├── MinerMaze/MinerMazeScreen.tsx
│       └── LaserBlast/LaserBlastGame.tsx
├── services/
│   ├── DatabaseService.ts
│   ├── DatabaseServicePhase2.ts
│   ├── LocationService.ts
│   ├── AdMobService.ts
│   ├── SoundService.ts
│   └── ConsentService.ts
├── contexts/
│   └── AuthContext.tsx
├── components/
│   ├── BoostModal.tsx
│   ├── EditProfileModal.tsx
│   ├── LoadingScreen.tsx
│   ├── PhotoModal.tsx
│   └── PropertyNicknameModal.tsx
│   ⚠️  LoginScreen.tsx also exists here — DO NOT USE, kept for reference only
├── utils/
│   ├── GridUtils.ts
│   ├── TimeUtils.ts
│   ├── MigrationUtils.ts
│   └── MemoryMatchConstants.ts
├── types/
│   └── PropertyTypes.ts
├── assets/
│   └── images/
│       ├── MinerImageClearBack.png
│       ├── MinerImage30Degree.png   ← 45° default headlamp cone
│       ├── MinerImage75Degree.png   ← 75° boosted headlamp cone
│       ├── resources/
│       │   ├── rock/{rock-common, rock-uncommon, rock-rare, rock-epic}.png
│       │   ├── coal/{coal-common, coal-uncommon, coal-rare, coal-epic}.png
│       │   ├── gold/{gold-common, gold-uncommon, gold-rare, gold-epic}.png
│       │   └── diamond/{diamond-common, diamond-uncommon, diamond-rare, diamond-epic}.png
│       └── maze/{floor, wall, ladder, hazard_*, exit, canary, ...}.png
├── App.tsx
├── MainNavigator.tsx
├── firebaseConfig.ts
└── app.json
```

## ⚠️ Known File Duplication
`components/LoginScreen.tsx` is an **old, outdated version** of the login screen. `App.tsx` must import from `screens/LoginScreen.tsx` (the correct one). The components version does **not** have Google Sign-In, Forgot Password, or password visibility. Do not use it.

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
  - Updates every second for display; saves to Firebase every 60 seconds
  - **Production Bonus**: Properties can be upgraded 1-100 for +1-99% earnings boost
  - **Important**: Counter shows total accumulated (never resets to zero)

### 2. Property System
- **Grid System**: Real-world divided into grid squares (~30 meters)
- **Mine Types**: Rock (60%), Coal (30%), Gold (9%), Diamond (1%)
- **Purchase Requirements**:
  - Must be within or adjacent to property
  - Costs 100 TB
  - Can only purchase unowned properties
- **Ownership**: Permanent until sold (future feature)
- **Property Details**: Each property has production level, game level, daily activities, custom name

### 3. Authentication
- Email/password sign-in and sign-up
- Google Sign-In via `@react-native-google-signin/google-signin`
- Forgot Password (sends reset email via Firebase)
- Change Password in Settings (requires current password — re-authenticates with Firebase)
- Friendly error messages for all auth errors including offline/network failures
- Facebook login: code exists but **deferred** — not in current build
- **App.tsx imports LoginScreen from `screens/` not `components/`**

### 4. Check-in System
- Must be within property boundaries
- Property must be owned by someone else
- Once per day per property (EST timezone)
- Optional message (+2 TB), optional photo (+2 TB)
- Firebase Storage upload for photos
- Earning Boost multiplier applies (2x when active)
- Visitor log viewable from map popup (navigates to PropertyDetail)

### 5. Earning Boost System
- **Free Boosts**: 4 per cycle; each adds 30 min; resets at 4 AM EST when all used
- **Ad Boosts**: Watch ad for +30 min; auto-refills 1 per 30 min; max 12 stored
- Maximum total boost: 8 hours (480 minutes)
- Boost state persists to Firebase across sessions

### 6. Daily Mining Activities
Each owned property has a daily mini-game based on mine type. Resets at 4 AM EST.

| Mine | Activity | Common | Uncommon | Rare | Epic |
|------|----------|--------|----------|------|------|
| Rock | Conveyor Belt | Gravel | Slate | Granite | Marble |
| Coal | Coal Pile | Lignite | Soft Coal | Anthracite | Diamond |
| Gold | Sluice Box | Gold Dust | Gold Nugget | Gold Bar | Pure Gold |
| Diamond | Slot Machine | Diamond Chip | Raw Diamond | Cut Diamond | Flawless Diamond |

- Base: 1 free attempt per day
- Watch ad for 2x rewards (first attempt only)
- Watch ad for +2 attempts — button available **before AND after** activity completes
- TB bonus: 25% chance per attempt (10/25/50/100 TB by mine type)
- Slot Machine: reward tier based on reel matches (jackpot → triple match)

### 7. Resource System
- **4 Tiers**: Common, Uncommon, Rare, Epic
- **4 Types**: Rock, Coal, Gold, Diamond — resources are **mine-type specific, not interchangeable**
- **Storage**: Separate pools per mine type in user document: `rockResources`, `coalResources`, `goldResources`, `diamondResources`
- **All fields use**: `{ common, uncommon, rare, epic }` — **never** `shards/pieces/stones/diamonds/unshards`
- Used for property upgrades (Production Level 1-100)

### 8. Property Upgrades
- Upgrade screen accessible from PropertyDetail
- Requires resources of matching mine type
- Each upgrade level: +1% production bonus
- Requires watching an ad to unlock each upgrade
- Cost scales exponentially (doubles each level)

### 9. Mini-Games
Each property type routes to a mini-game via the Mine Entrance:
- **Rock** → Memory Match
- **Coal** → Miner Maze
- **Gold** → Gold Rush
- **Diamond** → Laser Blast

Games award resources, TB, and XP. XP levels up the property's Game Level which increases game difficulty and rewards.

### 10. Miner Maze
- Player navigates a procedurally generated coal mine
- Headlamp cone lights cells ahead — default 45°, boosted 75°
- **Sprites**: `MinerImage30Degree.png` (default), `MinerImage75Degree.png` (boosted)
- Starts with 1 free Headlamp charge + 1 free Canary
- 4 power-ups: Headlamp (45°→75°, +1 via ad), Canary (free, warns of hazards), +30s (ad), +30 HP (ad)
- Mini-map overlay in bottom-left corner of viewport
- 3 difficulty levels: Easy (15×19), Medium (19×25), Hard (25×33)

### 11. Map Screen
- Map legend toggle button (bottom-right) explains tile colors
- Unowned tiles: "ROCK MINE — AVAILABLE" (not just "ROCK MINE")
- Other players' tiles: shows owner nickname (fetched from Firestore), not UID
- Other players' property popup includes "View Visitor Log" button
- Legend: green=available, orange=others', mine color + blue border=yours

### 12. Settings Screen
- **Change Password** (not "Reset Password") — requires current password, re-authenticates with Firebase
- **Reset Password** (forgot password flow) stays on the Login screen only
- Sound Effects toggle, Music toggle (coming soon), Push Notifications (coming soon)
- Privacy Policy and Terms of Service links
- Account deletion (double-confirmation, Apple-compliant)
- App version display

## Firebase Data Structure

### Users Collection
```typescript
{
  email: string;
  nickname?: string;                    // Display name shown to other players
  tbBalance: number;
  usdEarnings: number;
  totalCheckIns: number;
  totalTBEarned: number;
  lastActiveAt: string;                 // ISO timestamp — used for offline earnings

  // Boost tracking
  freeBoostsRemaining: number;          // 0-4
  adBoostsRemaining: number;            // 0-12
  boostExpiresAt: string | null;
  nextFreeBoostResetAt: string | null;
  lastAdBoostRefillAt: string;

  // Resource pools — all use common/uncommon/rare/epic fields
  rockResources:    { common: number, uncommon: number, rare: number, epic: number };
  coalResources:    { common: number, uncommon: number, rare: number, epic: number };
  goldResources:    { common: number, uncommon: number, rare: number, epic: number };
  diamondResources: { common: number, uncommon: number, rare: number, epic: number };

  createdAt: string;
}
```

### Properties Collection
```typescript
{
  id: string;                           // Grid coordinate "x_y"
  ownerId: string;
  mineType: 'rock' | 'coal' | 'gold' | 'diamond';
  centerLat: number;
  centerLng: number;
  corners: Array<{latitude: number, longitude: number}>;
  purchasedAt: string;
}
```

### PropertyDetails Collection
```typescript
{
  propertyId: string;
  customName?: string;
  productionLevel: number;              // 1-100
  gameLevel: number;
  gameXP: number;                       // 0-999
  gamesPlayed: number;
  gamesWon: number;
  dailyActivitiesRemaining: number;     // resets at 4 AM EST
  doubleRewardAvailable: boolean;
  lastDailyReset: string;
  adAttemptsUsedToday: number;
  lastAdAttemptDate: string;
  createdAt: string;
  lastUpdated: string;
}
```

### CheckIns Collection
```typescript
{
  userId: string;
  propertyId: string;
  propertyOwnerId: string;
  message?: string;
  hasPhoto: boolean;
  photoURL?: string;
  visitorNickname?: string;
  timestamp: string;
}
```

## Key Learnings & Gotchas

### Critical Bugs Fixed (March 2026)
- **Resource NaN bug**: `DatabaseServicePhase2.ts` was using wrong field names (`shards`, `unshards`, `pieces`, `stones`) instead of the correct ones from `PropertyTypes.ts` (`common`, `uncommon`, `rare`, `epic`). All resource operations now use correct field names.
- **Slot Machine crash**: `SoundService.play()` was called as `SoundService.play()` (capital S, static) instead of `soundService.play()` (singleton instance). Caused reward calculation to silently fail.
- **LoginScreen duplication**: `App.tsx` was importing from `components/LoginScreen.tsx` (old, no Google Sign-In) instead of `screens/LoginScreen.tsx`. Fixed in `App.tsx` import path.
- **CRUSHER text overlap**: Rock Conveyor `crusherArea` View was always rendered. Now only renders while `isRunning === true`.

### Architecture Patterns
- **Route params are snapshots**: After Firestore writes, re-fetch into separate `liveDetails` state rather than relying on stale route params
- **Absolute positioning on Android**: `alignSelf: 'center'` doesn't work on absolute-positioned elements — use `left: 0, right: 0, alignItems: 'center'` on container
- **Navigator components in render**: Defining navigator components inside render body causes full remount on every parent state change — define as top-level components
- **SoundService API**: Use existing `soundService` singleton with `soundService.play()` / `soundService.stop()` and snake_case keys — do not rewrite the service
- **Navigation after games**: Use `navigation.goBack()` not `navigation.navigate('PropertyDetail')` to avoid loops
- **Firebase falsy values**: Use `??` not `||` when reading Firebase data to avoid incorrect falsy handling
- **AdMob listener stacking**: Remove permanent `EARNED_REWARD` and `CLOSED` listeners before calling `showAd()` to prevent double-firing. Restore via `initializeAd()` after close.

### Resource Field Names
Always use `common / uncommon / rare / epic` in code. Never use `shards / pieces / stones / diamonds / unshards`. The `ResourcePool`, `DailyReward`, `GameReward`, and `UpgradeCost` types in `PropertyTypes.ts` all use `common/uncommon/rare/epic`.

### MinerMaze Sprite Convention
- `MinerImage30Degree.png` = default (45° cone), facing right
- `MinerImage75Degree.png` = boosted headlamp (75° cone), facing right
- Canvas size: 1420×1420px (diagonal of 1000×1000 to prevent corner clipping during rotation)
- Switch sprite based on `pu.boosted` state

## Development Workflow

### Standard Workflow (No Rebuild Needed)
1. Make code changes in VS Code
2. Save files
3. `npx expo start --dev-client`
4. App reloads on device
5. `git add . && git commit -m "message" && git push`

### When Rebuild Is Required
- Adding/removing native npm packages
- Changing `app.json`
- Updating app permissions
- Changing app name, icon, or package identifier

**Build command**: `npx eas-cli build --platform android --profile preview`
**Production build**: `npx eas-cli build --platform all --profile production`

### Build Limit Management
- Free plan: 30 builds/month
- Batch native changes together
- Test all JS changes with dev build first

## Coding Standards

### TypeScript
- Strict mode
- Explicit types for all function parameters
- Interface for all component props
- Use `??` instead of `||` for null checking (falsy value safety)
- Avoid `any` unless absolutely necessary

### React Native
- Functional components with hooks only
- `useRef` for services (DatabaseService, AdMobService, etc.)
- Proper cleanup in `useEffect` return functions
- Android safe area: `paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0`

### State Management
- Local state with `useState` for UI
- Props for data flow
- Firebase as source of truth
- Always reload property details when returning from activities (use focus listener)

## UI/UX Guidelines

### Colors
- Primary Blue: `#2B6B94` (buttons, title)
- Success Green: `#4CAF50` / `#7CAA2D` (earnings, subtitle)
- Warning Orange: `#FF9800` (active boost, others' properties)
- Purple: `#9C27B0` (ad buttons)
- Background: `#f5f5f5`
- Disabled: `#cccccc`

### Map Property Colors
- Unowned: fill `rgba(76,175,80,0.3)`, stroke `#4CAF50`
- Your properties: fill = mine color (gray/black/gold/light blue), stroke `#2196F3`
- Others' properties: fill `rgba(255,152,0,0.6)`, stroke `#E65100`

### Mine Type Colors
- Rock: `#808080`
- Coal: `#000000`
- Gold: `#FFD700`
- Diamond: `#B9F2FF`

## Troubleshooting

### Resources showing NaN in Firestore
Old data may have NaN values from the field name bug. Fix manually in Firebase console: set `rockResources.diamonds`, `rockResources.pieces`, and any other NaN fields to `0`. The code fix prevents future NaN values but does not repair existing data.

### "Ads not ready" after watching some ads
Caused by listener stacking in `AdMobService`. Fixed in March 2026 — permanent listeners are removed before `showAd()` and restored after close. If still occurring, check that the updated `AdMobService.ts` is deployed.

### LoginScreen showing old version (no Google button)
`App.tsx` was importing from `components/LoginScreen.tsx`. Fixed — must import from `screens/LoginScreen.tsx`. Delete `components/LoginScreen.tsx` to prevent future confusion.

### Slot Machine not calculating rewards
`SoundService` was called as a static class instead of the singleton. Fixed — always use `soundService.play()` (lowercase s, imported singleton).

### App crashes on launch
1. Check console logs with `npx expo start --dev-client`
2. Verify Firebase config
3. Check for missing npm packages
4. Ensure `MinerImage75Degree.png` exists in `assets/images/`

### Earnings not updating
- Verify properties are owned
- Check timer is running
- Confirm Firebase saves are succeeding

### Daily activities not resetting
- Check `TimeUtils.shouldResetDailyActivity()` logic
- Verify `lastDailyReset` timestamp in Firebase
- Confirm 4 AM EST boundary calculation

## Monetization

### Ad System
- Daily activities: 1 free attempt/day, watch ad for 2x (first only), watch ad for +2 attempts
- Max 6 extra attempts/day via ads (3 ads × 2 attempts)
- Boost system: ad boosts for +30 min each
- Upgrade system: ad required to unlock each upgrade level

### Economics
- 4 mine types × up to 3 ads each = 12 ads/day max per active player
- Average CPM: ~$10-20
- Revenue per player per day: ~$0.12-0.24

## Debug Commands
```bash
npx expo start --dev-client    # Dev server with hot reload
npx expo start --clear         # Clear Metro cache
npx eas-cli build:list         # Check build history
npx eas-cli build:view --platform android
```

## Project Links
- Firebase Console: https://console.firebase.google.com/project/terramine-5cda5
- Google Cloud: https://console.cloud.google.com/ (project: terramine-5cda5)
- EAS Builds: https://expo.dev/accounts/malichimo/projects/TerraMine
- GitHub: https://github.com/malichimo/terramine-v3
- Package: `com.terramine.app`

---

**Last Updated**: March 17, 2026
**Version**: 2.2.0 (Phase 2 Bug Fix Sprint)
**Developer**: @malichimo
