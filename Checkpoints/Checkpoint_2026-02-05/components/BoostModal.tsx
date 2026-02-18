import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { AdMobService } from '../services/AdMobService';

interface BoostModalProps {
  visible: boolean;
  onClose: () => void;
  onFreeBoost: () => void;
  onAdBoost: () => void;
  freeBoostsRemaining: number;
  adBoostsUsed: number;
  boostTimeRemaining: number; // in minutes
  maxTotalBoostMinutes: number; // 480 (8 hours)
  nextResetTime: string | null;
}

const MAX_AD_BOOSTS = 12; // Users can watch 12 ads for 6 hours total
const MINUTES_PER_BOOST = 30;
const MAX_FREE_BOOSTS = 4;

export default function BoostModal({
  visible,
  onClose,
  onFreeBoost,
  onAdBoost,
  freeBoostsRemaining,
  adBoostsUsed,
  boostTimeRemaining,
  maxTotalBoostMinutes,
  nextResetTime,
}: BoostModalProps) {
  const [adService] = useState(() => new AdMobService());
  const [isAdLoading, setIsAdLoading] = useState(false);
  const [isAdReady, setIsAdReady] = useState(false);

  useEffect(() => {
    if (visible) {
      loadAd();
    }
  }, [visible]);

  useEffect(() => {
    // Check ad status every second
    const interval = setInterval(() => {
      setIsAdReady(adService.isAdReady());
      setIsAdLoading(adService.isAdLoading());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const loadAd = async () => {
    try {
      setIsAdLoading(true);
      await adService.loadAd();
      setIsAdReady(true);
    } catch (error) {
      console.error('Error loading ad:', error);
      Alert.alert('Ad Error', 'Failed to load ad. Please try again later.');
    } finally {
      setIsAdLoading(false);
    }
  };

  const handleWatchAd = async () => {
    if (!isAdReady) {
      Alert.alert('Ad Not Ready', 'Please wait for the ad to load.');
      return;
    }

    try {
      const success = await adService.showAd(
        () => {
          // User watched the ad and earned reward
          console.log('User earned reward from ad!');
          onAdBoost();
        },
        () => {
          // Ad closed (whether completed or not)
          console.log('Ad closed');
          // Reload the next ad
          loadAd();
        }
      );

      if (!success) {
        Alert.alert('Error', 'Failed to show ad. Please try again.');
      }
    } catch (error) {
      console.error('Error showing ad:', error);
      Alert.alert('Error', 'Failed to show ad. Please try again.');
    }
  };

  const formatTimeRemaining = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const formatResetTime = (isoString: string | null): string => {
    if (!isoString) return '';
    const resetDate = new Date(isoString);
    const now = new Date();
    const diffMs = resetDate.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${diffHours}h ${diffMins}m`;
  };

  const canAddMoreBoost = boostTimeRemaining < maxTotalBoostMinutes;
  const adBoostsRemaining = MAX_AD_BOOSTS - adBoostsUsed;
  const canWatchAd = canAddMoreBoost && adBoostsRemaining > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.headerIcon}>⚡</Text>
            <Text style={styles.title}>Earning Boost</Text>
          </View>
          
          <Text style={styles.subtitle}>Get 2x earnings for 30 minutes!</Text>

          {/* Current Boost Status */}
          {boostTimeRemaining > 0 && (
            <View style={styles.activeBoostBanner}>
              <Text style={styles.activeBoostText}>
                ⚡ Active: {formatTimeRemaining(boostTimeRemaining)} remaining
              </Text>
            </View>
          )}

          {/* Free Boosts Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Free Boosts</Text>
            <Text style={styles.sectionInfo}>
              {freeBoostsRemaining}/{MAX_FREE_BOOSTS} available
            </Text>
            {nextResetTime && (
              <Text style={styles.resetInfo}>
                Resets in: {formatResetTime(nextResetTime)}
              </Text>
            )}
            <Text style={styles.maxInfo}>Max total: 8 hours</Text>

            <TouchableOpacity
              style={[
                styles.boostButton,
                (!canAddMoreBoost || freeBoostsRemaining === 0) && styles.disabledButton,
              ]}
              onPress={onFreeBoost}
              disabled={!canAddMoreBoost || freeBoostsRemaining === 0}
            >
              <Text style={styles.buttonText}>
                {freeBoostsRemaining === 0
                  ? 'No Free Boosts'
                  : !canAddMoreBoost
                  ? 'Max Boost Reached'
                  : `Use Free Boost (+${MINUTES_PER_BOOST} min)`}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Ad Boosts Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Watch Ad</Text>
            <Text style={styles.sectionInfo}>
              Get +{MINUTES_PER_BOOST} min boost
            </Text>
            <Text style={styles.adBoostsInfo}>
              {adBoostsRemaining} ad boosts remaining ({adBoostsUsed}/{MAX_AD_BOOSTS} used)
            </Text>
            <Text style={styles.maxInfo}>Max 6 hours total from ads</Text>

            <TouchableOpacity
              style={[
                styles.adButton,
                (!canWatchAd || isAdLoading) && styles.disabledButton,
              ]}
              onPress={handleWatchAd}
              disabled={!canWatchAd || isAdLoading}
            >
              {isAdLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color="white" size="small" />
                  <Text style={[styles.buttonText, styles.loadingText]}>Loading Ad...</Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>
                  {!canAddMoreBoost
                    ? 'Max Boost Reached'
                    : adBoostsRemaining === 0
                    ? 'No Ad Boosts Left'
                    : `📺 Watch Ad (+${MINUTES_PER_BOOST} min)`}
                </Text>
              )}
            </TouchableOpacity>

            {!isAdReady && !isAdLoading && canWatchAd && (
              <Text style={styles.adStatusText}>
                Ad is loading, please wait...
              </Text>
            )}
          </View>

          {/* Close Button */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    alignItems: 'center',
    marginBottom: 10,
  },
  headerIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  activeBoostBanner: {
    backgroundColor: '#FF9800',
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
  },
  activeBoostText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  section: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  sectionInfo: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  resetInfo: {
    fontSize: 12,
    color: '#999',
    marginBottom: 5,
  },
  maxInfo: {
    fontSize: 12,
    color: '#999',
    marginBottom: 10,
  },
  adBoostsInfo: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  boostButton: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  adButton: {
    backgroundColor: '#9C27B0',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#cccccc',
  },
  closeButton: {
    backgroundColor: '#757575',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    marginLeft: 10,
  },
  adStatusText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
});
