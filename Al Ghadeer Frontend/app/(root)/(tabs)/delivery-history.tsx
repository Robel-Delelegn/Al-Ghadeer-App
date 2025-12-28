import { Order } from '@/types/order';
import { useAuthStore, authenticatedFetch } from '@/store/auth';
import { getTotalItemsCount } from '@/utils/orderUtils';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { 
  ActivityIndicator, 
  FlatList, 
  RefreshControl,
  Text, 
  TextInput, 
  TouchableOpacity, 
  View,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const IP_ADDRESS = process.env.EXPO_PUBLIC_IP_ADDRESS || 'http://localhost:3000/api';

interface ApiResponse {
  success: boolean;
  data: Order[];
}

type StatusFilter = 'all' | 'delivered' | 'failed' | 'cancelled';

const statusConfig: Record<StatusFilter, { label: string; color: string; bgColor: string; icon: keyof typeof Ionicons.glyphMap }> = {
  all: { label: 'All', color: '#0F172A', bgColor: '#F8FAFC', icon: 'apps' },
  delivered: { label: 'Delivered', color: '#059669', bgColor: '#ECFDF5', icon: 'checkmark-circle' },
  failed: { label: 'Failed', color: '#DC2626', bgColor: '#FEF2F2', icon: 'close-circle' },
  cancelled: { label: 'Cancelled', color: '#6B7280', bgColor: '#F9FAFB', icon: 'ban' },
};

const DeliveryHistory = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [history, setHistory] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuthStore()

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const url = `${IP_ADDRESS}/driver/history?driver_id=${user?.id}`;
      const response = await authenticatedFetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const responseData = await response.json();
      let orders: Order[] = [];
      
      if (responseData.success && responseData.data) {
        orders = responseData.data;
      } else if (Array.isArray(responseData)) {
        orders = responseData;
      } else {
        throw new Error('Invalid API response format');
      }

        // Normalize orders - handle both array and Record formats for products
        const transformedHistory: Order[] = orders.map(order => ({
          ...order,
          // Keep products as-is (can be array or Record)
          products: order.products || (Array.isArray(order.products) ? [] : {}),
          customer: {
            id: order.customer_id || '',
            site_id: order.customer_site_id,
            name: order.customer_name || '',
            phone: order.customer_phone || '',
            email: order.customer_email,
            address: order.customer_address || '',
            latitude: order.latitude || 0,
            longitude: order.longitude || 0,
          }
        }));

      setHistory(transformedHistory);
    } catch (err) {
      console.error('Error fetching history:', err);
      setHistory([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return history.filter((item) => {
      const customerName = item.customer_name || '';
      const customerAddress = item.customer_address || '';
      const customerPhone = item.customer_phone || '';
      
      const matchesQuery =
        !query ||
        customerName.toLowerCase().includes(query) ||
        customerAddress.toLowerCase().includes(query) ||
        customerPhone.toLowerCase().includes(query) ||
        item.order_number?.toLowerCase().includes(query);
        
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [search, statusFilter, history]);

  const stats = useMemo(() => ({
    total: history.length,
    delivered: history.filter(h => h.status === 'delivered').length,
    failed: history.filter(h => h.status === 'failed').length,
  }), [history]);

  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, []);

  const renderItem = useCallback(({ item }: { item: Order }) => {
    const customerName = item.customer_name || 'Unknown';
    const customerAddress = item.customer_address || '';
    const totalAmount = item.total_amount || 0;
    const config = statusConfig[item.status as StatusFilter] || statusConfig.cancelled;
    
    const totalItems = getTotalItemsCount(item);

    return (
      <TouchableOpacity 
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => {}}
      >
        {/* Status Strip */}
        <View style={[styles.statusStrip, { backgroundColor: config.color }]} />
        
        <View style={styles.cardContent}>
          {/* Top Row */}
          <View style={styles.cardTopRow}>
            <View style={styles.orderIdContainer}>
              <Text style={styles.orderId}>{item.order_number}</Text>
            </View>
            <View style={[styles.statusChip, { backgroundColor: config.bgColor }]}>
              <View style={[styles.statusDot, { backgroundColor: config.color }]} />
              <Text style={[styles.statusLabel, { color: config.color }]}>
                {config.label}
              </Text>
            </View>
          </View>

          {/* Customer Info */}
          <View style={styles.customerSection}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {customerName.charAt(0).toUpperCase()}
                </Text>
              </View>
            </View>
            <View style={styles.customerDetails}>
              <Text style={styles.customerName} numberOfLines={1}>
                {customerName}
              </Text>
              <Text style={styles.customerAddress} numberOfLines={1}>
                {customerAddress || 'No address'}
              </Text>
            </View>
          </View>

          {/* Metrics Row */}
          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <View style={styles.metricIcon}>
                <Ionicons name="cube-outline" size={14} color="#64748B" />
              </View>
              <Text style={styles.metricValue}>{totalItems}</Text>
              <Text style={styles.metricLabel}>items</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              <View style={styles.metricIcon}>
                <Ionicons name="wallet-outline" size={14} color="#64748B" />
              </View>
              <Text style={styles.metricValueHighlight}>AED {totalAmount}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [formatDate]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>History</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      {/* Stats Overview */}
      <View style={styles.statsContainer}>
        <View style={styles.statsCard}>
          <View style={styles.statBlock}>
            <Text style={styles.statNumber}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBlock}>
            <Text style={[styles.statNumber, { color: '#059669' }]}>{stats.delivered}</Text>
            <Text style={styles.statLabel}>Delivered</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBlock}>
            <Text style={[styles.statNumber, { color: '#DC2626' }]}>{stats.failed}</Text>
            <Text style={styles.statLabel}>Failed</Text>
          </View>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, order, address..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity 
              onPress={() => setSearch('')} 
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <View style={styles.clearButton}>
                <Ionicons name="close" size={12} color="#6B7280" />
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Pills */}
      <View style={styles.filterRow}>
        {(Object.keys(statusConfig) as StatusFilter[]).map((status) => {
          const config = statusConfig[status];
          const isActive = statusFilter === status;
          return (
            <TouchableOpacity
              key={status}
              style={[
                styles.filterPill,
                isActive && styles.filterPillActive,
              ]}
              onPress={() => setStatusFilter(status)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.filterPillText,
                isActive && styles.filterPillTextActive
              ]}>
                {config.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <View style={styles.loadingIndicator}>
            <ActivityIndicator size="large" color="#0F172A" />
          </View>
          <Text style={styles.loadingText}>Loading history...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#0F172A"
              colors={["#0F172A"]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="time-outline" size={44} color="#D1D5DB" />
              </View>
              <Text style={styles.emptyTitle}>No deliveries found</Text>
              <Text style={styles.emptySubtitle}>
                {search ? 'Try adjusting your search' : 'Completed deliveries will appear here'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFBFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: -0.4,
  },
  headerRight: {
    width: 36,
  },
  statsContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    paddingVertical: 20,
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -1,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 4,
    letterSpacing: 0.2,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
  },
  searchSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    fontWeight: '400',
  },
  clearButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  filterPillActive: {
    backgroundColor: '#111827',
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  statusStrip: {
    height: 3,
    width: '100%',
  },
  cardContent: {
    padding: 16,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  orderIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orderId: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
  },
  dateBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  customerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  customerDetails: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  customerAddress: {
    fontSize: 13,
    color: '#6B7280',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  metric: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  metricValueHighlight: {
    fontSize: 14,
    fontWeight: '700',
    color: '#059669',
  },
  metricLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  metricDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  loadingIndicator: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIconContainer: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    maxWidth: 240,
  },
});

export default DeliveryHistory;
