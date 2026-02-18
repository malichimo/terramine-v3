import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Alert } from 'react-native';
import { GridSquare } from '../utils/GridUtils';

interface PropertyNicknameModalProps {
  visible: boolean;
  property: GridSquare | null;
  onClose: () => void;
  onSave: (propertyId: string, nickname: string) => Promise<void>;
}

export default function PropertyNicknameModal({ 
  visible, 
  property, 
  onClose, 
  onSave 
}: PropertyNicknameModalProps) {
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (property) {
      setNickname(property.nickname || '');
    }
  }, [property]);

  const handleSave = async () => {
    if (!property) return;

    if (nickname.trim().length > 30) {
      Alert.alert('Error', 'Nickname must be 30 characters or less');
      return;
    }

    setSaving(true);
    try {
      await onSave(property.id, nickname.trim());
      Alert.alert('Success', 'Property nickname updated!');
      onClose();
    } catch (error) {
      console.error('Error saving nickname:', error);
      Alert.alert('Error', 'Failed to update nickname');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    setNickname('');
  };

  if (!property) return null;

  const getMineIcon = (type?: string) => {
    switch (type) {
      case 'rock': return '🪨';
      case 'coal': return '⚫';
      case 'gold': return '🟡';
      case 'diamond': return '💎';
      default: return '⬜';
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
          <Text style={styles.title}>Edit Property Nickname</Text>
          
          <View style={styles.propertyInfo}>
            <Text style={styles.propertyIcon}>{getMineIcon(property.mineType)}</Text>
            <View>
              <Text style={styles.propertyType}>
                {property.mineType?.toUpperCase()} MINE
              </Text>
              <Text style={styles.propertyGrid}>Grid: {property.id}</Text>
            </View>
          </View>
          
          <View style={styles.section}>
            <Text style={styles.label}>Property Nickname (Optional)</Text>
            <TextInput
              style={styles.input}
              value={nickname}
              onChangeText={setNickname}
              placeholder="e.g., My Home Base, Office HQ"
              maxLength={30}
              autoFocus
            />
            <Text style={styles.hint}>
              {nickname.length}/30 characters
            </Text>
            {nickname.trim() && (
              <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
                <Text style={styles.clearButtonText}>Clear Nickname</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <View style={styles.buttons}>
            <TouchableOpacity 
              style={[styles.button, styles.cancelButton]} 
              onPress={onClose}
              disabled={saving}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.button, styles.saveButton, saving && styles.disabledButton]} 
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveButtonText}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
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
    marginBottom: 20,
    textAlign: 'center',
  },
  propertyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  propertyIcon: {
    fontSize: 40,
    marginRight: 15,
  },
  propertyType: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  propertyGrid: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
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
  clearButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  clearButtonText: {
    color: '#f44336',
    fontSize: 14,
    fontWeight: '600',
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
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
