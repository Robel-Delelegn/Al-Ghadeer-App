import { Order } from '@/types/order';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

const IP_ADDRESS = process.env.EXPO_PUBLIC_IP_ADDRESS || 'http://localhost:3000/api';

// API Response interface
interface ApiResponse {
  success: boolean;
  data: Order[];
}

const getStatusStyle = (status: string) => {
  switch (status) {
    case 'delivered':
      return {
        backgroundColor: '#F0FDF4',
        borderColor: '#10B981',
        textColor: '#10B981',
        iconColor: '#10B981'
      };
    case 'failed':
      return {
        backgroundColor: '#FEF2F2',
        borderColor: '#EF4444',
        textColor: '#EF4444',
        iconColor: '#EF4444'
      };
    case 'cancelled':
      return {
        backgroundColor: '#F9FAFB',
        borderColor: '#6B7280',
        textColor: '#6B7280',
        iconColor: '#6B7280'
      };
    default:
      return {
        backgroundColor: '#F9FAFB',
        borderColor: '#6B7280',
        textColor: '#6B7280',
        iconColor: '#6B7280'
      };
  }
};

const DeliveryHistory = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'delivered' | 'failed' | 'cancelled'>('All');
  const [history, setHistory] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Define an async function inside useEffect
    const fetchHistory = async () => {
      try {
        setLoading(true); // Start loading before fetch

        // Build URL with driver_id parameter
        let url = `${IP_ADDRESS}/driver/history`;
        url += "?driver_id=b97f3fc1-0708-4b97-bf5d-deb424b2cd93";

        // Fetch data from Express API
        const response = await fetch(url);

        // If response is not OK, throw error
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        // Parse the API response
        const responseData = await response.json();
        console.log('History API Response:', responseData);
        
        // Handle both response formats for compatibility
        let orders: Order[] = [];
        if (responseData.success && responseData.data) {
          // New format: { success: true, data: [...] }
          orders = responseData.data;
        } else if (Array.isArray(responseData)) {
          // Old format: [...] (direct array)
          orders = responseData;
        } else {
          throw new Error('Invalid API response format');
        }

        // Transform orders to ensure proper structure
        const transformedHistory: Order[] = orders.map(order => {
          // If customer already exists, use it; otherwise construct from fallback fields
          let customer = order.customer;
          if (!customer && order.customer_name) {
            customer = {
              name: order.customer_name || '',
              phone: order.customer_phone || '',
              email: order.customer_email,
              address: order.customer_address || '',
              id: order.customer_id || '',
              site_id: order.customer_site_id,
              latitude: order.latitude || 0,
              longitude: order.longitude || 0
            };
          }
          return {
          ...order,
          products: order.products || {},
            customer
          } as Order;
        });

        // Save fetched data into state
        setHistory(transformedHistory);
        console.log(`✅ Loaded ${transformedHistory.length} history items`);

      } catch (err) {
        console.error('Error fetching history:', err);
        // Set empty array on error to prevent crashes
        setHistory([]);
      } finally {
        setLoading(false); // End loading whether success or failure
      }
    };
    console.log("Successful fetching");
    // Call the async function
    fetchHistory();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return history.filter((item) => {
      const customerName = item.customer?.name || item.customer_name || '';
      const customerAddress = item.customer?.address || item.customer_address || '';
      const customerPhone = item.customer?.phone || item.customer_phone || '';
      const deliveryInstructions = item.customer?.delivery_instructions || item.delivery_instructions || '';
      
      const matchesQuery =
        !query ||
        customerName.toLowerCase().includes(query) ||
        customerAddress.toLowerCase().includes(query) ||
        item.status.toLowerCase().includes(query) ||
        customerPhone.toLowerCase().includes(query) ||
        deliveryInstructions.toLowerCase().includes(query);
        
      const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [search, statusFilter, history]);

  const StatusPills = () => (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingVertical: 4 }}
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['All', 'delivered', 'failed', 'cancelled'] as const).map((s) => {
          const isActive = statusFilter === s;
          const statusStyle = s !== 'All' ? getStatusStyle(s) : null;
          return (
          <TouchableOpacity
            key={s}
            style={{
                paddingHorizontal: 14,
              paddingVertical: 8,
                borderRadius: 8,
              borderWidth: 1,
                backgroundColor: isActive 
                  ? (statusStyle?.backgroundColor || '#111827')
                  : '#F9FAFB',
                borderColor: isActive 
                  ? (statusStyle?.borderColor || '#111827')
                  : '#E5E7EB'
            }}
            onPress={() => setStatusFilter(s)}
          >
            <Text style={{
                color: isActive 
                  ? (statusStyle?.textColor || '#FFFFFF')
                  : '#6B7280',
                fontSize: 13,
                fontWeight: '500'
            }}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Text>
          </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderItem = ({ item }: { item: Order }) => {
    // Calculate total items dynamically
    const calculateTotalItems = (): number => {
      if (item.products && typeof item.products === 'object') {
        return Object.values(item.products).reduce((total, quantity) => {
          return total + (typeof quantity === 'number' ? quantity : 0);
        }, 0);
      }
      return 0;
    };
    
    const totalItems = calculateTotalItems();
    const customerName = item.customer?.name || item.customer_name || 'N/A';
    const customerAddress = item.customer?.address || item.customer_address || 'N/A';
    const customerPhone = item.customer?.phone || item.customer_phone || 'N/A';
    const totalAmount = item.pricing?.total_amount || item.total_amount || 0;
    const deliveryInstructions = item.customer?.delivery_instructions || item.delivery_instructions;
    const statusStyle = getStatusStyle(item.status);

    return (
      <View style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#F3F4F6'
      }}>
        {/* Header with customer name and status */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#111827', fontSize: 16, fontWeight: '600', marginBottom: 4 }}>
              {customerName}
            </Text>
            <Text style={{ color: '#9CA3AF', fontSize: 11 }}>
              #{item.order_number}
            </Text>
          </View>
          <View style={{
            backgroundColor: statusStyle.backgroundColor,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 5,
            flexDirection: 'row',
            alignItems: 'center'
          }}>
            <Ionicons 
              name={item.status === 'delivered' ? 'checkmark-circle' : item.status === 'failed' ? 'close-circle' : 'time-outline'} 
              size={12} 
              color={statusStyle.iconColor} 
              style={{ marginRight: 4 }}
            />
            <Text style={{ color: statusStyle.textColor, fontSize: 11, fontWeight: '600' }}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1).replace('_', ' ')}
            </Text>
          </View>
        </View>

        {/* Customer Information */}
        <View style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
            <Ionicons name="location-outline" size={14} color="#9CA3AF" style={{ marginTop: 2, marginRight: 8, width: 18 }} />
            <Text style={{ color: '#374151', fontSize: 13, flex: 1, lineHeight: 18 }}>
              {customerAddress}
            </Text>
          </View>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="call-outline" size={14} color="#9CA3AF" style={{ marginRight: 8, width: 18 }} />
            <Text style={{ color: '#6B7280', fontSize: 13 }}>
              {customerPhone}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="cube-outline" size={14} color="#9CA3AF" style={{ marginRight: 8, width: 18 }} />
            <Text style={{ color: '#6B7280', fontSize: 13 }}>
              {totalItems} {totalItems === 1 ? 'item' : 'items'}
            </Text>
          </View>
        </View>

        {/* Delivery Instructions */}
        {deliveryInstructions && (
          <View style={{ 
            backgroundColor: '#F9FAFB', 
            borderRadius: 8, 
            padding: 10, 
            marginBottom: 12,
            borderWidth: 1,
            borderColor: '#E5E7EB'
          }}>
            <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '500', marginBottom: 4 }}>
              Notes
            </Text>
            <Text style={{ color: '#374151', fontSize: 12, lineHeight: 18 }}>
              {deliveryInstructions}
            </Text>
          </View>
        )}

        {/* Footer with amount and date */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
            {item.delivery?.delivered_at && (
              <Text style={{ color: '#9CA3AF', fontSize: 11 }}>
                {new Date(item.delivery.delivered_at).toLocaleDateString()}
                </Text>
              )}
            {!item.delivery?.delivered_at && item.completed_at && (
              <Text style={{ color: '#9CA3AF', fontSize: 11 }}>
                {new Date(item.completed_at).toLocaleDateString()}
                </Text>
              )}
            {!item.delivery?.delivered_at && !item.completed_at && item.assigned_at && (
              <Text style={{ color: '#9CA3AF', fontSize: 11 }}>
                {new Date(item.assigned_at).toLocaleDateString()}
                </Text>
              )}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: '#111827', fontSize: 15, fontWeight: '600' }}>
              AED {totalAmount.toFixed(2)}
              </Text>
          </View>
        </View>
      </View>
    );
  };


  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      {/* Minimal Header */}
      <View style={{ 
        backgroundColor: '#FFFFFF', 
        paddingHorizontal: 20, 
        paddingTop: 16, 
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
      }}>
        <Text style={{ color: '#111827', fontSize: 20, fontWeight: '600', textAlign: 'center' }}>
          Delivery History
        </Text>
        {!loading && (
          <Text style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', marginTop: 4 }}>
            {filtered.length} {filtered.length === 1 ? 'delivery' : 'deliveries'}
        </Text>
        )}
      </View>

      {/* Search and Filters */}
      <View style={{ padding: 20, paddingBottom: 12 }}>
        {/* Search Bar */}
        <View style={{
          backgroundColor: '#F9FAFB',
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 16,
          borderWidth: 1,
          borderColor: '#E5E7EB'
        }}>
          <Ionicons name="search-outline" size={18} color="#9CA3AF" style={{ marginRight: 10 }} />
          <TextInput
            style={{ flex: 1, fontSize: 15, color: '#111827' }}
            placeholder="Search deliveries..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Status Pills */}
        <StatusPills />
      </View>

      {/* Content */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#6B7280" />
          <Text style={{ color: '#9CA3AF', fontSize: 14, marginTop: 16 }}>
            Loading...
            </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
          ListEmptyComponent={
            <View style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 60
            }}>
              <Ionicons name="time-outline" size={32} color="#D1D5DB" />
              <Text style={{ color: '#6B7280', fontSize: 15, fontWeight: '500', marginTop: 12, textAlign: 'center' }}>
                {search ? 'No deliveries found' : 'No delivery history'}
                </Text>
              <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 6, textAlign: 'center' }}>
                {search ? 'Try different search terms' : 'Completed deliveries will appear here'}
                </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

export default DeliveryHistory;


