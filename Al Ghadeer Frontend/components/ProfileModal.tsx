import React from 'react';
import { Modal, View, Text, TouchableOpacity, Image, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { icons } from '@/constants';
import { useOrderStore } from '@/store/index';
import { useAuthStore } from '@/store/auth';

const { width } = Dimensions.get('window');

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ visible, onClose }) => {
  const { currentDriver } = useOrderStore();
  const { user } = useAuthStore();

  const driverName = currentDriver?.name || user?.driver_name || user?.name || 'Driver';
  const helperName = currentDriver?.helper_name || user?.helper_name || 'Not set';
  const phone = currentDriver?.phone || user?.phone || 'Not set';
  const trackId = currentDriver?.id || user?.id || 'Not set';
  const profileImage = currentDriver?.profile_image || icons.person;
  const vehicleType = currentDriver?.vehicle?.type || user?.vehicle_type || 'Not set';
  const vehiclePlate = currentDriver?.vehicle?.plate_number || user?.vehicle_number || 'Not set';
  const vehicleModel = currentDriver?.vehicle?.model || 'Not set';
  const vehicleCapacity = currentDriver?.vehicle?.capacity || 'Not set';
  const status = currentDriver?.status || 'offline';
  const memberSince = currentDriver?.account?.joined_date 
    ? new Date(currentDriver.account.joined_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';
  const zone = user?.zone || 'Not set';
  const totalDeliveries = currentDriver?.metrics?.total_deliveries || 0;
  const completedDeliveries = currentDriver?.metrics?.completed_deliveries || 0;
  const averageRating = currentDriver?.metrics?.average_rating || 0;
  const dailyEarnings = currentDriver?.earnings?.daily_earnings || 0;
  const totalEarnings = currentDriver?.earnings?.total_earnings || 0;

  const getStatusColor = () => {
    switch (status) {
      case 'online': return '#10B981';
      case 'busy': return '#F59E0B';
      case 'offline': return '#6B7280';
      default: return '#6B7280';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'online': return 'Online';
      case 'busy': return 'Busy';
      case 'offline': return 'Offline';
      default: return 'Offline';
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity 
          style={styles.backdrop} 
          activeOpacity={1} 
          onPress={onClose}
        />
        <View style={styles.modalContainer}>
          {/* Header with gradient */}
          <View style={[styles.header, { backgroundColor: getStatusColor() }]}>
            <TouchableOpacity 
              onPress={onClose} 
              style={styles.closeButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Driver Profile</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView 
            style={styles.content}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.contentContainer}
          >
            {/* Profile Section */}
            <View style={styles.profileSection}>
              <View style={styles.avatarWrapper}>
                <Image
                  source={typeof profileImage === 'string' ? { uri: profileImage } : profileImage}
                  style={styles.avatar}
                />
                <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]}>
                  <View style={styles.statusInnerDot} />
                </View>
              </View>
              
              <Text style={styles.driverName}>{driverName}</Text>
              <View style={styles.statusBadgeContainer}>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + '20' }]}>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
                  <Text style={[styles.statusText, { color: getStatusColor() }]}>
                    {getStatusText()}
                  </Text>
                </View>
              </View>
            </View>

            {/* Helper Name Section */}
            {helperName && helperName !== 'Not set' && (
              <View style={styles.helperSection}>
                <Ionicons name="people" size={20} color="#0286FF" />
                <Text style={styles.helperLabel}>Helper</Text>
                <Text style={styles.helperName}>{helperName}</Text>
              </View>
            )}

            {/* Information Grid */}
            <View style={styles.infoGrid}>
              <View style={styles.infoCard}>
                <View style={styles.infoIconWrapper}>
                  <Ionicons name="call" size={22} color="#0286FF" />
                </View>
                <Text style={styles.infoLabel}>Phone</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{phone}</Text>
              </View>

              <View style={styles.infoCard}>
                <View style={styles.infoIconWrapper}>
                  <Ionicons name="finger-print" size={22} color="#0286FF" />
                </View>
                <Text style={styles.infoLabel}>Track ID</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{trackId}</Text>
              </View>

              <View style={styles.infoCard}>
                <View style={styles.infoIconWrapper}>
                  <Ionicons name="car" size={22} color="#0286FF" />
                </View>
                <Text style={styles.infoLabel}>Vehicle</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{vehicleType}</Text>
              </View>

              <View style={styles.infoCard}>
                <View style={styles.infoIconWrapper}>
                  <Ionicons name="document-text" size={22} color="#0286FF" />
                </View>
                <Text style={styles.infoLabel}>Plate Number</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{vehiclePlate}</Text>
              </View>

              {vehicleModel !== 'Not set' && (
                <View style={styles.infoCard}>
                  <View style={styles.infoIconWrapper}>
                    <Ionicons name="car-sport" size={22} color="#0286FF" />
                  </View>
                  <Text style={styles.infoLabel}>Model</Text>
                  <Text style={styles.infoValue} numberOfLines={1}>{vehicleModel}</Text>
                </View>
              )}

              {vehicleCapacity !== 'Not set' && (
                <View style={styles.infoCard}>
                  <View style={styles.infoIconWrapper}>
                    <Ionicons name="water" size={22} color="#0286FF" />
                  </View>
                  <Text style={styles.infoLabel}>Capacity</Text>
                  <Text style={styles.infoValue} numberOfLines={1}>{vehicleCapacity}L</Text>
                </View>
              )}

              {zone !== 'Not set' && (
                <View style={styles.infoCard}>
                  <View style={styles.infoIconWrapper}>
                    <Ionicons name="location" size={22} color="#0286FF" />
                  </View>
                  <Text style={styles.infoLabel}>Zone</Text>
                  <Text style={styles.infoValue} numberOfLines={1}>{zone}</Text>
                </View>
              )}

              <View style={styles.infoCard}>
                <View style={styles.infoIconWrapper}>
                  <Ionicons name="calendar" size={22} color="#0286FF" />
                </View>
                <Text style={styles.infoLabel}>Member Since</Text>
                <Text style={styles.infoValue} numberOfLines={2}>{memberSince}</Text>
              </View>
            </View>

            {/* Performance Metrics */}
            {currentDriver?.metrics && (
              <View style={styles.metricsSection}>
                <Text style={styles.sectionTitle}>Performance Metrics</Text>
                <View style={styles.metricsGrid}>
                  <View style={styles.metricCard}>
                    <Ionicons name="cube" size={24} color="#0286FF" />
                    <Text style={styles.metricValue}>{totalDeliveries}</Text>
                    <Text style={styles.metricLabel}>Total Deliveries</Text>
                  </View>
                  
                  <View style={styles.metricCard}>
                    <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                    <Text style={styles.metricValue}>{completedDeliveries}</Text>
                    <Text style={styles.metricLabel}>Completed</Text>
                  </View>
                  
                  <View style={styles.metricCard}>
                    <Ionicons name="star" size={24} color="#F59E0B" />
                    <Text style={styles.metricValue}>{averageRating.toFixed(1)}</Text>
                    <Text style={styles.metricLabel}>Rating</Text>
                  </View>
                  
                  <View style={styles.metricCard}>
                    <Ionicons name="cash" size={24} color="#10B981" />
                    <Text style={styles.metricValue}>AED {dailyEarnings.toFixed(0)}</Text>
                    <Text style={styles.metricLabel}>Daily Earnings</Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'JakartaSemiBold',
    letterSpacing: 0.5,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    width: 36,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 32,
  },
  profileSection: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 5,
    borderColor: '#FFFFFF',
    backgroundColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusInnerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  driverName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    fontFamily: 'JakartaSemiBold',
    letterSpacing: 0.3,
  },
  statusBadgeContainer: {
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'JakartaSemiBold',
  },
  helperSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    marginHorizontal: 24,
    marginBottom: 24,
    padding: 16,
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#0286FF',
  },
  helperLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 12,
    fontFamily: 'JakartaRegular',
  },
  helperName: {
    fontSize: 16,
    color: '#111827',
    marginLeft: 8,
    fontWeight: '600',
    fontFamily: 'JakartaSemiBold',
    flex: 1,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  infoCard: {
    width: (width - 60) / 2,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  infoIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 6,
    fontFamily: 'JakartaRegular',
  },
  infoValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
    fontFamily: 'JakartaSemiBold',
  },
  metricsSection: {
    paddingHorizontal: 24,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
    fontFamily: 'JakartaSemiBold',
    letterSpacing: 0.3,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minWidth: (width - 72) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
    marginBottom: 4,
    fontFamily: 'JakartaSemiBold',
  },
  metricLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'JakartaRegular',
    textAlign: 'center',
  },
});

export default ProfileModal;
