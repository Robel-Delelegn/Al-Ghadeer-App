import ScreenHeader from '@/components/ScreenHeader';
import { icons } from '@/constants';
import { useOrderStore } from '@/store/index';
import { useAuthStore } from '@/store/auth';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from "expo-router";
import React, { useMemo } from 'react';
import { Image, Text, TouchableOpacity, View, ScrollView, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

const Profile = () => {
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const { assignedOrders, currentDriver, getDriverMetrics } = useOrderStore();

  const onLogOut = async () => {
    await signOut();
    router.replace("/");
  };

  const avatar = currentDriver?.profile_image || icons.person;
  const driverName = currentDriver?.name || user?.driver_name || user?.name || user?.phone || 'Driver';
  const helperName = user?.helper_name || '';
  const phone = currentDriver?.phone || user?.phone || 'Not set';
  const memberSince = currentDriver?.account.joined_date ? new Date(currentDriver.account.joined_date).toLocaleDateString() : '—';
  const vehicleInfo = currentDriver?.vehicle ? `${currentDriver.vehicle.model} (${currentDriver.vehicle.plate_number})` : 'Not set';

  const stats = useMemo(() => {
    const total = assignedOrders.length;
    const delivered = assignedOrders.filter(o => o.status === 'delivered').length;
    const failed = assignedOrders.filter(o => o.status === 'failed').length;
    const inProgress = assignedOrders.filter(o => o.status === 'in_progress').length;
    const pending = assignedOrders.filter(o => o.status === 'pending').length;
    return { total, delivered, failed, inProgress, pending };
  }, [assignedOrders]);

  const driverMetrics = getDriverMetrics();

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
          Profile
        </Text>
      </View>

      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header - Minimal */}
        <View style={{ 
          alignItems: 'center', 
          marginBottom: 24,
          paddingBottom: 20,
          borderBottomWidth: 1,
          borderBottomColor: '#F3F4F6',
            }}>
              <Image
                source={typeof avatar === 'string' ? { uri: avatar } : avatar}
            style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 12 }}
              />
          <Text style={{ color: '#111827', fontSize: 18, fontWeight: '600', marginBottom: 4 }}>
                {driverName}
              </Text>
          {helperName && (
            <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 8 }}>
              Helper: {helperName}
              </Text>
          )}
          {memberSince !== '—' && (
            <Text style={{ color: '#9CA3AF', fontSize: 12 }}>
                  Member since {memberSince}
            </Text>
          )}
        </View>

        {/* Stats - Minimal */}
          <View style={{ 
          flexDirection: 'row', 
          marginBottom: 24,
          paddingBottom: 20,
          borderBottomWidth: 1,
          borderBottomColor: '#F3F4F6',
          }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: '#111827', fontSize: 24, fontWeight: '600', marginBottom: 4 }}>
              {stats.delivered}
            </Text>
            <Text style={{ color: '#6B7280', fontSize: 12 }}>Delivered</Text>
          </View>
          <View style={{ width: 1, backgroundColor: '#F3F4F6', marginHorizontal: 12 }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: '#111827', fontSize: 24, fontWeight: '600', marginBottom: 4 }}>
              {stats.inProgress}
            </Text>
            <Text style={{ color: '#6B7280', fontSize: 12 }}>In Progress</Text>
          </View>
          <View style={{ width: 1, backgroundColor: '#F3F4F6', marginHorizontal: 12 }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: '#111827', fontSize: 24, fontWeight: '600', marginBottom: 4 }}>
              {stats.failed}
            </Text>
            <Text style={{ color: '#6B7280', fontSize: 12 }}>Failed</Text>
          </View>
        </View>

        {/* Driver Information - Minimal List */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: '#111827', fontSize: 16, fontWeight: '600', marginBottom: 16 }}>
            Information
          </Text>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#F3F4F6' }}>
        <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center',
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderBottomWidth: 1,
              borderBottomColor: '#F3F4F6',
              }}>
              <Ionicons name="person-outline" size={18} color="#6B7280" style={{ marginRight: 12, width: 24 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>Name</Text>
                <Text style={{ fontSize: 14, color: '#111827', fontWeight: '500' }}>{driverName}</Text>
              </View>
            </View>
            
              <View style={{
              flexDirection: 'row', 
                alignItems: 'center',
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderBottomWidth: 1,
              borderBottomColor: '#F3F4F6',
              }}>
              <Ionicons name="call-outline" size={18} color="#6B7280" style={{ marginRight: 12, width: 24 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>Phone</Text>
                <Text style={{ fontSize: 14, color: '#111827', fontWeight: '500' }}>{phone}</Text>
              </View>
            </View>
            
              <View style={{
              flexDirection: 'row', 
                alignItems: 'center',
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderBottomWidth: 1,
              borderBottomColor: '#F3F4F6',
              }}>
              <Ionicons name="car-outline" size={18} color="#6B7280" style={{ marginRight: 12, width: 24 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>Vehicle</Text>
                <Text style={{ fontSize: 14, color: '#111827', fontWeight: '500' }}>{vehicleInfo}</Text>
              </View>
            </View>
            
            {user?.zone && (
              <View style={{
                flexDirection: 'row', 
                alignItems: 'center',
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#F3F4F6',
              }}>
                <Ionicons name="location-outline" size={18} color="#6B7280" style={{ marginRight: 12, width: 24 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>Zone</Text>
                  <Text style={{ fontSize: 14, color: '#111827', fontWeight: '500' }}>{user.zone}</Text>
              </View>
              </View>
            )}
            
            {driverMetrics && (
              <>
                  <View style={{
                  flexDirection: 'row', 
                    alignItems: 'center',
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: '#F3F4F6',
                  }}>
                  <Ionicons name="star-outline" size={18} color="#6B7280" style={{ marginRight: 12, width: 24 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>Rating</Text>
                    <Text style={{ fontSize: 14, color: '#111827', fontWeight: '500' }}>
                      {driverMetrics.average_rating.toFixed(1)}/5.0
                    </Text>
                  </View>
                </View>
                
                  <View style={{
                  flexDirection: 'row', 
                    alignItems: 'center',
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  }}>
                  <Ionicons name="cash-outline" size={18} color="#6B7280" style={{ marginRight: 12, width: 24 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>Earnings</Text>
                    <Text style={{ fontSize: 14, color: '#111827', fontWeight: '500' }}>
                      AED {driverMetrics.total_earnings}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Action Buttons - Minimal */}
        <View style={{ gap: 10 }}>
          <TouchableOpacity 
            style={{ 
              backgroundColor: '#F9FAFB', 
              paddingVertical: 14, 
              borderRadius: 10, 
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
              borderWidth: 1,
              borderColor: '#E5E7EB',
            }}
          >
            <Ionicons name="create-outline" size={18} color="#374151" style={{ marginRight: 8 }} />
            <Text style={{ color: '#374151', fontSize: 15, fontWeight: '500' }}>
              Edit Profile
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={{ 
              backgroundColor: '#FEF2F2', 
              paddingVertical: 14, 
              borderRadius: 10, 
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: '#FEE2E2',
            }}
            onPress={onLogOut}
          >
            <Ionicons name="log-out-outline" size={18} color="#DC2626" style={{ marginRight: 8 }} />
            <Text style={{ color: '#DC2626', fontSize: 15, fontWeight: '500' }}>
              Sign Out
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

export default Profile;
