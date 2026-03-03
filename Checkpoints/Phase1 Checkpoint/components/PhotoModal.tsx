import React from 'react';
import { Modal, View, Image, TouchableOpacity, StyleSheet, Text } from 'react-native';

interface PhotoModalProps {
  visible: boolean;
  photoURL: string | null;
  onClose: () => void;
}

export default function PhotoModal({ visible, photoURL, onClose }: PhotoModalProps) {
  if (!photoURL) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalContainer}>
        <TouchableOpacity style={styles.closeArea} onPress={onClose} activeOpacity={1}>
          <View style={styles.imageContainer}>
            <Image 
              source={{ uri: photoURL }}
              style={styles.fullImage}
              resizeMode="contain"
            />
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>✕ Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeArea: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '95%',
    height: '85%',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  closeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
});
