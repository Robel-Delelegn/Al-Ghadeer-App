import { Order } from '@/types/order';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

const IP_ADDRESS = "192.168.0.194:3000/api";

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
        let url = `http://${IP_ADDRESS}/driver/history`;
        url += "?driver_id=b97f3fc1-0708-4b97-bf5d-deb424b2cd93";

        // Fetch data from Express API
        const response = await fetch(url);

        // If response is not OK, throw error
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        // Parse the new API response format
        const apiResponse: ApiResponse = await response.json();
        console.log('History API Response:', apiResponse);
        
        if (!apiResponse.success || !apiResponse.data) {
          throw new Error('Invalid API response format');
        }

        // Keep products as-is, no transformation needed
        const transformedHistory: Order[] = apiResponse.data.map(order => ({
          ...order,
          products: order.products || {},
        }));

        // Save fetched data into state
        setHistory(transformedHistory);

      } catch (err) {
        console.error('Error fetching history:', err);
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
      contentContainerStyle={{ paddingVertical: 12 }}
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['All', 'delivered', 'failed', 'cancelled'] as const).map((s) => (
          <TouchableOpacity
            key={s}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 20,
              borderWidth: 1,
              backgroundColor: statusFilter === s ? '#10B981' : 'white',
              borderColor: statusFilter === s ? '#10B981' : '#E5E7EB'
            }}
            onPress={() => setStatusFilter(s)}
          >
            <Text style={{
              color: statusFilter === s ? 'white' : '#6B7280',
              fontSize: 14,
              fontWeight: '600'
            }}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
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
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 4
      }}>
        {/* Header with customer name and status */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#111827', fontSize: 18, fontWeight: 'bold', marginBottom: 4 }}>
              {customerName}
            </Text>
            <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: '600' }}>
              Order #{item.order_number}
            </Text>
          </View>
          <View style={{
            backgroundColor: statusStyle.backgroundColor,
            borderWidth: 1,
            borderColor: statusStyle.borderColor,
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 6,
            flexDirection: 'row',
            alignItems: 'center'
          }}>
            <Ionicons 
              name={item.status === 'delivered' ? 'checkmark-circle' : item.status === 'failed' ? 'close-circle' : 'time'} 
              size={14} 
              color={statusStyle.iconColor} 
              style={{ marginRight: 4 }}
            />
            <Text style={{ color: statusStyle.textColor, fontSize: 12, fontWeight: '600' }}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1).replace('_', ' ')}
            </Text>
          </View>
        </View>

        {/* Customer Information */}
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
            <Ionicons name="location" size={16} color="#6B7280" style={{ marginTop: 2, marginRight: 8 }} />
            <Text style={{ color: '#374151', fontSize: 14, flex: 1, lineHeight: 20 }}>
              {customerAddress}
            </Text>
          </View>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="call" size={16} color="#6B7280" style={{ marginRight: 8 }} />
            <Text style={{ color: '#374151', fontSize: 14 }}>
              {customerPhone}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="cube" size={16} color="#6B7280" style={{ marginRight: 8 }} />
            <Text style={{ color: '#374151', fontSize: 14 }}>
              {totalItems} items • AED {totalAmount}
            </Text>
          </View>
        </View>

        {/* Delivery Instructions */}
        {deliveryInstructions && (
          <View style={{ 
            backgroundColor: '#F9FAFB', 
            borderRadius: 8, 
            padding: 12, 
            marginBottom: 16 
          }}>
            <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: '600', marginBottom: 4 }}>
              DELIVERY NOTES
            </Text>
            <Text style={{ color: '#374151', fontSize: 14, lineHeight: 20 }}>
              {deliveryInstructions}
            </Text>
          </View>
        )}

        {/* Timestamps */}
        <View style={{ borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              {item.assigned_at && (
                <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 2 }}>
                  Assigned: {new Date(item.assigned_at).toLocaleDateString()}
                </Text>
              )}
              {item.completed_at && (
                <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 2 }}>
                  Completed: {new Date(item.completed_at).toLocaleDateString()}
                </Text>
              )}
              {item.delivery?.delivered_at && (
                <Text style={{ color: '#6B7280', fontSize: 12 }}>
                  Delivered: {new Date(item.delivery.delivered_at).toLocaleDateString()}
                </Text>
              )}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: '#10B981', fontSize: 16, fontWeight: 'bold' }}>
                AED {totalAmount}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  };


  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      {/* Header */}
      <View style={{ 
        backgroundColor: '#10B981', 
        paddingHorizontal: 20, 
        paddingTop: 16, 
        paddingBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 4
      }}>
        <Text style={{ color: 'white', fontSize: 20, fontWeight: 'bold', textAlign: 'center' }}>
          Delivery History
        </Text>
        <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 14, textAlign: 'center', marginTop: 4 }}>
          {filtered.length} deliveries found
        </Text>
      </View>

      {/* Search and Filters */}
      <View style={{ padding: 20, paddingBottom: 0 }}>
        {/* Search Bar */}
        <View style={{
          backgroundColor: 'white',
          borderRadius: 16,
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 4
        }}>
          <Ionicons name="search" size={20} color="#6B7280" style={{ marginRight: 12 }} />
          <TextInput
            style={{ flex: 1, fontSize: 16, color: '#111827' }}
            placeholder="Search by customer, address, or status..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} style={{ padding: 4 }}>
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>
          )}
        </View>

        {/* Status Pills */}
        <StatusPills />
      </View>

      {/* Content */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{
            backgroundColor: 'white',
            borderRadius: 20,
            padding: 32,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 8
          }}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={{ color: '#6B7280', fontSize: 16, marginTop: 16, fontWeight: '500' }}>
              Loading delivery history...
            </Text>
          </View>
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
              <View style={{
                backgroundColor: 'white',
                borderRadius: 20,
                padding: 32,
                alignItems: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
                elevation: 8
              }}>
                <Ionicons name="time" size={48} color="#9CA3AF" />
                <Text style={{ color: '#6B7280', fontSize: 18, fontWeight: '600', marginTop: 16, textAlign: 'center' }}>
                  No delivery history found
                </Text>
                <Text style={{ color: '#9CA3AF', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
                  {search ? 'Try adjusting your search criteria' : 'Your completed deliveries will appear here'}
                </Text>
              </View>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

export default DeliveryHistory;


