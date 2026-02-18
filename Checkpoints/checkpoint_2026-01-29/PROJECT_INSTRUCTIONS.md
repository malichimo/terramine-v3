# TerraMine Project Instructions
**Last Updated:** January 29, 2026  
**Version:** 1.1.0  
**Status:** ✅ All Features Operational

See CHECKPOINT_2026-01-29.md for detailed changelog.

---

## Project Overview
TerraMine is a location-based mobile game where users purchase virtual properties on a real-world grid, check in to properties owned by others, and earn passive income.

---

## 🔥 CRITICAL: Emoji Handling

### The Diamond Emoji Problem
**Issue:** Windows file operations corrupt UTF-8 emoji bytes, specifically the diamond emoji 💎

**Solution:**
```typescript
// ProfileScreen.tsx - getMineIcon function
const getMineIcon = (type: string) => {
  switch (type) {
    case 'rock': return '🪨';
    case 'coal': return '⚫';
    case 'gold': return '🟡';
    case 'diamond': return '\u{1F48E}';  // ⚠️ MUST use Unicode escape
    default: return '⬜';
  }
};
```

### Rules:
1. **NEVER hardcode emojis in JSX** - Always use `{getMineIcon('type')}`
2. **Diamond MUST use Unicode escape** - `'\u{1F48E}'` not `'💎'`
3. **Copy files safely** - Use PowerShell Copy-Item, not Windows CMD copy

### Safe File Copying:
```powershell
# ✅ PowerShell (BEST)
Copy-Item ProfileScreen.tsx C:\Users\malic\TerraMine\screens\ProfileScreen.tsx -Force

# ✅ VS Code: Copy/paste content
# ✅ Git Bash: cp command
# ❌ Windows CMD copy - CORRUPTS UTF-8
```

---

## Recent Changes (v1.1.0)

### New Features:
- ✅ Visitor nicknames in check-ins
- ✅ Photo display with base64 storage
- ✅ Centralized emoji rendering
- ✅ Unicode escape for diamond emoji

### Bug Fixes:
- ✅ Diamond emoji corruption (was "ðŸ'Ž")
- ✅ Money/trophy emoji issues
- ✅ Dollar amount cutoff in Portfolio tab

### Database Schema Updates:
```typescript
checkIns: {
  visitorNickname?: string;  // NEW
  photoUri?: string;         // NEW
}

properties: {
  ownerNickname: string;     // NEW
}
```

---

## Testing Checklist

### Emoji Display (CRITICAL):
- [ ] Diamond 💎 shows correctly in Portfolio tab
- [ ] Rock 🪨, Coal ⚫, Gold 🟡 display properly
- [ ] Money 💰 in TB badge and Activity tab
- [ ] Trophy 🏆 in Activity tab

### Features:
- [ ] Visitor nicknames show in Visitors tab (new check-ins only)
- [ ] Photos display in Visitors tab (new check-ins only)
- [ ] Dollar amounts fully visible in Portfolio tab
- [ ] No emoji corruption anywhere

---

## Quick Start

```bash
# Start dev server
npx expo start --dev-client

# Clear cache if needed
npx expo start --dev-client --clear

# Build (only if native changes)
npx eas-cli build --platform android --profile development
```

---

## Resources
- **Full Documentation:** See original PROJECT_INSTRUCTIONS_1-23-26.md
- **Detailed Changelog:** See CHECKPOINT_2026-01-29.md
- **Firebase:** console.firebase.google.com/project/terramine-5cda5
- **GitHub:** github.com/malichimo/terramine-v3

---

**Developer:** @malichimo  
**Status:** ✅ Production Ready  
**Build:** No rebuild required (JS changes only)
