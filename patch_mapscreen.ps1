$f = "screens\MapScreen.tsx"
$c = [System.IO.File]::ReadAllText($f)

# 1. Add SystemMineService import
$c = $c -replace "import \{ generateGridSquare, getVisibleGridSquares, isWithinGridSquare, isAdjacentToUser, GridSquare, gridToLatLng \} from '\.\./utils/GridUtils';", "import { generateGridSquare, getVisibleGridSquares, isWithinGridSquare, isAdjacentToUser, GridSquare, gridToLatLng } from '../utils/GridUtils';`nimport { createSystemMineNear, isSystemMine, SYSTEM_CHECKIN_REWARD_TB } from '../services/SystemMineService';"

# 2. Change base TB from 1 to 3
$c = $c -replace "let tbEarned = 1;", "let tbEarned = 3; // Raised from 1 (Apr 17)"

# 3. Add system mine creation after first purchase milestone line
$c = $c -replace "dbService\.checkAndFireMilestone\(userId, 'milestone_firstPurchase'\)\.catch\(\(\) => \{\}\);", "dbService.checkAndFireMilestone(userId, 'milestone_firstPurchase').catch(() => {});`n`n      // Create system mine on first purchase`n      if (ownedProperties.length === 0) {`n        createSystemMineNear(updatedSquare).then(systemMine => {`n          if (systemMine) {`n            setAllProperties(prev => prev.some(p => p.id === systemMine.id) ? prev : [...prev, systemMine]);`n          }`n        }).catch(e => console.warn('System mine (non-fatal):', e));`n      }"

# 4. Fix check-in modal subtitle and add greeting
$c = $c -replace "Checking in to \{selectedSquare\.mineType\} mine", "{selectedSquare.customName || (selectedSquare.mineType + ' mine')}"

[System.IO.File]::WriteAllText($f, $c)
Write-Host "Patched. Line count:"
(Get-Content $f).Count
