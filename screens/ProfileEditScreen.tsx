import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { DatabaseService, UserProfile } from '../services/DatabaseService';
import { Ionicons } from '@expo/vector-icons';

interface ProfileEditScreenProps {
  onSave: () => void;
  onCancel: () => void;
  currentProfile: UserProfile;
}

export default function ProfileEditScreen({
  onSave,
  onCancel,
  currentProfile,
}: ProfileEditScreenProps) {
  const [nickname, setNickname] = useState(currentProfile.nickname || '');
  const [firstName, setFirstName] = useState(currentProfile.firstName || '');
  const [lastName, setLastName] = useState(currentProfile.lastName || '');
  const [address, setAddress] = useState(currentProfile.address || '');
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const dbService = new DatabaseService();

  const handleSave = async () => {
    if (!user) return;

    // Validation
    if (!nickname.trim()) {
      Alert.alert('Required Field', 'Please enter a nickname/display name.');
      return;
    }

    setSaving(true);
    try {
      await dbService.updateUserProfile(user.uid, {
        nickname: nickname.trim(),
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        address: address.trim() || undefined,
      });

      Alert.alert('Success', 'Your profile has been updated!');
      onSave();
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.headerButton}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <TouchableOpacity
            onPress={handleSave}
            style={styles.headerButton}
            disabled={saving}
          >
            <Text style={[styles.saveText, saving && styles.saveTextDisabled]}>
              {saving ? 'Saving...' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {/* Profile Picture Placeholder */}
          <View style={styles.profilePictureSection}>
            <View style={styles.profilePicturePlaceholder}>
              <Ionicons name="person" size={60} color="#999" />
            </View>
            <Text style={styles.profilePictureHint}>
              Profile picture coming soon!
            </Text>
          </View>

          {/* Form Fields */}
          <View style={styles.form}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Display Name (Nickname) <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your display name"
                value={nickname}
                onChangeText={setNickname}
                maxLength={20}
              />
              <Text style={styles.hint}>
                This is how others will see you in the app
              </Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>First Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your first name"
                value={firstName}
                onChangeText={setFirstName}
                maxLength={50}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Last Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your last name"
                value={lastName}
                onChangeText={setLastName}
                maxLength={50}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Address</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                placeholder="Enter your address"
                value={address}
                onChangeText={setAddress}
                multiline
                numberOfLines={3}
                maxLength={200}
              />
              <Text style={styles.hint}>
                Optional: For future payment and shipping features
              </Text>
            </View>

            {/* Email (Read-only) */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.readOnlyField}>
                <Text style={styles.readOnlyText}>{currentProfile.email}</Text>
              </View>
              <Text style={styles.hint}>Email cannot be changed</Text>
            </View>
          </View>

          {/* Additional Info */}
          <View style={styles.infoSection}>
            <Text style={styles.infoTitle}>Coming Soon</Text>
            <Text style={styles.infoText}>
              • Profile pictures{'\n'}
              • Payment information{'\n'}
              • Account preferences{'\n'}
              • Privacy settings
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerButton: {
    padding: 5,
    minWidth: 60,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  saveText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  saveTextDisabled: {
    color: '#999',
  },
  content: {
    flex: 1,
  },
  profilePictureSection: {
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: 'white',
    marginBottom: 10,
  },
  profilePicturePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  profilePictureHint: {
    fontSize: 14,
    color: '#999',
  },
  form: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  required: {
    color: '#f44336',
  },
  input: {
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
  },
  readOnlyField: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
  },
  readOnlyText: {
    fontSize: 16,
    color: '#666',
  },
  infoSection: {
    backgroundColor: 'white',
    marginTop: 10,
    padding: 20,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },
});
