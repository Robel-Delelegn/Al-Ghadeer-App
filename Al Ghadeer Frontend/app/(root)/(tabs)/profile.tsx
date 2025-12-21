import { icons } from '@/constants';
import { useOrderStore } from '@/store/index';
import { useAuthStore } from '@/store/auth';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from "expo-router";
import React, { useMemo } from 'react';
import { 
  Image, 
  Text, 
  TouchableOpacity, 
  View, 
  ScrollView, 
  StyleSheet,
} from 'react-native';
import { showWarningAlert } from '@/utils/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const Profile = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const { assignedOrders, currentDriver, getDriverMetrics } = useOrderStore();

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
  const driverName = user?.driver_name || user?.name || 'Driver';
  const helperName = user?.helper_name;
  const phone = user?.phone || '—';
  const vehicleType = user?.vehicle_type || '—';
  const vehiclePlate = user?.vehicle_number || '—';
  const zone = user?.zone || '—';
  const status = currentDriver?.status || 'online';

  const stats = useMemo(() => {
    const delivered = assignedOrders.filter(o => o.status === 'delivered').length;
    const inProgress = assignedOrders.filter(o => o.status === 'in_progress').length;
    const pending = assignedOrders.filter(o => o.status === 'pending' || o.status === 'assigned').length;
    return { delivered, inProgress, pending };
  }, [assignedOrders]);

  const driverMetrics = getDriverMetrics();
  const rating = driverMetrics?.average_rating || 0;

  const getStatusConfig = () => {
    switch (status) {
      case 'online': return { color: '#10B981', bg: '#ECFDF5', label: 'Online' };
      case 'busy': return { color: '#F59E0B', bg: '#FFFBEB', label: 'Busy' };
      default: return { color: '#64748B', bg: '#F1F5F9', label: 'Offline' };
    }
  };

  const statusConfig = getStatusConfig();

  const InfoItem = ({ icon, label, value }: { 
    icon: keyof typeof Ionicons.glyphMap; 
    label: string; 
    value: string;
  }) => (
    <View style={styles.infoItem}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color="#64748B" />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            <Image
              source={typeof avatar === 'string' ? { uri: avatar } : avatar}
              style={styles.avatar}
            />
            <View style={[styles.statusIndicator, { backgroundColor: statusConfig.color }]} />
          </View>

          <Text style={styles.name}>{driverName}</Text>
          {helperName && (
            <Text style={styles.helperName}>Helper: {helperName}</Text>
          )}

          {/* Status Badge */}
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>

          {/* Rating */}
          {rating > 0 && (
            <View style={styles.ratingContainer}>
              <Ionicons name="star" size={16} color="#FBBF24" />
              <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
            </View>
          )}
        </View>

        {/* Stats Section */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.delivered}</Text>
            <Text style={styles.statLabel}>Delivered</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.inProgress}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
        </View>

        {/* Information Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Information</Text>
          <View style={styles.infoCard}>
            <InfoItem icon="call-outline" label="Phone" value={phone} />
            <View style={styles.infoDivider} />
            <InfoItem icon="car-outline" label="Vehicle" value={vehicleType} />
            <View style={styles.infoDivider} />
            <InfoItem icon="document-text-outline" label="Plate" value={vehiclePlate} />
            {zone !== '—' && (
              <>
                <View style={styles.infoDivider} />
                <InfoItem icon="location-outline" label="Zone" value={zone} />
              </>
            )}
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={onLogOut} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={16} color="#EF4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* App Version */}
        <Text style={styles.version}>Al Ghadeer Driver v1.0.0</Text>
        <View style={{ height: Math.max(insets.bottom, 20) + 80 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F1F5F9',
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  name: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  helperName: {
    fontSize: 15,
    color: '#64748B',
    marginBottom: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    marginBottom: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  statsContainer: {
    flexDirection: 'row',
    marginHorizontal: 24,
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    paddingVertical: 20,
    marginBottom: 32,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E2E8F0',
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 8,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginLeft: 66,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: '47%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 24,
    marginTop: 8,
    paddingVertical: 16,
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    gap: 10,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
  version: {
    fontSize: 12,
    color: '#CBD5E1',
    textAlign: 'center',
    marginTop: 24,
  },
});

export default Profile;
