// screens/games/GoldRush/GoldRushGame.tsx
// Gold Rush puzzle game for Gold Mine properties
// Tap road tiles to rotate them — connect the Leprechaun to the Pot of Gold!

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  SafeAreaView,
  Alert,
  Platform,
  StatusBar,
} from 'react-native';
import { useAuth } from '../../../contexts/AuthContext';
import { dbServicePhase2 } from '../../../services/DatabaseServicePhase2';
import { AdMobService } from '../../../services/AdMobService';
import { soundService } from '../../../services/SoundService';
import { getResourceNames } from '../../../utils/ResourceNames';
// Local GameReward type — avoids re-export resolution issues
interface GameReward {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
  tb: number;
  propertyXP: number;
}
import {
  GameTile,
  PuzzleConfig,
  generatePuzzle,
  findPath,
  markPath,
  rotateTile,
  calculateScore,
  getDifficultyLabel,
  getGoldRushGridSize,
  getGoldRushMovesLimit,
  getGoldRushPerfectThreshold,
} from '../../../utils/GoldRushEngine';

// ─── Assets ───────────────────────────────────────────────────────────────────
const TILE_IMAGES: Record<string, any> = {
  grass:        require('../../../assets/images/gold-mine/tile-grass.png'),
  straight:     require('../../../assets/images/gold-mine/tile-straight-h.png'),
  curve:        require('../../../assets/images/gold-mine/tile-curve.png'),
  'dead-end':   require('../../../assets/images/gold-mine/tile-dead-end.png'),
  cross:        require('../../../assets/images/gold-mine/tile-cross.png'),
  't-junction': require('../../../assets/images/gold-mine/tile-t-junction.png'),
};

const LEPRECHAUN_IDLE      = require('../../../assets/images/gold-mine/leprechaun-idle.png');
const LEPRECHAUN_WALK      = require('../../../assets/images/gold-mine/leprechaun-walk.png');
const LEPRECHAUN_CELEBRATE = require('../../../assets/images/gold-mine/leprechaun-celebrate.png');
const POT_OF_GOLD          = require('../../../assets/images/gold-mine/pot-of-gold.png');
const GOLD_SPARKLE         = require('../../../assets/images/gold-mine/gold-sparkle.png');
const BACKGROUND           = require('../../../assets/images/gold-mine/gold-mine-bg.png');

// ─── Types & constants ────────────────────────────────────────────────────────
type GamePhase = 'puzzle' | 'walking' | 'celebrating' | 'gameover';

const { width: SW, height: SH } = Dimensions.get('window');
const HEADER_H = 80;
const FOOTER_H = 100;
const PADDING  = 12;
const AVAIL_W  = SW - PADDING * 2;
const AVAIL_H  = SH - HEADER_H - FOOTER_H - PADDING * 2;

// ─── Component ────────────────────────────────────────────────────────────────
export default function GoldRushGame({ route, navigation }: any) {
  const { property, propertyDetails, onBalanceUpdate } = route.params;
  const { user } = useAuth();

  const gameLevel  = propertyDetails?.gameLevel ?? 1;
  const difficulty = dbServicePhase2.getGameDifficulty(gameLevel);
  const gridSize   = getGoldRushGridSize(gameLevel); // GoldRush starts at 4×4
  const timeLimit  = difficulty.timeLimit;
  // ✅ BUG-048 FIX: use GoldRush-specific tap budget instead of
  // getGameDifficulty().movesLimit which was designed for MinerMaze and
  // returned null for levels 1–25 (no limit at all on the easiest levels).
  const movesLimit = getGoldRushMovesLimit(gameLevel);
  const TILE_SIZE  = Math.floor(Math.min(AVAIL_W, AVAIL_H) / gridSize);

  // ── State ──────────────────────────────────────────────────────────────────
  const [tiles, setTiles]       = useState<GameTile[][]>([]);
  const [phase, setPhase]       = useState<GamePhase>('puzzle');
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  const [tapsUsed, setTapsUsed] = useState(0);
  const [score, setScore]       = useState(0);
  const [lepImage, setLepImage] = useState<any>(LEPRECHAUN_IDLE);
  const [reward, setReward]     = useState<GameReward | null>(null);
  const [leveledUp, setLeveledUp] = useState(false);
  const [newLevel, setNewLevel]   = useState(gameLevel);
  const [adLevelLoading, setAdLevelLoading] = useState(false);

  // ✅ BUG-009 FIX: liveDetails holds the up-to-date property details including XP.
  // propertyDetails (route param) is a snapshot from navigation — it never updates.
  // After each game saveResult(), we re-fetch and store here so the XP meter reflects reality.
  const [liveDetails, setLiveDetails] = useState(propertyDetails);

  // ── Animated values ────────────────────────────────────────────────────────
  const lepX         = useRef(new Animated.Value(0)).current;
  const lepY         = useRef(new Animated.Value(0)).current;
  const lepScale     = useRef(new Animated.Value(1)).current;
  const sparkleOp    = useRef(new Animated.Value(0)).current;
  const sparkleScale = useRef(new Animated.Value(0.5)).current;

  // Per-tile rotation animated values (keyed by "row,col")
  const tileAnims = useRef<Record<string, Animated.Value>>({});

  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultSaved     = useRef(false);
  const activeLevelRef  = useRef(gameLevel);  // tracks level across restarts
  const puzzleRef       = useRef<PuzzleConfig | null>(null);
  const adService       = useRef<AdMobService | null>(null);

  // ✅ FIX: Track mounted state to prevent setState/navigation calls after unmount
  const isMounted = useRef(true);

  const [outOfMoves, setOutOfMoves] = useState(false);
  const [adLoading, setAdLoading]   = useState(false);

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    initNewPuzzle();
    adService.current = new AdMobService();

    // ✅ BUG-028 FIX: Destroy the ad on unmount so the native AVPlayer (iOS) /
    // ExoPlayer (Android) is torn down before the component is deallocated.
    // Without this, pending notification observers fire on a freed object →
    // EXC_BAD_ACCESS on iOS / equivalent crash on Android.
    return () => {
      isMounted.current = false;
      adService.current?.destroyAd();
    };
  }, []);

  function initNewPuzzle() {
    const p = generatePuzzle(gridSize, gameLevel);
    puzzleRef.current = p;
    setTiles(p.tiles);
    initTileAnims(p.tiles);
    // Place leprechaun centered on the start grass tile
    lepX.setValue(p.startCell.col * TILE_SIZE + TILE_SIZE * 0.175);
    lepY.setValue(p.startCell.row * TILE_SIZE + TILE_SIZE * 0.05);
  }

  function initTileAnims(grid: GameTile[][]) {
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const k = `${r},${c}`;
        if (!tileAnims.current[k]) {
          tileAnims.current[k] = new Animated.Value(grid[r][c].rotation);
        } else {
          tileAnims.current[k].setValue(grid[r][c].rotation);
        }
      }
    }
  }

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'puzzle') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // ── Tile tap ───────────────────────────────────────────────────────────────
  const handleTileTap = useCallback((row: number, col: number) => {
    if (phase !== 'puzzle') return;

    const tile = tiles[row][col];

    // Can't rotate grass, start, or end tiles
    if (tile.type === 'grass' || tile.isStart || tile.isEnd) return;

    if (movesLimit !== null && tapsUsed >= movesLimit) {
      setOutOfMoves(true);
      return;
    }

    soundService.play('rotate');

    // Animate the rotation
    const k = `${row},${col}`;
    const anim = tileAnims.current[k];
    if (!anim) return;
    const nextRot = tile.rotation + 90; // accumulate so animation is smooth
    Animated.timing(anim, {
      toValue: nextRot,
      duration: 160,
      useNativeDriver: true,
    }).start(() => anim.setValue(nextRot % 360));

    // Update tile state
    const newTiles = tiles.map(r => r.map(t => ({ ...t })));
    newTiles[row][col] = rotateTile(tile);
    const newTaps = tapsUsed + 1;
    setTapsUsed(newTaps);

    // Check for completed path
    const p = puzzleRef.current!;
    const path = findPath(newTiles, p.startCell, p.endCell);
    if (path) {
      clearInterval(timerRef.current!);
      setTiles(markPath(newTiles, path));
      const finalScore = calculateScore(timeLeft, timeLimit, newTaps, true);
      setScore(finalScore);
      startWalkAnimation(path, finalScore, newTaps, timeLeft);
    } else {
      // Clear old path highlights
      setTiles(newTiles.map(r => r.map(t => ({ ...t, isOnPath: false }))));
    }
  }, [phase, tiles, tapsUsed, movesLimit, timeLeft, timeLimit]);

  // ── Walk animation ─────────────────────────────────────────────────────────
  function startWalkAnimation(
    path: Array<{ row: number; col: number }>,
    finalScore: number,
    finalTaps: number,
    finalTimeLeft: number
  ) {
    setPhase('walking');
    setLepImage(LEPRECHAUN_WALK);
    const STEP_MS = 260;

    const anims = path.map(({ row, col }) =>
      Animated.parallel([
        Animated.timing(lepX, {
          toValue: col * TILE_SIZE + TILE_SIZE * 0.175,
          duration: STEP_MS,
          useNativeDriver: true,
        }),
        Animated.timing(lepY, {
          toValue: row * TILE_SIZE + TILE_SIZE * 0.05,
          duration: STEP_MS,
          useNativeDriver: true,
        }),
      ])
    );

    Animated.sequence(anims).start(() => handleWin(finalScore, finalTaps, finalTimeLeft));
  }

  // ── Win / timeout ──────────────────────────────────────────────────────────
  function handleWin(finalScore: number, finalTaps: number, finalTimeLeft: number) {
    soundService.play('win');
    setPhase('celebrating');
    setLepImage(LEPRECHAUN_CELEBRATE);

    Animated.sequence([
      Animated.spring(lepScale, { toValue: 1.5, useNativeDriver: true }),
      Animated.spring(lepScale, { toValue: 1.0, useNativeDriver: true }),
    ]).start();

    Animated.parallel([
      Animated.timing(sparkleOp,    { toValue: 1,   duration: 300, useNativeDriver: true }),
      Animated.spring(sparkleScale, { toValue: 1.5, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() =>
        Animated.timing(sparkleOp, { toValue: 0, duration: 600, useNativeDriver: true }).start(),
      1400);
    });

    saveResult(true, finalScore, finalTaps, finalTimeLeft);
  }

  function handleTimeout() {
    if (phase !== 'puzzle') return;
    soundService.play('lose');
    setPhase('gameover');
    saveResult(false, 0, tapsUsed, 0);
  }

  async function saveResult(won: boolean, finalScore: number, finalTaps: number, finalTimeLeft: number) {
    if (resultSaved.current || !user) return;
    resultSaved.current = true;
    try {
      // ✅ BUG-048 FIX: perfect threshold was gridSize * 2 (8/10/12 taps) —
      // far too tight for a winding path. Now gridSize * 3 (12/15/18 taps).
      const perfect = won && finalTaps <= getGoldRushPerfectThreshold(gridSize);
      const levelBefore = propertyDetails?.gameLevel ?? gameLevel;
      const earned = await dbServicePhase2.recordGameResult(
        user.uid, property.id, property.mineType,
        won, perfect, finalScore, finalTimeLeft, finalTaps
      );
      if (!isMounted.current) return;
      setReward(earned as GameReward);

      // ✅ BUG-027 FIX: Notify parent of TB earned so map screen balance
      // updates immediately without requiring a re-login.
      if (earned?.tb && onBalanceUpdate) {
        onBalanceUpdate(earned.tb);
      }

      // ✅ BUG-009 FIX: Re-fetch and store into liveDetails so the XP meter
      //    updates immediately — route.params is a stale snapshot and never changes
      const updated = await dbServicePhase2.getPropertyDetails(property.id);
      if (!isMounted.current) return;
      if (updated) {
        setLiveDetails(updated);
        if (updated.gameLevel > levelBefore) {
          setLeveledUp(true);
          setNewLevel(updated.gameLevel);
          activeLevelRef.current = updated.gameLevel;
        }
      }
    } catch (e) {
      console.error('Error saving game result:', e);
    }
  }

  // ── Ad for extra moves ────────────────────────────────────────────────────
  async function handleAdForMoves() {
    if (!adService.current) return;

    // ✅ FIX: Check ad readiness before attempting to show
    if (!adService.current.isAdReady()) {
      Alert.alert(
        'Ad Not Ready',
        'The ad is still loading. Please wait a moment and try again.',
        [{ text: 'OK' }]
      );
      return;
    }

    setAdLoading(true);
    try {
      const shown = await adService.current.showAd(
        () => {
          // Rewarded: grant 3 extra moves
          if (!isMounted.current) return;
          setOutOfMoves(false);
          setAdLoading(false);
          // Reduce tapsUsed by 3 to effectively grant 3 extra moves
          setTapsUsed(prev => Math.max(0, prev - 3));
        },
        () => {
          // Ad closed without reward
          if (!isMounted.current) return;
          setAdLoading(false);
        }
      );

      if (!shown) {
        // showAd returned false — ad wasn't ready despite our check (race condition)
        if (!isMounted.current) return;
        setAdLoading(false);
        Alert.alert(
          'Ad Unavailable',
          'Could not load an ad right now. Please try again in a moment.',
          [{ text: 'OK' }]
        );
      }
    } catch {
      if (!isMounted.current) return;
      setAdLoading(false);
    }
  }

  // ── Ad to play next level ─────────────────────────────────────────────────
  async function handlePlayNextLevel() {
    if (!adService.current) return;

    // ✅ FIX: Check ad readiness before attempting to show — prevents crash
    // when user taps immediately after level-up before ad has loaded
    if (!adService.current.isAdReady()) {
      Alert.alert(
        'Ad Not Ready',
        'The ad is still loading. Please wait a moment and try again.',
        [{ text: 'OK' }]
      );
      return;
    }

    setAdLevelLoading(true);
    try {
      const shown = await adService.current.showAd(
        async () => {
          // Rewarded: fetch fresh propertyDetails and replace screen
          const updated = await dbServicePhase2.getPropertyDetails(property.id);
          // ✅ FIX: Guard navigation — component may have unmounted during async Firestore fetch
          if (!isMounted.current) return;
          setAdLevelLoading(false);
          navigation.replace('GoldRush', {
            property,
            userId: user?.uid ?? '',
            propertyDetails: updated ?? propertyDetails,
          });
        },
        () => {
          // Ad closed without reward
          if (!isMounted.current) return;
          setAdLevelLoading(false);
        }
      );

      if (!shown) {
        // showAd returned false — ad wasn't ready despite our check (race condition)
        if (!isMounted.current) return;
        setAdLevelLoading(false);
        Alert.alert(
          'Ad Unavailable',
          'Could not load an ad right now. Please try again in a moment.',
          [{ text: 'OK' }]
        );
      }
    } catch {
      if (!isMounted.current) return;
      setAdLevelLoading(false);
    }
  }

  // ── Restart ────────────────────────────────────────────────────────────────
  function restart() {
    if (timerRef.current) clearInterval(timerRef.current);
    resultSaved.current = false;
    setOutOfMoves(false);
    lepScale.setValue(1);
    sparkleOp.setValue(0);
    sparkleScale.setValue(0.5);
    setPhase('puzzle');
    setTimeLeft(timeLimit);
    setTapsUsed(0);
    setScore(0);
    setLepImage(LEPRECHAUN_IDLE);
    setReward(null);
    setLeveledUp(false);
    setNewLevel(gameLevel);
    initNewPuzzle();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!puzzleRef.current || tiles.length === 0) return null;

  const p = puzzleRef.current;
  const timerColor = timeLeft <= 10 ? '#F44336' : timeLeft <= 20 ? '#FF9800' : '#7CFC00';

  // ✅ BUG-062 FIX: mine-type-specific resource tier names for the win overlay
  // (was hardcoded "Common"/"Uncommon"/"Rare", no "Epic" row at all).
  const resourceNames = getResourceNames(property.mineType);

  return (
    <SafeAreaView style={styles.safe}>
      <Image source={BACKGROUND} style={styles.bg} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnTxt}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.hCenter}>
          <Text style={styles.hTitle}>🏅 Gold Rush</Text>
          <Text style={styles.hSub}>Level {leveledUp ? newLevel : gameLevel} · {getDifficultyLabel(gameLevel)}</Text>
          {/* XP meter — always visible */}
          <View style={styles.xpMeterRow}>
            <View style={styles.xpMeterBg}>
              <View style={[styles.xpMeterFill, {
                // ✅ BUG-009 FIX: read from liveDetails, not propertyDetails (stale snapshot)
                width: `${Math.min(100, ((liveDetails?.gameXP ?? 0) / 1000) * 100)}%`
              }]} />
            </View>
            <Text style={styles.xpMeterTxt}>{liveDetails?.gameXP ?? 0}/1000 XP</Text>
          </View>
        </View>
        <View style={styles.hRight}>
          <Text style={[styles.timerTxt, { color: timerColor }]}>⏱ {timeLeft}s</Text>
          {movesLimit && (
            <Text style={styles.movesTxt}>
              🔄 {Math.max(0, movesLimit - tapsUsed)} left
            </Text>
          )}
        </View>
      </View>

      {/* ── Grid ── */}
      <View style={styles.gridOuter}>
        <View style={[styles.grid, { width: gridSize * TILE_SIZE, height: gridSize * TILE_SIZE }]}>

          {tiles.map((row, r) =>
            row.map((tile, c) => {
              const k = `${r},${c}`;
              const anim = tileAnims.current[k];
              const rotateDeg = anim
                ? anim.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] })
                : '0deg';

              const isInteractive = tile.type !== 'grass' && !tile.isStart && !tile.isEnd;

              return (
                <TouchableOpacity
                  key={k}
                  activeOpacity={isInteractive ? 0.75 : 1}
                  onPress={() => handleTileTap(r, c)}
                  style={[styles.tileWrap, {
                    width:  TILE_SIZE,
                    height: TILE_SIZE,
                    left:   c * TILE_SIZE,
                    top:    r * TILE_SIZE,
                  }]}
                >
                  {/* Base grass layer — always visible */}
                  <Image
                    source={TILE_IMAGES.grass}
                    style={styles.tileImg}
                  />

                  {/* Road overlay — rotated, shown only for non-grass tiles */}
                  {tile.type !== 'grass' && (
                    <Animated.Image
                      source={TILE_IMAGES[tile.type]}
                      style={[styles.tileImg, { transform: [{ rotate: rotateDeg }] }]}
                    />
                  )}

                  {/* Golden path glow when complete */}
                  {tile.isOnPath && (
                    <View style={[styles.pathGlow, { width: TILE_SIZE, height: TILE_SIZE }]} />
                  )}

                  {/* ── Start tile: Static leprechaun — hidden once walking starts ── */}
                  {tile.isStart && phase === 'puzzle' && (
                    <Image
                      source={LEPRECHAUN_IDLE}
                      style={{
                        position: 'absolute',
                        width:  TILE_SIZE * 0.9,
                        height: TILE_SIZE * 0.9,
                        top:  TILE_SIZE * 0.05,
                        left: TILE_SIZE * 0.05,
                      }}
                      resizeMode="contain"
                    />
                  )}

                  {/* ── End tile: Pot of Gold ── */}
                  {tile.isEnd && (
                    <Image
                      source={POT_OF_GOLD}
                      style={{
                        position: 'absolute',
                        width:  TILE_SIZE * 0.9,
                        height: TILE_SIZE * 0.9,
                        top:  TILE_SIZE * 0.05,
                        left: TILE_SIZE * 0.05,
                      }}
                      resizeMode="contain"
                    />
                  )}
                </TouchableOpacity>
              );
            })
          )}

          {/* ── Animated leprechaun (only visible when walking or celebrating) ── */}
          {phase !== 'puzzle' && (
            <Animated.View
              pointerEvents="none"
              style={[styles.lepWrap, {
                width:  TILE_SIZE * 0.75,
                height: TILE_SIZE * 0.75,
                transform: [
                  { translateX: lepX },
                  { translateY: lepY },
                  { scale: lepScale },
                ],
              }]}
            >
              <Image
                source={lepImage}
                style={{ width: TILE_SIZE * 0.75, height: TILE_SIZE * 0.75 }}
                resizeMode="contain"
              />
            </Animated.View>
          )}

          {/* ── Sparkle burst on the pot at win ── */}
          <View
            pointerEvents="none"
            style={[styles.sparkle, {
              position: 'absolute',
              width:  TILE_SIZE * 1.4,
              height: TILE_SIZE * 1.4,
              left:   p.endCell.col * TILE_SIZE - TILE_SIZE * 0.2,
              top:    p.endCell.row * TILE_SIZE - TILE_SIZE * 0.2,
            }]}
          >
            <Animated.Image
              source={GOLD_SPARKLE}
              style={{
                width: '100%',
                height: '100%',
                opacity:   sparkleOp,
                transform: [{ scale: sparkleScale }],
              }}
            />
          </View>
        </View>
      </View>

      {/* ── Footer ── */}
      <View style={styles.footer}>
        {phase === 'puzzle' && (
          <Text style={styles.hint}>
            🔄 Tap road tiles to rotate · Connect the path to the Pot of Gold!
          </Text>
        )}
        {phase === 'walking' && (
          <Text style={styles.hint}>🍀 The leprechaun found the golden path!</Text>
        )}
        {phase === 'celebrating' && (
          <View style={styles.resultPanel}>
            {/* Level-up banner */}
            {leveledUp && (
              <View style={styles.levelUpBanner}>
                <Text style={styles.levelUpTxt}>⬆️ LEVEL UP! Now Level {newLevel}</Text>
                {adLevelLoading ? (
                  <Text style={[styles.levelUpTxt, { marginTop: 6 }]}>⏳ Loading ad...</Text>
                ) : (
                  <TouchableOpacity style={styles.levelUpAdBtn} onPress={handlePlayNextLevel}>
                    <Text style={styles.levelUpAdTxt}>📺 Watch Ad → Play Level {newLevel}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            <Text style={styles.winTitle}>🏆 Pot of Gold Found!</Text>
            {/* Score + taps */}
            <Text style={styles.winScore}>Score: {score}  ·  Taps: {tapsUsed}</Text>
            {/* Rewards earned */}
            {reward && (
              <View style={styles.rewardRow}>
                <View style={styles.rewardItem}>
                  <Text style={styles.rewardVal}>+{reward.propertyXP}</Text>
                  <Text style={styles.rewardLbl}>XP</Text>
                </View>
                <View style={styles.rewardItem}>
                  <Text style={styles.rewardVal}>+{reward.tb}</Text>
                  <Text style={styles.rewardLbl}>TB</Text>
                </View>
                {reward.common > 0 && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardVal}>+{reward.common}</Text>
                    <Text style={styles.rewardLbl}>{resourceNames.common}</Text>
                  </View>
                )}
                {reward.uncommon > 0 && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardVal}>+{reward.uncommon}</Text>
                    <Text style={styles.rewardLbl}>{resourceNames.uncommon}</Text>
                  </View>
                )}
                {reward.rare > 0 && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardVal}>+{reward.rare}</Text>
                    <Text style={styles.rewardLbl}>{resourceNames.rare}</Text>
                  </View>
                )}
                {reward.epic > 0 && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardVal}>+{reward.epic}</Text>
                    <Text style={styles.rewardLbl}>{resourceNames.epic}</Text>
                  </View>
                )}
              </View>
            )}
            <View style={styles.btnRow}>
              {leveledUp ? (
                <TouchableOpacity
                  style={[styles.btn, styles.btnGold, adLevelLoading && { opacity: 0.6 }]}
                  onPress={handlePlayNextLevel}
                  disabled={adLevelLoading}
                >
                  <Text style={styles.btnTxt}>{adLevelLoading ? '⏳ Loading...' : `📺 Play Level ${newLevel}`}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.btn} onPress={restart}>
                  <Text style={styles.btnTxt}>🔄 Play Again</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.btn, styles.btnGreen]} onPress={() => navigation.goBack()}>
                <Text style={styles.btnTxt}>🚪 Exit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {/* ── Out of Moves overlay ── */}
        {outOfMoves && phase === 'puzzle' && (
          <View style={styles.outOfMovesOverlay}>
            <Text style={styles.outOfMovesTitle}>🚫 Out of Moves!</Text>
            <Text style={styles.outOfMovesHint}>Watch an ad for 3 extra turns</Text>
            <TouchableOpacity
              style={[styles.btn, styles.btnGold, adLoading && { opacity: 0.6 }]}
              onPress={handleAdForMoves}
              disabled={adLoading}
            >
              <Text style={styles.btnTxt}>{adLoading ? '⏳ Loading Ad...' : '📺 Watch Ad (+3 Turns)'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { marginTop: 10 }]}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.btnTxt}>🚪 Quit</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'gameover' && (
          <View style={styles.resultPanel}>
            <Text style={styles.loseTitle}>⏰ Time's Up!</Text>
            <Text style={styles.hint}>The leprechaun couldn't find the way...</Text>
            {reward && (
              <Text style={styles.consolationTxt}>
                +{reward.propertyXP} XP · +{reward.tb} TB (consolation)
              </Text>
            )}
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.btn} onPress={restart}>
                <Text style={styles.btnTxt}>🔄 Try Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnGreen]} onPress={() => navigation.goBack()}>
                <Text style={styles.btnTxt}>🚪 Exit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0d2b0d',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    width: SW, height: SH,
    resizeMode: 'cover',
    opacity: 0.4,
  },

  // Header
  header: {
    height: HEADER_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    backgroundColor: 'rgba(5, 30, 5, 0.88)',
    borderBottomWidth: 2,
    borderBottomColor: '#FFD700',
  },
  backBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  backBtnTxt: { color: '#FFD700', fontWeight: 'bold', fontSize: 14 },
  hCenter:    { alignItems: 'center', flex: 1 },
  hTitle:     { color: '#FFD700', fontSize: 17, fontWeight: 'bold' },
  hSub:       { color: '#aaa', fontSize: 12, marginTop: 2 },
  hRight:     { alignItems: 'flex-end', minWidth: 72 },
  timerTxt:   { fontSize: 16, fontWeight: 'bold' },
  movesTxt:   { color: '#FF9800', fontSize: 12, marginTop: 3 },

  // Grid
  gridOuter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  grid: {
    position: 'relative',
    borderWidth: 3,
    borderColor: '#FFD700',
    borderRadius: 6,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#FFD700',
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  tileWrap: { position: 'absolute' },
  tileImg:  { width: '100%', height: '100%', position: 'absolute' },
  pathGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 215, 0, 0.30)',
  },

  // Animated leprechaun overlay
  lepWrap: { position: 'absolute', zIndex: 20 },

  // Sparkle
  sparkle: { position: 'absolute', zIndex: 21 },

  // Footer
  footer: {
    minHeight: FOOTER_H,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(5, 30, 5, 0.88)',
    borderTopWidth: 2,
    borderTopColor: '#FFD700',
  },
  hint: { color: '#ccc', fontSize: 13, textAlign: 'center', lineHeight: 18 },

  // XP meter in header
  xpMeterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
    width: 160,
  },
  xpMeterBg: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  xpMeterFill: {
    height: '100%',
    backgroundColor: '#FFD700',
    borderRadius: 3,
  },
  xpMeterTxt: {
    color: '#FFD700',
    fontSize: 9,
    fontWeight: 'bold',
    minWidth: 52,
    textAlign: 'right',
  },

  // Level-up banner
  levelUpBanner: {
    backgroundColor: '#FFD700',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 5,
    marginBottom: 6,
  },
  levelUpTxt:    { color: '#1a3a1a', fontWeight: 'bold', fontSize: 15 },
  levelUpAdBtn:  { marginTop: 6, backgroundColor: '#F59E0B', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 6 },
  levelUpAdTxt:  { color: 'white', fontWeight: 'bold', fontSize: 13 },

  // Result panels
  resultPanel: { alignItems: 'center', width: '100%', gap: 4 },
  winTitle:    { color: '#FFD700', fontSize: 18, fontWeight: 'bold' },
  winScore:    { color: '#eee',    fontSize: 12 },
  loseTitle:   { color: '#F44336', fontSize: 18, fontWeight: 'bold' },
  outOfMovesOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 50,
    paddingBottom: 50,
    paddingHorizontal: 24,
  },
  outOfMovesTitle: {
    color: '#FFD700',
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  outOfMovesHint: {
    color: '#fff',
    fontSize: 15,
    marginBottom: 20,
    textAlign: 'center',
    opacity: 0.85,
  },
  btnGold: {
    backgroundColor: '#F9A825',
  },
  consolationTxt: { color: '#aaa', fontSize: 12 },

  // Reward pills
  rewardRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginVertical: 4,
  },
  rewardItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,215,0,0.15)',
    borderWidth: 1,
    borderColor: '#FFD700',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 52,
  },
  rewardVal: { color: '#FFD700', fontSize: 14, fontWeight: 'bold' },
  rewardLbl: { color: '#aaa',    fontSize: 10 },

  btnRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  btn: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
  },
  btnGreen: { backgroundColor: '#4a7a4a' },
  btnTxt:   { color: '#1a3a1a', fontWeight: 'bold', fontSize: 14 },
});
