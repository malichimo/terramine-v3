// screens/games/LaserBlast/LaserBlastGame.tsx
// LaserBlast puzzle game for Diamond Mine properties
// Rotate mirrors to redirect lasers — hit every coal target to win!

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
import type { GameReward } from '../../../types/PropertyTypes';
import {
  Cell,
  PuzzleConfig,
  LaserResult,
  LaserColor,
  generatePuzzle,
  fireLasers,
  rotateMirror,
  calculateScore,
  getDifficultyLabel,
  getLaserDifficulty,
  cloneGrid,
  applyHitStates,
  LASER_COLOR_HEX,
  COAL_GLOW_HEX,
} from '../../../utils/LaserBlastEngine';

// ─── Assets ───────────────────────────────────────────────────────────────────
const MINER_IMAGES: Record<LaserColor, any> = {
  red:    require('../../../assets/images/diamond-mine/hazmat-miner-red.png'),
  blue:   require('../../../assets/images/diamond-mine/hazmat-miner-blue.png'),
  green:  require('../../../assets/images/diamond-mine/hazmat-miner-green.png'),
  yellow: require('../../../assets/images/diamond-mine/hazmat-miner-yellow.png'),
};

const MINER_CELEBRATE   = require('../../../assets/images/diamond-mine/hazmat-miner-celebrate.png');
const MIRROR_SLASH      = require('../../../assets/images/diamond-mine/mirror-slash.png');
const MIRROR_BACKSLASH  = require('../../../assets/images/diamond-mine/mirror-backslash.png');
const COAL_LUMP         = require('../../../assets/images/diamond-mine/coal-lump.png');
const COAL_HIT: Record<LaserColor, any> = {
  red:    require('../../../assets/images/diamond-mine/coal-hit-red.png'),
  blue:   require('../../../assets/images/diamond-mine/coal-hit-blue.png'),
  green:  require('../../../assets/images/diamond-mine/coal-hit-green.png'),
  yellow: require('../../../assets/images/diamond-mine/coal-hit-yellow.png'),
};
const DIAMOND_SPARKLE   = require('../../../assets/images/diamond-mine/diamond-sparkle.png');
const ROCK_OBSTACLE     = require('../../../assets/images/diamond-mine/rock-obstacle.png');
const CAVE_FLOOR        = require('../../../assets/images/diamond-mine/cave-floor.png');
const BACKGROUND        = require('../../../assets/images/diamond-mine/diamond-cave-bg.png');

// ─── Types & constants ────────────────────────────────────────────────────────
type GamePhase = 'puzzle' | 'firing' | 'celebrating' | 'gameover';

const { width: SW, height: SH } = Dimensions.get('window');
const HEADER_H  = 80;
const FOOTER_H  = 110;
const PADDING   = 12;
const AVAIL_W   = SW - PADDING * 2;
const AVAIL_H   = SH - HEADER_H - FOOTER_H - PADDING * 2;

const MAX_LIVES = 3;

// A rendered laser beam segment — one cell-width line to draw
interface BeamSegment {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function LaserBlastGame({ route, navigation }: any) {
  const { property, propertyDetails, onBalanceUpdate } = route.params;
  const { user } = useAuth();

  const gameLevel   = propertyDetails?.gameLevel ?? 1;
  const difficulty  = getLaserDifficulty(gameLevel);
  const gridSize    = difficulty.gridSize;
  const timeLimit   = difficulty.timeLimit;
  const tapLimit    = difficulty.tapLimit;
  const TILE_SIZE   = Math.floor(Math.min(AVAIL_W, AVAIL_H) / (gridSize + 2)); // +2 for miner margin

  // ── State ──────────────────────────────────────────────────────────────────
  const [grid, setGrid]           = useState<Cell[][]>([]);
  const [phase, setPhase]         = useState<GamePhase>('puzzle');
  const [timeLeft, setTimeLeft]   = useState(timeLimit);
  const [tapsUsed, setTapsUsed]   = useState(0);
  const [livesLeft, setLivesLeft] = useState(MAX_LIVES);
  const [fireAttempts, setFireAttempts] = useState(0);
  const [beamSegs, setBeamSegs]   = useState<BeamSegment[]>([]);
  const [hitResults, setHitResults] = useState<LaserResult[]>([]);
  const [score, setScore]         = useState(0);
  const [reward, setReward]       = useState<GameReward | null>(null);
  const [leveledUp, setLeveledUp] = useState(false);
  const [newLevel, setNewLevel]   = useState(gameLevel);
  const [adLevelLoading, setAdLevelLoading] = useState(false);
  const [adLoading, setAdLoading] = useState(false);
  const [showAdOffer, setShowAdOffer] = useState(false);

  // ── Animated values ────────────────────────────────────────────────────────
  const beamOpacity      = useRef(new Animated.Value(0)).current;
  const celebrateScale   = useRef(new Animated.Value(0)).current;
  const diamondSparkleOp = useRef(new Animated.Value(0)).current;
  const mirrorAnims = useRef<Record<string, Animated.Value>>({});

  // ── Refs ───────────────────────────────────────────────────────────────────
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultSaved     = useRef(false);
  const puzzleRef       = useRef<PuzzleConfig | null>(null);
  const adService       = useRef<AdMobService | null>(null);
  const activeLevelRef  = useRef(gameLevel);

  // Track live copies of state in refs for use inside closures
  const livesRef        = useRef(MAX_LIVES);
  const timeLeftRef     = useRef(timeLimit);
  const tapsUsedRef     = useRef(0);
  const fireAttemptsRef = useRef(0);

  // ✅ FIX: Track mounted state to prevent setState calls after unmount
  const isMounted = useRef(true);

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
    const p = generatePuzzle(gameLevel);
    puzzleRef.current = p;
    setGrid(cloneGrid(p.grid));
    initMirrorAnims(p.grid);
  }

  function initMirrorAnims(g: Cell[][]) {
    for (let r = 0; r < g.length; r++) {
      for (let c = 0; c < g[r].length; c++) {
        const k = `${r},${c}`;
        const isSlash = g[r][c].type === 'mirror-/';
        if (!mirrorAnims.current[k]) {
          mirrorAnims.current[k] = new Animated.Value(isSlash ? 0 : 1);
        } else {
          mirrorAnims.current[k].setValue(isSlash ? 0 : 1);
        }
      }
    }
  }

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'puzzle') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        const next = prev - 1;
        timeLeftRef.current = next;
        if (next <= 0) {
          clearInterval(timerRef.current!);
          handleTimeout();
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // ── Mirror tap ─────────────────────────────────────────────────────────────
  const handleCellTap = useCallback((row: number, col: number) => {
    if (phase !== 'puzzle') return;

    const cell = grid[row][col];
    if (cell.type !== 'mirror-/' && cell.type !== 'mirror-\\') return;

    if (tapLimit !== null && tapsUsedRef.current >= tapLimit) return;

    const k = `${row},${col}`;
    const anim = mirrorAnims.current[k];
    if (anim) {
      const isCurrentlySlash = cell.type === 'mirror-/';
      Animated.timing(anim, {
        toValue: isCurrentlySlash ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    }

    const newGrid = rotateMirror(grid, row, col);
    setGrid(newGrid);
    soundService.play('rotate');

    tapsUsedRef.current += 1;
    setTapsUsed(tapsUsedRef.current);
  }, [phase, grid, tapLimit]);

  // ── Fire button ────────────────────────────────────────────────────────────
  const handleFire = useCallback(() => {
    if (phase !== 'puzzle' || !puzzleRef.current) return;

    clearInterval(timerRef.current!);
    setPhase('firing');
    soundService.play('laser');

    const p: PuzzleConfig = { ...puzzleRef.current, grid };
    const fireResult = fireLasers(p);

    fireAttemptsRef.current += 1;
    setFireAttempts(fireAttemptsRef.current);

    const segments = buildBeamSegments(fireResult.results);
    setBeamSegs(segments);
    setHitResults(fireResult.results);

    beamOpacity.setValue(0);
    Animated.timing(beamOpacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start(() => {
      const updatedGrid = applyHitStates(grid, fireResult.results);
      setGrid(updatedGrid);

      if (fireResult.allHit) {
        setTimeout(() => handleWin(), 600);
      } else {
        setTimeout(() => {
          Animated.timing(beamOpacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }).start(() => {
            const newLives = livesRef.current - 1;
            livesRef.current = newLives;
            setLivesLeft(newLives);

            if (newLives <= 0) {
              setShowAdOffer(true);
            } else {
              const resetGrid = cloneGrid(grid).map(row =>
                row.map(cell => ({ ...cell, isHit: false }))
              );
              setGrid(resetGrid);
              setBeamSegs([]);
              setPhase('puzzle');
              timeLeftRef.current = Math.max(1, timeLeftRef.current);
            }
          });
        }, 800);
      }
    });
  }, [phase, grid]);

  // ── Build beam segment rects from laser results ───────────────────────────
  function buildBeamSegments(results: LaserResult[]): BeamSegment[] {
    const BEAM_W = Math.max(5, TILE_SIZE * 0.18);
    const segs: BeamSegment[] = [];

    for (const result of results) {
      const hexColor = LASER_COLOR_HEX[result.color];
      for (const seg of result.segments) {
        const cx = seg.col * TILE_SIZE + TILE_SIZE / 2;
        const cy = seg.row * TILE_SIZE + TILE_SIZE / 2;
        const entryEdge = edgePoint(cx, cy, opposite(seg.entryDir), TILE_SIZE);

        if (!seg.exitDir) {
          segs.push(makeSegment(entryEdge.x, entryEdge.y, cx, cy, BEAM_W, hexColor));
        } else if (seg.entryDir === seg.exitDir) {
          const exitEdge = edgePoint(cx, cy, seg.exitDir, TILE_SIZE);
          segs.push(makeSegment(entryEdge.x, entryEdge.y, exitEdge.x, exitEdge.y, BEAM_W, hexColor));
        } else {
          const exitEdge = edgePoint(cx, cy, seg.exitDir, TILE_SIZE);
          segs.push(makeSegment(entryEdge.x, entryEdge.y, cx, cy, BEAM_W, hexColor));
          segs.push(makeSegment(cx, cy, exitEdge.x, exitEdge.y, BEAM_W, hexColor));
        }
      }
    }
    return segs;
  }

  function edgePoint(cx: number, cy: number, dir: string, size: number): { x: number; y: number } {
    const half = size / 2;
    switch (dir) {
      case 'right': return { x: cx + half, y: cy };
      case 'left':  return { x: cx - half, y: cy };
      case 'down':  return { x: cx, y: cy + half };
      case 'up':    return { x: cx, y: cy - half };
      default:      return { x: cx, y: cy };
    }
  }

  function opposite(dir: string): string {
    switch (dir) {
      case 'right': return 'left';
      case 'left':  return 'right';
      case 'down':  return 'up';
      case 'up':    return 'down';
      default:      return dir;
    }
  }

  function makeSegment(
    x1: number, y1: number,
    x2: number, y2: number,
    beamW: number,
    color: string,
  ): BeamSegment {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const isHoriz = Math.abs(dx) >= Math.abs(dy);
    if (isHoriz) {
      const left = Math.min(x1, x2);
      return { x: left, y: y1 - beamW / 2, width: Math.abs(dx), height: beamW, color };
    } else {
      const top = Math.min(y1, y2);
      return { x: x1 - beamW / 2, y: top, width: beamW, height: Math.abs(dy), color };
    }
  }

  // ── Win ────────────────────────────────────────────────────────────────────
  function handleWin() {
    soundService.play('win');
    setPhase('celebrating');

    Animated.parallel([
      Animated.spring(celebrateScale, { toValue: 1, friction: 4, useNativeDriver: true }),
      Animated.timing(diamondSparkleOp, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() =>
        Animated.timing(diamondSparkleOp, { toValue: 0, duration: 800, useNativeDriver: true }).start()
      , 1200);
    });

    const finalScore = calculateScore({
      gameLevel,
      targetCount: difficulty.targetCount,
      timeRemaining: timeLeftRef.current,
      timeLimit,
      tapsUsed: tapsUsedRef.current,
      tapLimit,
      livesLost: MAX_LIVES - livesRef.current,
      fireAttempts: fireAttemptsRef.current,
    });

    setScore(finalScore.total);
    saveResult(true, finalScore.total, tapsUsedRef.current, timeLeftRef.current);
  }

  // ── Timeout ────────────────────────────────────────────────────────────────
  function handleTimeout() {
    if (phase !== 'puzzle') return;
    soundService.play('lose');
    setPhase('gameover');
    saveResult(false, 0, tapsUsedRef.current, 0);
  }

  // ── Save result ────────────────────────────────────────────────────────────
  async function saveResult(won: boolean, finalScore: number, finalTaps: number, finalTimeLeft: number) {
    if (resultSaved.current || !user) return;
    resultSaved.current = true;
    try {
      const perfect     = won && fireAttemptsRef.current === 1;
      const levelBefore = propertyDetails?.gameLevel ?? gameLevel;
      const earned = await dbServicePhase2.recordGameResult(
        user.uid, property.id, property.mineType,
        won, perfect, finalScore, finalTimeLeft, finalTaps,
      );
      if (!isMounted.current) return;
      setReward(earned);

      // ✅ BUG-027 FIX: Notify parent of TB earned so map screen balance
      // updates immediately without requiring a re-login.
      if (earned?.tb && onBalanceUpdate) {
        onBalanceUpdate(earned.tb);
      }

      const updated = await dbServicePhase2.getPropertyDetails(property.id);
      if (!isMounted.current) return;
      if (updated && updated.gameLevel > levelBefore) {
        setLeveledUp(true);
        setNewLevel(updated.gameLevel);
        activeLevelRef.current = updated.gameLevel;
      }
    } catch (e) {
      console.error('Error saving game result:', e);
    }
  }

  // ── Ad for extra life ─────────────────────────────────────────────────────
  async function handleAdForLife() {
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
          // Rewarded: give 1 life, resume
          if (!isMounted.current) return;
          livesRef.current = 1;
          setLivesLeft(1);
          setAdLoading(false);
          setShowAdOffer(false);
          const resetGrid = cloneGrid(grid).map(row =>
            row.map(cell => ({ ...cell, isHit: false }))
          );
          setGrid(resetGrid);
          setBeamSegs([]);
          setPhase('puzzle');
        },
        () => {
          // No reward — game over
          if (!isMounted.current) return;
          setAdLoading(false);
          setShowAdOffer(false);
          soundService.play('lose');
          setPhase('gameover');
          saveResult(false, 0, tapsUsedRef.current, 0);
        }
      );

      // ✅ FIX: Handle case where showAd returns false (race condition)
      if (!shown) {
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
      setShowAdOffer(false);
      soundService.play('lose');
      setPhase('gameover');
      saveResult(false, 0, tapsUsedRef.current, 0);
    }
  }

  // ── Auto-trigger level-up ad when player levels up ──────────────────────
  // ✅ FIX: Previously the level-up ad required a manual button tap.
  // Now it fires automatically when leveledUp becomes true, giving the
  // player 2 seconds to see the win screen before the ad starts.
  useEffect(() => {
    if (!leveledUp) return;
    const timer = setTimeout(() => {
      if (isMounted.current && leveledUp) {
        handlePlayNextLevelAd();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [leveledUp]);

  // ── Play Next Level (after level-up ad) ───────────────────────────────────
  async function handlePlayNextLevelAd() {
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

    setAdLevelLoading(true);
    try {
      const shown = await adService.current.showAd(
        () => {
          // ✅ FIX: Guard all setState calls with isMounted
          if (!isMounted.current) return;
          setAdLevelLoading(false);
          setLeveledUp(false);
          const lvl  = activeLevelRef.current;
          const diff = getLaserDifficulty(lvl);
          const p    = generatePuzzle(lvl);
          if (timerRef.current) clearInterval(timerRef.current);
          resultSaved.current     = false;
          livesRef.current        = MAX_LIVES;
          tapsUsedRef.current     = 0;
          fireAttemptsRef.current = 0;
          timeLeftRef.current     = diff.timeLimit;
          beamOpacity.setValue(0);
          celebrateScale.setValue(0);
          diamondSparkleOp.setValue(0);
          puzzleRef.current = p;
          setGrid(cloneGrid(p.grid));
          initMirrorAnims(p.grid);
          setBeamSegs([]);
          setPhase('puzzle');
          setTimeLeft(diff.timeLimit);
          setTapsUsed(0);
          setFireAttempts(0);
          setLivesLeft(MAX_LIVES);
          setScore(0);
          setShowAdOffer(false);
          setReward(null);
        },
        () => {
          if (!isMounted.current) return;
          setAdLevelLoading(false);
        }
      );

      // ✅ FIX: Handle case where showAd returns false (race condition)
      if (!shown) {
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
    // ✅ FIX: Generate puzzle FIRST before any state updates.
    // Previously setPhase('puzzle') fired before initNewPuzzle() completed,
    // causing the timer useEffect to restart while grid was still empty → crash.
    if (timerRef.current) clearInterval(timerRef.current);

    // Generate and cache the new puzzle synchronously before any re-renders
    const p = generatePuzzle(gameLevel);
    puzzleRef.current = p;

    // Reset all refs
    resultSaved.current     = false;
    livesRef.current        = MAX_LIVES;
    tapsUsedRef.current     = 0;
    fireAttemptsRef.current = 0;
    timeLeftRef.current     = timeLimit;

    // Reset animated values
    beamOpacity.setValue(0);
    celebrateScale.setValue(0);
    diamondSparkleOp.setValue(0);

    // Initialize mirror animations for new puzzle
    initMirrorAnims(p.grid);

    // Now update all state in one batch — grid is already set via puzzleRef
    setGrid(cloneGrid(p.grid));
    setBeamSegs([]);
    setHitResults([]);
    setScore(0);
    setReward(null);
    setLeveledUp(false);
    setNewLevel(gameLevel);
    setShowAdOffer(false);
    setTapsUsed(0);
    setLivesLeft(MAX_LIVES);
    setFireAttempts(0);
    setTimeLeft(timeLimit);
    // Phase last — timer useEffect fires on this, grid is already ready
    setPhase('puzzle');
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const GRID_OFFSET = TILE_SIZE;
  const GRID_PX     = gridSize * TILE_SIZE;
  const TOTAL_PX    = GRID_PX + GRID_OFFSET * 2;

  const timerColor = timeLeft <= 10 ? '#F44336' : timeLeft <= 20 ? '#FF9800' : '#B9F2FF';

  // ── Early return ───────────────────────────────────────────────────────────
  if (!puzzleRef.current || grid.length === 0) return null;

  const p = puzzleRef.current;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <Image source={BACKGROUND} style={styles.bg} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnTxt}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.hCenter}>
          <Text style={styles.hTitle}>💎 LaserBlast</Text>
          <Text style={styles.hSub}>
            Level {leveledUp ? newLevel : gameLevel} · {getDifficultyLabel(gameLevel)}
          </Text>
          <View style={styles.xpMeterRow}>
            <View style={styles.xpMeterBg}>
              <View style={[styles.xpMeterFill, {
                width: `${Math.min(100, ((propertyDetails?.gameXP ?? 0) / 1000) * 100)}%`,
              }]} />
            </View>
            <Text style={styles.xpMeterTxt}>{propertyDetails?.gameXP ?? 0}/1000 XP</Text>
          </View>
        </View>

        <View style={styles.hRight}>
          <Text style={[styles.timerTxt, { color: timerColor }]}>⏱ {timeLeft}s</Text>
          <Text style={styles.livesTxt}>
            {Array.from({ length: MAX_LIVES }, (_, i) => i < livesLeft ? '❤️' : '🖤').join('')}
          </Text>
          {tapLimit !== null && (
            <Text style={styles.tapsTxt}>
              👆 {Math.max(0, tapLimit - tapsUsed)} left
            </Text>
          )}
        </View>
      </View>

      {/* ── Grid area ── */}
      <View style={styles.gridOuter}>
        <View style={[styles.gridContainer, { width: TOTAL_PX, height: TOTAL_PX }]}>

          {/* ── Miners on edges ── */}
          {p.miners.map((miner, idx) => {
            const isHit = hitResults[idx]?.hitTarget ?? false;
            const img   = phase === 'celebrating' ? MINER_CELEBRATE : MINER_IMAGES[miner.color];

            let minerStyle: any = {
              position: 'absolute',
              width:  TILE_SIZE * 0.85,
              height: TILE_SIZE * 0.85,
              zIndex: 10,
            };

            switch (miner.edge) {
              case 'left':
                minerStyle.left = TILE_SIZE * 0.075;
                minerStyle.top  = GRID_OFFSET + miner.position * TILE_SIZE + TILE_SIZE * 0.075;
                break;
              case 'right':
                minerStyle.right = TILE_SIZE * 0.075;
                minerStyle.top   = GRID_OFFSET + miner.position * TILE_SIZE + TILE_SIZE * 0.075;
                break;
              case 'top':
                minerStyle.top  = TILE_SIZE * 0.075;
                minerStyle.left = GRID_OFFSET + miner.position * TILE_SIZE + TILE_SIZE * 0.075;
                break;
              case 'bottom':
                minerStyle.bottom = TILE_SIZE * 0.075;
                minerStyle.left   = GRID_OFFSET + miner.position * TILE_SIZE + TILE_SIZE * 0.075;
                break;
            }

            return (
              <Image
                key={`miner-${idx}`}
                source={img}
                style={minerStyle}
                resizeMode="contain"
              />
            );
          })}

          {/* ── Grid border box ── */}
          <View style={[styles.gridBox, {
            left:   GRID_OFFSET,
            top:    GRID_OFFSET,
            width:  GRID_PX,
            height: GRID_PX,
          }]}>

            {/* ── Tiles ── */}
            {grid.map((row, r) =>
              row.map((cell, c) => {
                const k = `${r},${c}`;
                const isInteractive = cell.type === 'mirror-/' || cell.type === 'mirror-\\';

                const coalMinerColor: LaserColor | null = (() => {
                  if (cell.type !== 'coal' || cell.coalIndex === undefined) return null;
                  return p.miners[cell.coalIndex]?.color ?? null;
                })();

                const cellImg = (() => {
                  switch (cell.type) {
                    case 'obstacle':  return ROCK_OBSTACLE;
                    case 'coal':      return coalMinerColor ? COAL_HIT[coalMinerColor] : COAL_LUMP;
                    case 'mirror-/':  return MIRROR_SLASH;
                    case 'mirror-\\': return MIRROR_BACKSLASH;
                    default:          return null;
                  }
                })();

                return (
                  <TouchableOpacity
                    key={k}
                    activeOpacity={isInteractive ? 0.7 : 1}
                    onPress={() => handleCellTap(r, c)}
                    style={[styles.tile, {
                      width:  TILE_SIZE,
                      height: TILE_SIZE,
                      left:   c * TILE_SIZE,
                      top:    r * TILE_SIZE,
                    }]}
                  >
                    <Image source={CAVE_FLOOR} style={styles.tileImg} />

                    {cell.type === 'coal' && phase === 'celebrating' ? (
                      <Image source={DIAMOND_SPARKLE} style={styles.tileImg} resizeMode="contain" />
                    ) : cellImg ? (
                      <Image source={cellImg} style={styles.tileImg} resizeMode="contain" />
                    ) : null}

                    {isInteractive && phase === 'puzzle' && (
                      <View style={[styles.mirrorRing, {
                        width:  TILE_SIZE - 4,
                        height: TILE_SIZE - 4,
                        borderRadius: (TILE_SIZE - 4) / 2,
                      }]} />
                    )}
                  </TouchableOpacity>
                );
              })
            )}

            {/* ── Laser beams overlay ── */}
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFillObject, { opacity: beamOpacity, zIndex: 30 }]}
            >
              {beamSegs.map((seg, i) => (
                <View key={i} style={{
                  position:        'absolute',
                  left:            seg.x,
                  top:             seg.y,
                  width:           seg.width,
                  height:          seg.height,
                  backgroundColor: seg.color,
                  shadowColor:     seg.color,
                  shadowOpacity:   0.9,
                  shadowRadius:    6,
                  elevation:       6,
                }} />
              ))}
            </Animated.View>

          </View>
        </View>
      </View>

      {/* ── Footer ── */}
      <View style={styles.footer}>

        {phase === 'puzzle' && (
          <>
            <Text style={styles.hint}>🔄 Tap mirrors to rotate · Press FIRE when ready</Text>
            <TouchableOpacity style={styles.fireBtn} onPress={handleFire}>
              <Text style={styles.fireBtnTxt}>🔴 FIRE</Text>
            </TouchableOpacity>
          </>
        )}

        {phase === 'firing' && (
          <Text style={styles.hint}>⚡ Lasers firing…</Text>
        )}

        {phase === 'celebrating' && (
          <View style={styles.resultPanel}>
            {leveledUp && (
              <View style={styles.levelUpBanner}>
                <Text style={styles.levelUpTxt}>⬆️ LEVEL UP! Now Level {newLevel}</Text>
                {adLevelLoading ? (
                  <Text style={[styles.levelUpTxt, { marginTop: 6 }]}>⏳ Loading ad...</Text>
                ) : (
                  <TouchableOpacity style={styles.levelUpAdBtn} onPress={handlePlayNextLevelAd}>
                    <Text style={styles.levelUpAdTxt}>📺 Watch Ad → Play Level {newLevel}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            <Text style={styles.winTitle}>💎 All Targets Hit!</Text>
            <Text style={styles.winScore}>
              Score: {score}  ·  Fire: #{fireAttempts}  ·  Taps: {tapsUsed}
            </Text>
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
                    <Text style={styles.rewardLbl}>Common</Text>
                  </View>
                )}
                {reward.uncommon > 0 && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardVal}>+{reward.uncommon}</Text>
                    <Text style={styles.rewardLbl}>Uncommon</Text>
                  </View>
                )}
                {reward.rare > 0 && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardVal}>+{reward.rare}</Text>
                    <Text style={styles.rewardLbl}>Rare</Text>
                  </View>
                )}
              </View>
            )}
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.btn} onPress={restart}>
                <Text style={styles.btnTxt}>🔄 Play Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnBlue]} onPress={() => navigation.goBack()}>
                <Text style={styles.btnTxt}>🚪 Exit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {phase === 'gameover' && !showAdOffer && (
          <View style={styles.resultPanel}>
            <Text style={styles.loseTitle}>💥 Game Over</Text>
            <Text style={styles.hint}>
              {timeLeft <= 0 ? "Time's up! The coal escaped..." : 'The lasers missed their targets...'}
            </Text>
            {reward && (
              <Text style={styles.consolationTxt}>
                +{reward.propertyXP} XP · +{reward.tb} TB (consolation)
              </Text>
            )}
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.btn} onPress={restart}>
                <Text style={styles.btnTxt}>🔄 Try Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnBlue]} onPress={() => navigation.goBack()}>
                <Text style={styles.btnTxt}>🚪 Exit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      </View>

      {/* ── Ad offer overlay (0 lives left) ── */}
      {showAdOffer && (
        <View style={styles.adOverlay}>
          <Text style={styles.adTitle}>💀 Out of Lives!</Text>
          <Text style={styles.adHint}>
            Your mirrors are close... watch an ad to get one more life and keep your current layout!
          </Text>
          <TouchableOpacity
            style={[styles.btn, styles.btnGold, adLoading && { opacity: 0.6 }]}
            onPress={handleAdForLife}
            disabled={adLoading}
          >
            <Text style={styles.btnTxt}>
              {adLoading ? '⏳ Loading Ad...' : '📺 Watch Ad (+1 Life)'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { marginTop: 10 }]}
            onPress={() => {
              setShowAdOffer(false);
              setPhase('gameover');
              saveResult(false, 0, tapsUsedRef.current, 0);
            }}
          >
            <Text style={styles.btnTxt}>🚪 Give Up</Text>
          </TouchableOpacity>
        </View>
      )}

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0a1a',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    width: SW, height: SH,
    resizeMode: 'cover',
    opacity: 0.45,
  },
  header: {
    height: HEADER_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    backgroundColor: 'rgba(5, 5, 30, 0.92)',
    borderBottomWidth: 2,
    borderBottomColor: '#B9F2FF',
  },
  backBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(185,242,255,0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#B9F2FF',
  },
  backBtnTxt:  { color: '#B9F2FF', fontWeight: 'bold', fontSize: 14 },
  hCenter:     { alignItems: 'center', flex: 1 },
  hTitle:      { color: '#B9F2FF', fontSize: 17, fontWeight: 'bold' },
  hSub:        { color: '#aaa', fontSize: 12, marginTop: 2 },
  hRight:      { alignItems: 'flex-end', minWidth: 72 },
  timerTxt:    { fontSize: 16, fontWeight: 'bold' },
  livesTxt:    { fontSize: 12, marginTop: 3 },
  tapsTxt:     { color: '#FF9800', fontSize: 11, marginTop: 2 },
  xpMeterRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, width: 160 },
  xpMeterBg:   { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' },
  xpMeterFill: { height: '100%', backgroundColor: '#B9F2FF', borderRadius: 3 },
  xpMeterTxt:  { color: '#B9F2FF', fontSize: 9, fontWeight: 'bold', minWidth: 52, textAlign: 'right' },
  gridOuter:   { flex: 1, justifyContent: 'center', alignItems: 'center' },
  gridContainer: { position: 'relative' },
  gridBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#B9F2FF',
    borderRadius: 4,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#B9F2FF',
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  tile:      { position: 'absolute', overflow: 'hidden' },
  tileImg:   { position: 'absolute', width: '100%', height: '100%' },
  mirrorRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(185,242,255,0.3)',
    top: 2,
    left: 2,
  },
  coalGlow:  { position: 'absolute', top: 0, left: 0 },
  footer: {
    minHeight: FOOTER_H,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(5, 5, 30, 0.92)',
    borderTopWidth: 2,
    borderTopColor: '#B9F2FF',
    gap: 8,
  },
  hint: { color: '#ccc', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  fireBtn: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FF6B6B',
    elevation: 4,
    shadowColor: '#FF3B30',
    shadowOpacity: 0.7,
    shadowRadius: 8,
  },
  fireBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 18, letterSpacing: 2 },
  resultPanel:    { alignItems: 'center', width: '100%', gap: 4 },
  winTitle:       { color: '#B9F2FF', fontSize: 18, fontWeight: 'bold' },
  winScore:       { color: '#eee', fontSize: 12 },
  loseTitle:      { color: '#F44336', fontSize: 18, fontWeight: 'bold' },
  consolationTxt: { color: '#aaa', fontSize: 12 },
  levelUpBanner: {
    backgroundColor: '#B9F2FF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 5,
    marginBottom: 4,
  },
  levelUpTxt:    { color: '#0a0a1a', fontWeight: 'bold', fontSize: 14 },
  levelUpAdBtn:  { marginTop: 6, backgroundColor: '#1565C0', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 6 },
  levelUpAdTxt:  { color: 'white', fontWeight: 'bold', fontSize: 13 },
  rewardRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginVertical: 4,
  },
  rewardItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(185,242,255,0.1)',
    borderWidth: 1,
    borderColor: '#B9F2FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 52,
  },
  rewardVal: { color: '#B9F2FF', fontSize: 14, fontWeight: 'bold' },
  rewardLbl: { color: '#aaa', fontSize: 10 },
  btnRow:    { flexDirection: 'row', gap: 12, marginTop: 4 },
  btn: {
    backgroundColor: '#B9F2FF',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
  },
  btnBlue: { backgroundColor: '#1a3a5a' },
  btnGold: { backgroundColor: '#F9A825' },
  btnTxt:  { color: '#0a0a1a', fontWeight: 'bold', fontSize: 14 },
  adOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 50,
    paddingBottom: 60,
    paddingHorizontal: 24,
    gap: 0,
  },
  adTitle: {
    color: '#FF3B30',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  adHint: {
    color: '#fff',
    fontSize: 15,
    marginBottom: 24,
    textAlign: 'center',
    opacity: 0.85,
    lineHeight: 22,
  },
});
