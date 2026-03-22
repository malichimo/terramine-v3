// components/ReportModal.tsx
// Reusable bottom sheet for reporting check-in content

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, ActivityIndicator, Alert,
} from 'react-native';
import { ModerationService, ReportReason, REPORT_REASONS } from '../services/ModerationService';
import { useAuth } from '../contexts/AuthContext';

interface ReportModalProps {
  visible: boolean;
  checkInId: string;
  reportedUserId: string;
  onClose: () => void;
  onReported: () => void;
  onBlocked: () => void;
}

export default function ReportModal({
  visible, checkInId, reportedUserId,
  onClose, onReported, onBlocked,
}: ReportModalProps) {
  const { user } = useAuth();
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'choose' | 'reason'>('choose');

  const reset = () => {
    setSelectedReason(null);
    setStep('choose');
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleReport = async () => {
    if (!user || !selectedReason) return;
    setSubmitting(true);
    try {
      await ModerationService.reportCheckIn(user.uid, checkInId, selectedReason);
      reset();
      onReported();
      Alert.alert('Reported', 'Thank you for your report. We will review this content.');
    } catch (e: any) {
      if (e.message === 'already_reported') {
        Alert.alert('Already Reported', 'You have already reported this content.');
      } else {
        Alert.alert('Error', 'Failed to submit report. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleBlock = async () => {
    if (!user) return;
    Alert.alert(
      'Block User',
      'You will no longer see content from this user. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await ModerationService.blockUser(user.uid, reportedUserId);
              reset();
              onBlocked();
              Alert.alert('Blocked', 'You will no longer see content from this user.');
            } catch (e) {
              Alert.alert('Error', 'Failed to block user. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableOpacity style={styles.backdrop} onPress={handleClose} activeOpacity={1} />
      <View style={styles.sheet}>
        {step === 'choose' ? (
          <>
            <Text style={styles.title}>What would you like to do?</Text>
            <TouchableOpacity
              style={styles.optionButton}
              onPress={() => setStep('reason')}
            >
              <Text style={styles.optionIcon}>🚩</Text>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Report this content</Text>
                <Text style={styles.optionSub}>Flag for review by TerraMine</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionButton}
              onPress={handleBlock}
            >
              <Text style={styles.optionIcon}>🚫</Text>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Block this user</Text>
                <Text style={styles.optionSub}>Hide all their content from you</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={() => setStep('choose')} style={styles.backRow}>
              <Text style={styles.backLink}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Why are you reporting this?</Text>
            {REPORT_REASONS.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.reasonButton,
                  selectedReason === key && styles.reasonButtonSelected,
                ]}
                onPress={() => setSelectedReason(key)}
              >
                <View style={[
                  styles.radio,
                  selectedReason === key && styles.radioSelected,
                ]} />
                <Text style={[
                  styles.reasonText,
                  selectedReason === key && styles.reasonTextSelected,
                ]}>{label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.submitButton, (!selectedReason || submitting) && styles.submitButtonDisabled]}
              onPress={handleReport}
              disabled={!selectedReason || submitting}
            >
              {submitting
                ? <ActivityIndicator color="white" />
                : <Text style={styles.submitText}>Submit Report</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A0900',
    marginBottom: 20,
    textAlign: 'center',
  },
  backRow: { marginBottom: 12 },
  backLink: { color: '#888', fontSize: 14 },

  // Choose step
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    marginBottom: 10,
    gap: 14,
  },
  optionIcon: { fontSize: 24 },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 15, fontWeight: '600', color: '#1A0900' },
  optionSub: { fontSize: 12, color: '#888', marginTop: 2 },

  // Reason step
  reasonButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    marginBottom: 8,
    gap: 12,
  },
  reasonButtonSelected: {
    borderColor: '#C0392B',
    backgroundColor: '#FFF5F5',
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#CCC',
  },
  radioSelected: {
    borderColor: '#C0392B',
    backgroundColor: '#C0392B',
  },
  reasonText: { fontSize: 14, color: '#333' },
  reasonTextSelected: { color: '#C0392B', fontWeight: '600' },

  // Buttons
  submitButton: {
    backgroundColor: '#C0392B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 10,
  },
  submitButtonDisabled: { backgroundColor: '#E0A09A' },
  submitText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  cancelButton: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { color: '#888', fontSize: 14 },
});
