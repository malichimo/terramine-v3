// components/FeedbackModal.tsx
// In-app feedback form — submits to Firestore 'feedback' collection

import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { db } from '../firebaseConfig';
import { collection, doc, setDoc } from 'firebase/firestore';

export type FeedbackType = 'general' | 'bug' | 'feature' | 'other';

const FEEDBACK_TYPES: { key: FeedbackType; label: string; emoji: string; desc: string }[] = [
  { key: 'general',  label: 'General Feedback', emoji: '💬', desc: 'Share your thoughts' },
  { key: 'bug',      label: 'Bug Report',        emoji: '🐛', desc: 'Something is broken' },
  { key: 'feature',  label: 'Feature Request',   emoji: '✨', desc: 'Suggest something new' },
  { key: 'other',    label: 'Other',              emoji: '📝', desc: 'Anything else' },
];

interface FeedbackModalProps {
  visible: boolean;
  userId: string;
  userEmail?: string;
  onClose: () => void;
}

export default function FeedbackModal({ visible, userId, userEmail, onClose }: FeedbackModalProps) {
  const [selectedType, setSelectedType] = useState<FeedbackType | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setSelectedType(null);
    setMessage('');
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!selectedType) {
      Alert.alert('Select a Type', 'Please select a feedback type before submitting.');
      return;
    }
    if (!message.trim() || message.trim().length < 10) {
      Alert.alert('Add a Message', 'Please enter at least 10 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const feedbackRef = doc(collection(db, 'feedback'));
      await setDoc(feedbackRef, {
        userId,
        userEmail: userEmail || null,
        type: selectedType,
        message: message.trim(),
        status: 'new',
        createdAt: new Date().toISOString(),
      });

      reset();
      onClose();
      Alert.alert(
        '✅ Thanks for your feedback!',
        'We read every submission and use it to improve TerraMine.'
      );
    } catch (e) {
      console.error('Feedback submission failed:', e);
      Alert.alert('Error', 'Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Send Feedback</Text>
              <Text style={styles.subtitle}>Help us improve TerraMine</Text>
            </View>

            {/* Type selector */}
            <Text style={styles.sectionLabel}>What kind of feedback?</Text>
            <View style={styles.typeGrid}>
              {FEEDBACK_TYPES.map(({ key, label, emoji, desc }) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.typeCard, selectedType === key && styles.typeCardSelected]}
                  onPress={() => setSelectedType(key)}
                >
                  <Text style={styles.typeEmoji}>{emoji}</Text>
                  <Text style={[styles.typeLabel, selectedType === key && styles.typeLabelSelected]}>
                    {label}
                  </Text>
                  <Text style={styles.typeDesc}>{desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Message input */}
            <Text style={styles.sectionLabel}>Your message</Text>
            <TextInput
              style={styles.messageInput}
              value={message}
              onChangeText={setMessage}
              placeholder="Tell us what's on your mind..."
              placeholderTextColor="#aaa"
              multiline
              numberOfLines={5}
              maxLength={1000}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{message.length}/1000</Text>

            {/* Buttons */}
            <TouchableOpacity
              style={[styles.submitButton, (!selectedType || message.trim().length < 10 || submitting) && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={!selectedType || message.trim().length < 10 || submitting}
            >
              {submitting
                ? <ActivityIndicator color="white" size="small" />
                : <Text style={styles.submitText}>Submit Feedback</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelText}>Cancel</Text>
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
  sheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '92%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 0.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  typeCard: {
    width: '47%',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  typeCardSelected: {
    borderColor: '#2B6B94',
    backgroundColor: '#EEF6FB',
  },
  typeEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 2,
  },
  typeLabelSelected: {
    color: '#2B6B94',
  },
  typeDesc: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
  },
  messageInput: {
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#1a1a1a',
    minHeight: 120,
    marginBottom: 4,
  },
  charCount: {
    fontSize: 11,
    color: '#bbb',
    textAlign: 'right',
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: '#2B6B94',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  submitDisabled: {
    backgroundColor: '#ccc',
  },
  submitText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 8,
  },
  cancelText: {
    color: '#888',
    fontSize: 15,
  },
});
