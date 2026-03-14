// services/SoundService.ts
// Singleton sound service for TerraMine
// Requires: expo-av (npx expo install expo-av)

import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_SFX   = '@terramine_sfx_enabled';
const STORAGE_KEY_MUSIC = '@terramine_music_enabled';

export type SoundKey =
  | 'flip'
  | 'match'
  | 'mismatch'
  | 'step'
  | 'hazard'
  | 'boost'
  | 'canary'
  | 'rotate'
  | 'laser'
  | 'explosion'
  | 'machine_start'
  | 'machine_loop'
  | 'reel_spin'
  | 'water_flow'
  | 'pickaxe'
  | 'reward'
  | 'win'
  | 'lose'
  | 'purchase'
  | 'chime';

const SOUND_FILES: Record<SoundKey, any> = {
  flip:          require('../assets/sounds/sfx-flip.mp3'),
  match:         require('../assets/sounds/sfx-chime.mp3'),
  mismatch:      require('../assets/sounds/sfx-mismatch.mp3'),
  step:          require('../assets/sounds/sfx-step.mp3'),
  hazard:        require('../assets/sounds/sfx-hazard.mp3'),
  boost:         require('../assets/sounds/sfx-boost.mp3'),
  canary:        require('../assets/sounds/sfx-canary.mp3'),
  rotate:        require('../assets/sounds/sfx-rotate.mp3'),
  laser:         require('../assets/sounds/sfx-laser.mp3'),
  explosion:     require('../assets/sounds/sfx-explosion.mp3'),
  machine_start: require('../assets/sounds/sfx-machine-start.mp3'),
  machine_loop:  require('../assets/sounds/sfx-machine-loop.mp3'),
  reel_spin:     require('../assets/sounds/sfx-reel-spin.mp3'),
  water_flow:    require('../assets/sounds/sfx-water-flow.mp3'),
  pickaxe:       require('../assets/sounds/sfx-pickaxe.mp3'),
  reward:        require('../assets/sounds/sfx-reward.mp3'),
  win:           require('../assets/sounds/sfx-win.mp3'),
  lose:          require('../assets/sounds/sfx-lose.mp3'),
  purchase:      require('../assets/sounds/sfx-purchase.mp3'),
  chime:         require('../assets/sounds/sfx-chime.mp3'),
};

class SoundService {
  private static instance: SoundService;
  private sounds: Partial<Record<SoundKey, Audio.Sound>> = {};
  private loaded = false;
  private loading = false;
  private sfxEnabled  = true;
  private musicEnabled = true;

  private constructor() {}

  static getInstance(): SoundService {
    if (!SoundService.instance) {
      SoundService.instance = new SoundService();
    }
    return SoundService.instance;
  }

  // ── Initialise ──────────────────────────────────────────────────────────────
  async init(): Promise<void> {
    if (this.loaded || this.loading) return;
    this.loading = true;

    try {
      // Load persisted preferences
      const [sfxVal, musicVal] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY_SFX),
        AsyncStorage.getItem(STORAGE_KEY_MUSIC),
      ]);
      this.sfxEnabled   = sfxVal   === null ? true : sfxVal   === 'true';
      this.musicEnabled = musicVal === null ? true : musicVal === 'true';

      // Configure audio mode
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: false,
        staysActiveInBackground: false,
      });

      // Pre-load all sounds
      await Promise.all(
        (Object.keys(SOUND_FILES) as SoundKey[]).map(async (key) => {
          try {
            const { sound } = await Audio.Sound.createAsync(SOUND_FILES[key], {
              shouldPlay: false,
              volume: 1.0,
              isLooping: key === 'machine_loop' || key === 'reel_spin' || key === 'water_flow',
            });
            this.sounds[key] = sound;
          } catch (e) {
            console.warn(`SoundService: failed to load ${key}`, e);
          }
        })
      );

      this.loaded  = true;
      this.loading = false;
    } catch (e) {
      console.warn('SoundService: init failed', e);
      this.loading = false;
    }
  }

  // ── Playback ─────────────────────────────────────────────────────────────────
  async play(key: SoundKey): Promise<void> {
    if (!this.sfxEnabled) return;
    const sound = this.sounds[key];
    if (!sound) return;
    try {
      await sound.setPositionAsync(0);
      await sound.playAsync();
    } catch (e) {
      // Silently ignore playback errors (e.g. sound already unloaded)
    }
  }

  async stop(key: SoundKey): Promise<void> {
    const sound = this.sounds[key];
    if (!sound) return;
    try {
      await sound.stopAsync();
    } catch (e) {}
  }

  async stopAll(): Promise<void> {
    await Promise.all(
      (Object.keys(this.sounds) as SoundKey[]).map(k => this.stop(k))
    );
  }

  // ── Settings ─────────────────────────────────────────────────────────────────
  isSfxEnabled():   boolean { return this.sfxEnabled; }
  isMusicEnabled(): boolean { return this.musicEnabled; }

  async setSfxEnabled(val: boolean): Promise<void> {
    this.sfxEnabled = val;
    await AsyncStorage.setItem(STORAGE_KEY_SFX, String(val));
    if (!val) await this.stopAll();
  }

  async setMusicEnabled(val: boolean): Promise<void> {
    this.musicEnabled = val;
    await AsyncStorage.setItem(STORAGE_KEY_MUSIC, String(val));
    // Music playback will be wired here when background music is added
  }

  // ── Teardown ─────────────────────────────────────────────────────────────────
  async unloadAll(): Promise<void> {
    await Promise.all(
      (Object.keys(this.sounds) as SoundKey[]).map(async (key) => {
        try { await this.sounds[key]?.unloadAsync(); } catch {}
      })
    );
    this.sounds = {};
    this.loaded  = false;
  }
}

export const soundService = SoundService.getInstance();
