import React from 'react';
import { Modal, View, Text, TouchableOpacity, Image, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { icons } from '@/constants';
import { useOrderStore } from '@/store/index';
import { useAuthStore } from '@/store/auth';

const { width } = Dimensions.get('window');

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
}

interface InfoItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}

const InfoItem: React.FC<InfoItemProps> = ({ icon, label, value }) => (
  <View style={styles.infoItem}>
    <View style={styles.iconContainer}>
      <Ionicons name={icon} size={20} color="#0EA5E9" />
    </View>
    <View style={styles.infoContent}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  </View>
);

const ProfileModal: React.FC<ProfileModalProps> = ({ visible, onClose }) => {
  const { currentDriver } = useOrderStore();
  const { user } = useAuthStore();

  const driverName = currentDriver?.name || user?.driver_name || user?.name || 'Driver';
  const phone = currentDriver?.phone || user?.phone || '—';
  const vehicleType = currentDriver?.vehicle?.type || '—';
  const vehiclePlate = currentDriver?.vehicle?.plate_number || '—';
  const zone = (currentDriver as any)?.zone || '—';
  const helperName = currentDriver?.helper_name || '—';
  const helperPhone = (currentDriver as any)?.helper_phone || '—';
  const profileImage = currentDriver?.profile_image || icons.person;

  const infoItems = [
    { icon: 'call-outline' as const, label: 'Phone', value: phone },
    { icon: 'car-outline' as const, label: 'Vehicle', value: vehicleType },
    { icon: 'document-text-outline' as const, label: 'Plate Number', value: vehiclePlate },
    { icon: 'location-outline' as const, label: 'Zone', value: zone },
  ].filter(item => item.value !== '—');

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity 
          style={styles.backdrop} 
          activeOpacity={1} 
          onPress={onClose}
        />
        <View style={styles.modalContainer}>
          {/* Close Button */}
          <TouchableOpacity 
            onPress={onClose} 
            style={styles.closeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={24} color="#64748B" />
          </TouchableOpacity>

          {/* Profile Header */}
          <View style={styles.profileHeader}>
            <Image
              source={typeof profileImage === 'string' ? { uri: profileImage } : profileImage}
              style={styles.avatar}
            />
            <Text style={styles.driverName}>{driverName}</Text>
          </View>

          {/* Information List */}
          <View style={styles.infoList}>
            {infoItems.map((item, index) => (
              <InfoItem
                key={index}
                icon={item.icon}
                label={item.label}
                value={item.value}
              />
            ))}

            {/* Helper Section */}
            {helperName !== '—' && (
              <View style={styles.helperSection}>
                <View style={styles.iconContainer}>
                  <Ionicons name="people-outline" size={20} color="#0EA5E9" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Helper</Text>
                  <Text style={styles.infoValue}>{helperName}</Text>
                  {helperPhone !== '—' && (
                    <Text style={styles.helperPhone}>{helperPhone}</Text>
                  )}
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: width * 0.85,
    maxWidth: 400,
    paddingTop: 24,
    paddingBottom: 32,
    paddingHorizontal: 24,
    shadowColor: '#1E40AF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 24,
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F1F5F9',
    marginBottom: 16,
    borderWidth: 3,
    borderColor: '#E2E8F0',
  },
  driverName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E40AF',
    fontFamily: 'JakartaSemiBold',
    letterSpacing: -0.5,
  },
  infoList: {
    gap: 0,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 4,
    fontFamily: 'JakartaMedium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    fontFamily: 'JakartaSemiBold',
  },
  helperSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  helperPhone: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 4,
    fontFamily: 'JakartaMedium',
  },
});

export default ProfileModal;
