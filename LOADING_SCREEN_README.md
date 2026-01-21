# TerraMine Loading Screen Update

## Files Added/Updated

### New Components
- `components/LoadingScreen.tsx` - Branded loading screen with TerraMine logo

### Assets
- `assets/terramine_logo.png` - TerraMine logo (globe with pickaxe)

### Updated Files
- `App.tsx` - Now imports and uses LoadingScreen
- `MainNavigator.tsx` - Now imports and uses LoadingScreen

## Installation Instructions

1. **Copy the assets folder** to your project root:
   ```
   /assets/terramine_logo.png
   ```

2. **Copy the components folder** to your project root:
   ```
   /components/LoadingScreen.tsx
   ```

3. **Replace these files** in your project root:
   - `App.tsx`
   - `MainNavigator.tsx`

## Features

The new loading screen includes:
- **TerraMine logo** - The globe with pickaxe logo
- **App title** - "TerraMine" in Deep Ocean Blue (#2B6B94)
- **Tagline** - "Earn real money by visiting friends" in Earth Green (#7CAA2D)
- **Loading indicator** - Sky Blue spinner (#5CB3E6)
- **Footer text** - "Loading your world..."

## Brand Colors Used

All colors match the TerraMine logo:
- Sky Blue: `#5CB3E6` (loading spinner)
- Earth Green: `#7CAA2D` (tagline)
- Deep Ocean Blue: `#2B6B94` (title)

## When It Shows

The loading screen appears:
1. When the app first launches (checking authentication)
2. When loading user data from Firebase
3. Anytime the app needs to load initial data

## Preview

```
┌────────────────────────────┐
│                            │
│      [TerraMine Logo]      │
│     (Globe with Pickaxe)   │
│                            │
│       TerraMine            │
│ Earn real money by         │
│   visiting friends         │
│                            │
│     [Loading Spinner]      │
│                            │
│  Loading your world...     │
│                            │
└────────────────────────────┘
```
