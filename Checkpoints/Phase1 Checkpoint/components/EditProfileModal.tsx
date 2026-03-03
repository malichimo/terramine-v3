import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Alert, ScrollView } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { DatabaseService } from '../services/DatabaseService';

interface EditProfileModalProps {
  visible: boolean;
  currentUsername: string;
  onClose: () => void;
  onSave: (profileData: ProfileData) => void;
}

export interface ProfileData {
  firstName: string;
  lastName: string;
  nickname: string;
  address: string;
}

export default function EditProfileModal({ visible, currentUsername, onClose, onSave }: EditProfileModalProps) {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState(currentUsername);
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);

  // Load existing profile data when modal opens
  React.useEffect(() => {
    if (visible && user) {
      loadProfileData();
    }
  }, [visible, user]);

  const loadProfileData = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const dbService = new DatabaseService();
      const userData = await dbService.getUserData(user.uid);
      
      if (userData) {
        setFirstName(userData.firstName || '');
        setLastName(userData.lastName || '');
        setNickname(userData.nickname || currentUsername);
        setAddress(userData.address || '');
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!nickname.trim()) {
      Alert.alert('Error', 'Nickname cannot be empty');
      return;
    }
    
    if (nickname.length < 3) {
      Alert.alert('Error', 'Nickname must be at least 3 characters');
      return;
    }

    if (!user) return;

    setLoading(true);
    try {
      const dbService = new DatabaseService();
      await dbService.updateUserProfile(user.uid, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nickname: nickname.trim(),
        address: address.trim(),
      });

      onSave({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nickname: nickname.trim(),
        address: address.trim(),
      });
      
      Alert.alert('Success', 'Profile updated successfully!');
      onClose();
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Edit Profile</Text>
            
            <View style={styles.section}>
              <Text style={styles.label}>Email</Text>
              <Text style={styles.emailText}>{user?.email}</Text>
            </View>
            
            <View style={styles.section}>
              <Text style={styles.label}>First Name</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Enter first name"
                maxLength={50}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Last Name</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Enter last name"
                maxLength={50}
              />
            </View>
            
            <View style={styles.section}>
              <Text style={styles.label}>Nickname *</Text>
              <TextInput
                style={styles.input}
                value={nickname}
                onChangeText={setNickname}
                placeholder="Enter nickname"
                maxLength={20}
                autoCapitalize="none"
              />
              <Text style={styles.hint}>3-20 characters (required)</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Address</Text>
              <TextInput
                style={styles.input}
                value={address}
                onChangeText={setAddress}
                placeholder="Enter address"
                maxLength={100}
              />
            </View>
            
            <View style={styles.buttons}>
              <TouchableOpacity 
                style={[styles.button, styles.cancelButton]} 
                onPress={onClose}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.button, styles.saveButton, loading && styles.disabledButton]} 
                onPress={handleSave}
                disabled={loading}
              >
                <Text style={styles.saveButtonText}>
                  {loading ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 25,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2B6B94',
    marginBottom: 25,
    textAlign: 'center',
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emailText: {
    fontSize: 16,
    color: '#333',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#5CB3E6',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  button: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#2B6B94',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
});
