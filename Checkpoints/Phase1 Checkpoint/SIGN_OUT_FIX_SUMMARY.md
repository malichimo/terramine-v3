# Sign Out Earnings Save Fix - Implementation Summary

## Problem Resolved
Your app was crashing on sign out because `MapScreen`'s `useEffect` cleanup function tried to save earnings **AFTER** the component unmounted due to sign out. At that point, the user was already signed out, so `request.auth` was null in Firebase, causing an error.

## Solution Implemented
Exposed a `saveBeforeSignOut()` function from MapScreen that MainNavigator calls **BEFORE** signing out, ensuring all data is saved while the user is still authenticated.

---

## Changes Made

### 1. ✅ `contexts/AuthContext.tsx` (Already Updated)
- **Change**: Added optional `onBeforeSignOut` callback parameter to `signOut()` function
- **Impact**: Allows the sign out flow to call a save function before actually signing out
- **Key Feature**: Callback is executed BEFORE Firebase sign out

```typescript
const signOut = async (onBeforeSignOut?: () => Promise<void>) => {
  if (onBeforeSignOut) {
    await onBeforeSignOut();
  }
  await firebaseSignOut(auth);
};
```

### 2. ✅ `screens/MapScreen.tsx` - Two Changes

#### Change 2a: Updated `useImperativeHandle` (lines 79-115)
- **Added Method**: `saveBeforeSignOut()` 
- **What It Does**:
  - Stops the earnings timer
  - Saves any accumulated earnings to Firebase
  - Saves the last active time
  - Includes error handling to prevent sign out from failing
  
```typescript
saveBeforeSignOut: async () => {
  // Stop earnings timer
  // Save accumulated earnings
  // Save last active time
}
```

#### Change 2b: Updated `useEffect` Cleanup (lines 262-273)
- **Removed**: Direct save calls from cleanup function
- **Added**: Comment explaining why cleanup no longer saves
- **Result**: Cleanup still runs on unmount but doesn't attempt to save (already done before sign out)

```typescript
useEffect(() => {
  initializeLocation();
  return () => {
    locationService.stopWatchingLocation();
    if (earningsTimerRef.current) {
      clearInterval(earningsTimerRef.current);
    }
    // NOTE: Don't save here - saveBeforeSignOut() is called explicitly before sign out
  };
}, []);
```

### 3. ✅ `MainNavigator.tsx` - Three Changes

#### Change 3a: Added State Management (lines 14-31)
- **Added**: `usdEarnings` state to track user's USD earnings
- **Added**: `boostState` state with free/ad boosts, expiration times
- **Impact**: Enables passing complete boost state to MapScreen

#### Change 3b: Updated `loadUserData()` (lines 55-67)
- **Added**: Loading and setting `usdEarnings` from Firebase
- **Added**: Loading and setting `boostState` from user data
- **Impact**: Bootstrap data is properly initialized from Firestore

#### Change 3c: Updated `handleSignOut()` (lines 161-170)
- **Changed From**: Generic callback-accepting function
- **Changed To**: Calls `signOut()` with MapScreen's save function as callback
- **Logic Flow**:
  1. Call `signOut(async () => { await mapRef.current.saveBeforeSignOut() })`
  2. AuthContext calls the callback to save data
  3. Then AuthContext calls Firebase sign out
  4. User is successfully signed out

#### Change 3d: Added Helper Functions (lines 136-158)
- **Added**: `handleBoostUpdate()` - Updates local boost state
- **Added**: `handleEarningsUpdate()` - Saves USD earnings to Firebase
- **Impact**: MapScreen can update parent state for boost and earnings

#### Change 3e: Updated MapScreen Props (lines 204-219)
- **Added**: `initialBoostState={boostState}`
- **Added**: `onBoostUpdate={handleBoostUpdate}`
- **Added**: `onEarningsUpdate={handleEarningsUpdate}`
- **Added**: `usdEarnings={usdEarnings}`
- **Impact**: MapScreen now has access to boost state and callbacks

### 4. ✅ `screens/ProfileScreen.tsx` - One Change

#### Change 4a: Simplified `onSignOut` Prop Type (lines 14)
- **Changed From**: `onSignOut: (saveDataCallback?: () => Promise<void>) => Promise<void>`
- **Changed To**: `onSignOut: () => Promise<void>`
- **Impact**: Cleaner API - ProfileScreen just calls `onSignOut()` without parameters

---

## Data Flow on Sign Out

```
User clicks "Logout" in ProfileScreen
  ↓
ProfileScreen.onPress() → calls onSignOut()
  ↓
MainNavigator.handleSignOut()
  ↓
signOut(async () => { await mapRef.current.saveBeforeSignOut() })
  ↓
AuthContext.signOut()
  1. Executes callback: mapRef.current.saveBeforeSignOut()
  2. MapScreen saves earnings & last active time to Firebase ✅
  3. User is still authenticated ✅
  ↓
Firebase signOut(auth)
  ↓
User logged out successfully ✅
```

---

## Error Prevention

**Before**: Cleanup tried to save after unmount → null auth → Firebase error ❌
**After**: Save explicitly called before unmount → valid auth → Success ✅

---

## Files Modified
1. ✅ `screens/MapScreen.tsx` - Added save function, updated cleanup
2. ✅ `MainNavigator.tsx` - Added state, handlers, and prop passing
3. ✅ `screens/ProfileScreen.tsx` - Simplified prop type
4. ✅ `contexts/AuthContext.tsx` - Already had callback support

## Pre-Existing Issues (Not Addressed)
The DatabaseService is missing the `updateBoostState()` method. This is a separate issue that needs to be resolved in `DatabaseService.ts`.

---

## Testing Recommendations
1. Log in and earn some money/boosts
2. Click "Logout" 
3. Verify earnings are saved to Firebase before sign out
4. Verify user successfully logs out
5. Log back in and confirm earnings persisted

