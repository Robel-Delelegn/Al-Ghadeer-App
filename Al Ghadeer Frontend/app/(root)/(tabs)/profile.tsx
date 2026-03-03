import { icons } from '@/constants';
import { useOrderStore } from '@/store/index';
import { useAuthStore } from '@/store/auth';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from "expo-router";
import React from 'react';
import { 
  Image, 
  Text, 
  TouchableOpacity, 
  View, 
  ScrollView, 
  StyleSheet,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { showWarningAlert } from '@/store/utils/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

const Profile = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const { currentDriver } = useOrderStore();

  const onLogOut = () => {
    showWarningAlert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace("/");
          }
        }
      ]
    );
  };

  const avatar = currentDriver?.profile_image || icons.person;
  const driverName = currentDriver?.name || user?.name || 'Driver';
  const helperName = currentDriver?.helper_name || user?.helper_name;
  const helperPhone = (currentDriver as any)?.helper_phone || null;
  const phone = currentDriver?.phone || user?.phone || '—';
  const vehicleType = currentDriver?.vehicle?.type || user?.vehicle_type || '—';
  const vehiclePlate = currentDriver?.vehicle?.plate_number || user?.vehicle_number || '—';
  const zones = currentDriver?.zones;
  const status = currentDriver?.status || 'online';
  const driverId = currentDriver?.id || user?.id || '—';

  const getStatusConfig = () => {
    switch (status) {
      case 'online': return { color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)', label: 'On Duty', icon: 'radio-button-on' as const };
      case 'offline': return { color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.15)', label: 'Off Duty', icon: 'radio-button-off' as const };
      default: return { color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)', label: 'On Duty', icon: 'radio-button-on' as const };
    }
  };

  const statusConfig = getStatusConfig();

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 20) + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Gradient Background */}
        <LinearGradient
          colors={['#0EA5E9', '#0284C7', '#0369A1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerGradient, { paddingTop: insets.top + 20 }]}
        >
          {/* Decorative Elements */}
          <View style={styles.decorativeCircle1} />
          <View style={styles.decorativeCircle2} />
          
          {/* Profile Avatar */}
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarContainer}>
              <Image
                source={typeof avatar === 'string' ? { uri: avatar } : avatar}
                style={styles.avatar}
              />
              <View style={[styles.statusIndicator, { backgroundColor: statusConfig.color }]}>
                <View style={styles.statusIndicatorInner} />
              </View>
            </View>
          </View>

          {/* Name and Status */}
          <Text style={styles.name}>{driverName}</Text>
          
          {/* Status Badge */}
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
            <Ionicons name={statusConfig.icon} size={14} color={statusConfig.color} />
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>

          {/* Driver ID */}
          <View style={styles.driverIdContainer}>
            <Ionicons name="id-card-outline" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={styles.driverIdText}>ID: {typeof driverId === 'string' ? driverId.slice(0, 8).toUpperCase() : driverId}</Text>
          </View>
        </LinearGradient>

        {/* Content Section */}
        <View style={styles.content}>
          {/* Contact Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconContainer}>
                <Ionicons name="person-outline" size={20} color="#0EA5E9" />
              </View>
              <Text style={styles.cardTitle}>Contact Information</Text>
            </View>
            
            <View style={styles.cardBody}>
              <View style={styles.infoRow}>
                <View style={styles.infoIconSmall}>
                  <Ionicons name="call" size={16} color="#64748B" />
                </View>
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoLabel}>Phone Number</Text>
                  <Text style={styles.infoValue}>{phone}</Text>
                </View>
              </View>
              
              {helperName && (
                <>
                  <View style={styles.cardDivider} />
                  <View style={styles.infoRow}>
                    <View style={styles.infoIconSmall}>
                      <Ionicons name="people" size={16} color="#64748B" />
                    </View>
                    <View style={styles.infoTextContainer}>
                      <Text style={styles.infoLabel}>Helper</Text>
                      <Text style={styles.infoValue}>{helperName}</Text>
                    </View>
                  </View>
                  
                  {helperPhone && (
                    <>
                      <View style={styles.cardDivider} />
                      <View style={styles.infoRow}>
                        <View style={styles.infoIconSmall}>
                          <Ionicons name="call-outline" size={16} color="#64748B" />
                        </View>
                        <View style={styles.infoTextContainer}>
                          <Text style={styles.infoLabel}>Helper Phone</Text>
                          <Text style={styles.infoValue}>{helperPhone}</Text>
                        </View>
                      </View>
                    </>
                  )}
                </>
              )}
            </View>
          </View>

          {/* Vehicle Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconContainer, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="car-sport" size={20} color="#F59E0B" />
              </View>
              <Text style={styles.cardTitle}>Vehicle Details</Text>
            </View>
            
            <View style={styles.cardBody}>
              <View style={styles.vehicleInfoGrid}>
                <View style={styles.vehicleInfoItem}>
                  <Text style={styles.vehicleInfoLabel}>Type</Text>
                  <Text style={styles.vehicleInfoValue}>{vehicleType}</Text>
                </View>
                <View style={styles.vehicleInfoDivider} />
                <View style={styles.vehicleInfoItem}>
                  <Text style={styles.vehicleInfoLabel}>Plate Number</Text>
                  <Text style={styles.vehicleInfoValue}>{vehiclePlate}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Zones Card */}
          {zones && zones.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardIconContainer, { backgroundColor: '#DCFCE7' }]}>
                  <Ionicons name="location" size={20} color="#22C55E" />
                </View>
                <Text style={styles.cardTitle}>Assigned {zones.length === 1 ? 'Zone' : 'Zones'}</Text>
              </View>
              
              <View style={styles.cardBody}>
                <View style={styles.zonesGrid}>
                  {zones.map((zoneName, index) => (
                    <View key={index} style={styles.zoneChip}>
                      <Ionicons name="navigate" size={14} color="#0369A1" />
                      <Text style={styles.zoneChipText}>{zoneName}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* Quick Actions */}
          <View style={styles.quickActionsContainer}>
            <Text style={styles.quickActionsTitle}>Quick Actions</Text>
            <View style={styles.quickActionsGrid}>
              <TouchableOpacity 
                style={styles.quickActionCard}
                onPress={() => router.push('/(root)/(tabs)/delivery-history')}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="time-outline" size={24} color="#6366F1" />
                </View>
                <Text style={styles.quickActionLabel}>History</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.quickActionCard}
                onPress={() => router.push('/(root)/(tabs)/expenses')}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="receipt-outline" size={24} color="#F59E0B" />
                </View>
                <Text style={styles.quickActionLabel}>Expenses</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.quickActionCard}
                onPress={() => router.push('/(root)/(tabs)/loaded-items')}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#DCFCE7' }]}>
                  <Ionicons name="cube-outline" size={24} color="#22C55E" />
                </View>
                <Text style={styles.quickActionLabel}>Inventory</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.quickActionCard}
                onPress={() => router.push('/(root)/(tabs)/direct-sales')}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#FCE7F3' }]}>
                  <Ionicons name="cart-outline" size={24} color="#EC4899" />
                </View>
                <Text style={styles.quickActionLabel}>Direct Sale</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Sign Out Button */}
          <TouchableOpacity 
            style={styles.signOutButton} 
            onPress={onLogOut} 
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>

          {/* App Info */}
          <View style={styles.appInfo}>
            <View style={styles.appInfoRow}>
              <Ionicons name="water" size={16} color="#0EA5E9" />
              <Text style={styles.appName}>Al Ghadeer Water</Text>
            </View>
            <Text style={styles.version}>Driver App v1.0.0</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  headerGradient: {
    paddingBottom: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  decorativeCircle1: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  decorativeCircle2: {
    position: 'absolute',
    bottom: -30,
    left: -60,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  avatarWrapper: {
    marginBottom: 16,
  },
  avatarContainer: {
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    backgroundColor: '#F1F5F9',
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIndicatorInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  name: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    marginBottom: 12,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  driverIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  driverIdText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
  },
  content: {
    paddingHorizontal: 20,
    marginTop: -20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 12,
  },
  cardIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  cardBody: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
    marginLeft: 44,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIconSmall: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  vehicleInfoGrid: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 16,
  },
  vehicleInfoItem: {
    flex: 1,
    alignItems: 'center',
  },
  vehicleInfoDivider: {
    width: 1,
    backgroundColor: '#FDE68A',
    marginHorizontal: 12,
  },
  vehicleInfoLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#92400E',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  vehicleInfoValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#78350F',
  },
  zonesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  zoneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  zoneChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0369A1',
  },
  quickActionsContainer: {
    marginBottom: 20,
  },
  quickActionsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 14,
    marginLeft: 4,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickActionCard: {
    width: (width - 52) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  quickActionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    borderRadius: 16,
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
  appInfo: {
    alignItems: 'center',
    marginTop: 32,
    paddingBottom: 16,
  },
  appInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  appName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0EA5E9',
  },
  version: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
});

export default Profile;
