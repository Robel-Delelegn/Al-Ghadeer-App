import ScreenHeader from '@/components/ScreenHeader';
import { icons } from '@/constants';
import { useOrderStore } from '@/store/index';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from "expo-router";
import React, { useMemo } from 'react';
import { Image, Text, TouchableOpacity, View, ScrollView, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

const Profile = () => {
  const router = useRouter()
  const { user } = useUser();
  const { signOut } = useAuth();
  const { assignedOrders, currentDriver, getDriverMetrics } = useOrderStore();

  const onLogOut = () => {
    signOut();
    router.push("/")
  }

  const avatar = currentDriver?.profile_image || user?.imageUrl || icons.person;
  const driverName = currentDriver?.name || user?.fullName || user?.username || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 'Driver';
  const email = currentDriver?.email || user?.emailAddresses?.[0]?.emailAddress || 'Not set';
  const phone = currentDriver?.phone || user?.primaryPhoneNumber?.phoneNumber || user?.phoneNumbers?.[0]?.phoneNumber || 'Not set';
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
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* Custom Header */}
      <View style={{ 
        backgroundColor: '#FFFFFF', 
        paddingHorizontal: 20, 
        paddingTop: 16, 
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#E9ECEF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2
      }}>
        <Text style={{ color: '#212529', fontSize: 24, fontWeight: '700', textAlign: 'center' }}>
          Profile
        </Text>
      </View>

      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header Card */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 16, 
          padding: 24, 
          marginBottom: 20,
          borderWidth: 1,
          borderColor: '#E9ECEF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 4
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: '#F8F9FA',
              borderWidth: 3,
              borderColor: '#1976D2',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 16,
              shadowColor: '#1976D2',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius: 8,
              elevation: 4
            }}>
              <Image
                source={typeof avatar === 'string' ? { uri: avatar } : avatar}
                style={{ width: 70, height: 70, borderRadius: 35 }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#212529', fontSize: 22, fontWeight: '700', marginBottom: 4 }} numberOfLines={1}>
                {driverName}
              </Text>
              <Text style={{ color: '#6C757D', fontSize: 14, marginBottom: 2 }} numberOfLines={1}>
                {email}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="calendar" size={14} color="#6C757D" />
                <Text style={{ color: '#6C757D', fontSize: 12, marginLeft: 4 }}>
                  Member since {memberSince}
                </Text>
              </View>
            </View>
          </View>
          
          {/* Status Badge */}
          <View style={{
            backgroundColor: currentDriver?.status === 'active' ? '#E8F5E8' : '#FFF3E0',
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 6,
            alignSelf: 'flex-start',
            borderWidth: 1,
            borderColor: currentDriver?.status === 'active' ? '#C8E6C9' : '#FFE0B2'
          }}>
            <Text style={{ 
              color: currentDriver?.status === 'active' ? '#2E7D32' : '#F57C00', 
              fontSize: 12, 
              fontWeight: '600' 
            }}>
              {currentDriver?.status === 'active' ? '● Active' : '● Inactive'}
            </Text>
          </View>
        </View>

        {/* Stats Cards */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
          <View style={{ 
            flex: 1, 
            backgroundColor: '#FFFFFF', 
            borderRadius: 12, 
            padding: 16, 
            alignItems: 'center',
            borderWidth: 1,
            borderColor: '#E9ECEF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2
          }}>
            <View style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#E8F5E8',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8
            }}>
              <Ionicons name="checkmark-circle" size={20} color="#28A745" />
            </View>
            <Text style={{ color: '#212529', fontSize: 20, fontWeight: '700', marginBottom: 2 }}>
              {stats.delivered}
            </Text>
            <Text style={{ color: '#6C757D', fontSize: 12, fontWeight: '500' }}>Delivered</Text>
          </View>
          
          <View style={{ 
            flex: 1, 
            backgroundColor: '#FFFFFF', 
            borderRadius: 12, 
            padding: 16, 
            alignItems: 'center',
            borderWidth: 1,
            borderColor: '#E9ECEF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2
          }}>
            <View style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#E3F2FD',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8
            }}>
              <Ionicons name="time" size={20} color="#1976D2" />
            </View>
            <Text style={{ color: '#212529', fontSize: 20, fontWeight: '700', marginBottom: 2 }}>
              {stats.inProgress}
            </Text>
            <Text style={{ color: '#6C757D', fontSize: 12, fontWeight: '500' }}>In Progress</Text>
          </View>
          
          <View style={{ 
            flex: 1, 
            backgroundColor: '#FFFFFF', 
            borderRadius: 12, 
            padding: 16, 
            alignItems: 'center',
            borderWidth: 1,
            borderColor: '#E9ECEF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2
          }}>
            <View style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#FEF2F2',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8
            }}>
              <Ionicons name="close-circle" size={20} color="#DC3545" />
            </View>
            <Text style={{ color: '#212529', fontSize: 20, fontWeight: '700', marginBottom: 2 }}>
              {stats.failed}
            </Text>
            <Text style={{ color: '#6C757D', fontSize: 12, fontWeight: '500' }}>Failed</Text>
          </View>
        </View>

        {/* Driver Details Card */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 16, 
          padding: 24, 
          marginBottom: 20,
          borderWidth: 1,
          borderColor: '#E9ECEF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 4
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <View style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#F3E8FF',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12
            }}>
              <Ionicons name="person" size={20} color="#8B5CF6" />
            </View>
            <Text style={{ color: '#212529', fontSize: 18, fontWeight: '700' }}>
              Driver Information
            </Text>
          </View>
          
          <View style={{ gap: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: '#E8F5E8',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12
              }}>
                <Ionicons name="person-outline" size={16} color="#28A745" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#6C757D', fontSize: 12, fontWeight: '600', marginBottom: 2 }}>
                  FULL NAME
                </Text>
                <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
                  {driverName}
                </Text>
              </View>
            </View>
            
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: '#E3F2FD',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12
              }}>
                <Ionicons name="mail-outline" size={16} color="#1976D2" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#6C757D', fontSize: 12, fontWeight: '600', marginBottom: 2 }}>
                  EMAIL ADDRESS
                </Text>
                <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
                  {email}
                </Text>
              </View>
            </View>
            
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: '#FFF3E0',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12
              }}>
                <Ionicons name="call-outline" size={16} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#6C757D', fontSize: 12, fontWeight: '600', marginBottom: 2 }}>
                  PHONE NUMBER
                </Text>
                <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
                  {phone}
                </Text>
              </View>
            </View>
            
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: '#E8F5E8',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12
              }}>
                <Ionicons name="car-outline" size={16} color="#28A745" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#6C757D', fontSize: 12, fontWeight: '600', marginBottom: 2 }}>
                  VEHICLE INFO
                </Text>
                <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
                  {vehicleInfo}
                </Text>
              </View>
            </View>
            
            {driverMetrics && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: '#FFF3E0',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12
                  }}>
                    <Ionicons name="star-outline" size={16} color="#F59E0B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#6C757D', fontSize: 12, fontWeight: '600', marginBottom: 2 }}>
                      AVERAGE RATING
                    </Text>
                    <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
                      {driverMetrics.average_rating.toFixed(1)}/5.0
                    </Text>
                  </View>
                </View>
                
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: '#E8F5E8',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12
                  }}>
                    <Ionicons name="cash-outline" size={16} color="#28A745" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#6C757D', fontSize: 12, fontWeight: '600', marginBottom: 2 }}>
                      TOTAL EARNINGS
                    </Text>
                    <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
                      AED {driverMetrics.total_earnings}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={{ gap: 12 }}>
          <TouchableOpacity style={{ 
            backgroundColor: '#1976D2', 
            paddingVertical: 16, 
            borderRadius: 12, 
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            shadowColor: '#1976D2',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 6
          }}>
            <Ionicons name="create-outline" size={20} color="white" style={{ marginRight: 8 }} />
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
              Edit Profile
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={{ 
              backgroundColor: '#DC3545', 
              paddingVertical: 16, 
              borderRadius: 12, 
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              shadowColor: '#DC3545',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 6
            }}
            onPress={onLogOut}
          >
            <Ionicons name="log-out-outline" size={20} color="white" style={{ marginRight: 8 }} />
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
              Sign Out
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

export default Profile;
