// components/TBTradeInModal.tsx
// Allows users to trade their accumulated USD earnings for TerraBucks (TB).
// Rate: 30 TB per $1.00 standard, 40 TB per $1.00 on the 1st and 15th of each month.
// Minimum trade-in: $1.00. No maximum.

import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { DatabaseService } from '../services/DatabaseService';

const dbService = new DatabaseService();

// ── Rate config ───────────────────────────────────────────────────────────────
const STANDARD_RATE = 30;   // TB per $1.00
const PROMO_RATE    = 40;   // TB per $1.00 on 1st and 15th
const MIN_TRADE_USD = 1.00; // Minimum $1.00

function getCurrentRate(): { rate: number; isPromo: boolean } {
  const day = new Date().getDate();
  const isPromo = day === 1 || day === 15;
  return { rate: isPromo ? PROMO_RATE : STANDARD_RATE, isPromo };
}

interface TBTradeInModalProps {
  visible: boolean;
  onClose: () => void;
  usdEarnings: number;          // Total accumulated USD earnings
  userId: string;
  onTradeComplete: (tbGained: number, usdSpent: number) => void; // callback to update parent state
}

export default function TBTradeInModal({
  visible,
  onClose,
  usdEarnings,
  userId,
  onTradeComplete,
}: TBTradeInModalProps) {
  const [amountInput, setAmountInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { rate, isPromo } = useMemo(() => getCurrentRate(), [visible]);

  const parsedAmount = parseFloat(amountInput) || 0;
  const tbToReceive = Math.floor(parsedAmount * rate);
  const isValidAmount = parsedAmount >= MIN_TRADE_USD && parsedAmount <= usdEarnings;
  const hasEnoughEarnings = usdEarnings >= MIN_TRADE_USD;

  const handleTradeIn = async () => {
    if (!isValidAmount) return;

    Alert.alert(
      '⛏️ Confirm Trade-In',
      `Trade $${parsedAmount.toFixed(2)} of earnings for ${tbToReceive} TB?\n\nYour remaining earnings will be $${(usdEarnings - parsedAmount).toFixed(6)}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setIsLoading(true);
            try {
              // Deduct USD earnings and credit TB in one operation
              await dbService.tradeEarningsForTB(userId, parsedAmount, tbToReceive);
              onTradeComplete(tbToReceive, parsedAmount);
              setAmountInput('');
              Alert.alert(
                '🎉 Trade Complete!',
                `You received ${tbToReceive} TB!\n\nKeep mining to earn more.`,
                [{ text: 'Let\'s Mine! ⛏️', onPress: onClose }]
              );
            } catch (error: any) {
              console.error('Trade-in failed:', error);
              Alert.alert('Error', error.message || 'Trade-in failed. Please try again.');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleMaxAmount = () => {
    // Round down to 2 decimal places for clean input
    const maxAmount = Math.floor(usdEarnings * 100) / 100;
    setAmountInput(maxAmount.toFixed(2));
  };

  const handleClose = () => {
    setAmountInput('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modal}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerIcon}>💱</Text>
              <Text style={styles.title}>Trade Earnings for TB</Text>
              {isPromo && (
                <View style={styles.promoBadge}>
                  <Text style={styles.promoText}>🎉 Bonus Rate Day!</Text>
                </View>
              )}
            </View>

            {/* Rate display */}
            <View style={styles.rateCard}>
              <View style={styles.rateRow}>
                <Text style={styles.rateLabel}>Current Rate</Text>
                <Text style={styles.rateValue}>
                  $1.00 = <Text style={[styles.rateHighlight, isPromo && styles.promoHighlight]}>{rate} TB</Text>
                </Text>
              </View>
              {isPromo ? (
                <Text style={styles.rateNote}>🎉 Bonus rate active today! Standard rate is {STANDARD_RATE} TB/$1</Text>
              ) : (
                <Text style={styles.rateNote}>Bonus rate of {PROMO_RATE} TB/$1 on the 1st and 15th of each month</Text>
              )}
            </View>

            {/* Available earnings */}
            <View style={styles.earningsCard}>
              <Text style={styles.earningsLabel}>Available Earnings</Text>
              <Text style={styles.earningsValue}>${usdEarnings.toFixed(6)}</Text>
              {!hasEnoughEarnings && (
                <Text style={styles.insufficientText}>
                  Minimum trade-in is $1.00. Keep mining!
                </Text>
              )}
            </View>

            {hasEnoughEarnings && (
              <>
                {/* Amount input */}
                <View style={styles.inputSection}>
                  <Text style={styles.inputLabel}>Amount to Trade (USD)</Text>
                  <View style={styles.inputRow}>
                    <Text style={styles.dollarSign}>$</Text>
                    <TextInput
                      style={styles.input}
                      value={amountInput}
                      onChangeText={setAmountInput}
                      keyboardType="decimal-pad"
                      placeholder="1.00"
                      placeholderTextColor="#999"
                      maxLength={12}
                    />
                    <TouchableOpacity style={styles.maxButton} onPress={handleMaxAmount}>
                      <Text style={styles.maxButtonText}>MAX</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Validation messages */}
                  {amountInput !== '' && parsedAmount < MIN_TRADE_USD && (
                    <Text style={styles.errorText}>Minimum trade-in is $1.00</Text>
                  )}
                  {amountInput !== '' && parsedAmount > usdEarnings && (
                    <Text style={styles.errorText}>Amount exceeds available earnings</Text>
                  )}
                </View>

                {/* TB preview */}
                {isValidAmount && (
                  <View style={styles.previewCard}>
                    <Text style={styles.previewLabel}>You will receive</Text>
                    <Text style={styles.previewValue}>💰 {tbToReceive} TB</Text>
                    <Text style={styles.previewSub}>
                      Remaining earnings: ${(usdEarnings - parsedAmount).toFixed(6)}
                    </Text>
                  </View>
                )}

                {/* Trade button */}
                <TouchableOpacity
                  style={[styles.tradeButton, (!isValidAmount || isLoading) && styles.tradeButtonDisabled]}
                  onPress={handleTradeIn}
                  disabled={!isValidAmount || isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text style={styles.tradeButtonText}>
                      {isValidAmount ? `Trade $${parsedAmount.toFixed(2)} → ${tbToReceive} TB` : 'Enter Amount'}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* Close button */}
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>

          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  headerIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2B6B94',
    marginBottom: 8,
  },
  promoBadge: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF9800',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  promoText: {
    color: '#E65100',
    fontWeight: 'bold',
    fontSize: 13,
  },
  rateCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  rateLabel: {
    fontSize: 14,
    color: '#555',
    fontWeight: '600',
  },
  rateValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
  rateHighlight: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  promoHighlight: {
    color: '#E65100',
  },
  rateNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  earningsCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  earningsLabel: {
    fontSize: 12,
    color: '#666',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  earningsValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  insufficientText: {
    fontSize: 13,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  inputSection: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#5CB3E6',
    borderRadius: 10,
    backgroundColor: 'white',
    overflow: 'hidden',
  },
  dollarSign: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    paddingVertical: 12,
  },
  maxButton: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  maxButtonText: {
    color: '#2E7D32',
    fontWeight: 'bold',
    fontSize: 12,
  },
  errorText: {
    color: '#C0392B',
    fontSize: 12,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  previewCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 12,
    color: '#555',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  previewValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1565C0',
    marginBottom: 4,
  },
  previewSub: {
    fontSize: 12,
    color: '#666',
  },
  tradeButton: {
    backgroundColor: '#2B6B94',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  tradeButtonDisabled: {
    backgroundColor: '#ccc',
  },
  tradeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeButton: {
    backgroundColor: '#F5F5F5',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '600',
  },
});
