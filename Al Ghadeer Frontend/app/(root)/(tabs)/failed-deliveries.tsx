import { useOrderStore } from '@/store/index';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState, useCallback, useMemo } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View, ActivityIndicator, Modal, Image } from 'react-native';

const IP_ADDRESS = "192.168.0.194:3000/api";

const FAILURE_REASONS = [
  'Customer not available',
  'Wrong address provided',
  'Customer refused delivery',
  'Damaged goods',
  'Incomplete order',
  'Payment issue',
  'Weather conditions',
  'Vehicle breakdown',
  'Security restrictions',
  'Customer requested reschedule',
  'Delivery location inaccessible',
  'Customer phone unreachable',
  'Building access denied',
  'Package damaged during transport',
  'Other',
];

const FailedDeliveries = () => {
  const router = useRouter();
  const { selectedOrder, assignedOrders, updateOrderStatus, currentDriver } = useOrderStore();
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [additionalNotes, setAdditionalNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReasonModal, setShowReasonModal] = useState(false);

  const order = assignedOrders.find(item => selectedOrder === item.id);


  const handleSubmitFailedDelivery = useCallback(async () => {
    if (!order) {
      Alert.alert('Error', 'Order information not found.');
      return;
    }

    if (!selectedReason) {
      Alert.alert('Error', 'Please select a reason for failed delivery.');
      return;
    }

    if (!currentDriver) {
      Alert.alert('Error', 'Driver information not found.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Prepare failure details
      const failureDetails = {
        order_id: order.id,
        customer_id: order.customer_id || order.customer?.id,
        reason: selectedReason,
        additional_notes: additionalNotes,
        submitted_at: new Date().toISOString()
      };

      // Send to server
      const url = `http://${IP_ADDRESS}/failed-deliveries/submit?driver_id=${currentDriver.id}`;
      console.log('Submitting failed delivery to:', url);
      console.log('Failed delivery data:', failureDetails);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(failureDetails)
      });

      const result = await response.json();
      
      if (result.success) {
        // Update order status to failed with detailed reason
        updateOrderStatus(order.id, 'failed', selectedReason, JSON.stringify(failureDetails));
        
        // Show success message
        Alert.alert(
          'Failed Delivery Reported',
          result.message || 'Your failed delivery report has been submitted successfully.',
          [
            {
              text: 'OK',
              onPress: () => router.push('/(root)/(tabs)/home')
            }
          ]
        );
      } else {
        Alert.alert('Error', result.message || 'Failed to submit report. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting failed delivery report:', error);
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [order, selectedReason, additionalNotes, currentDriver, updateOrderStatus, router]);

  const handleCancel = () => {
    Alert.alert(
      'Cancel Report',
      'Are you sure you want to cancel this failed delivery report?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: () => router.back() }
      ]
    );
  };

  if (!order) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' }}>
        <View style={{
          backgroundColor: 'white',
          borderRadius: 16,
          padding: 24,
          alignItems: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 4,
          margin: 20
        }}>
          <Ionicons name="alert-circle" size={48} color="#DC3545" />
          <Text style={{ color: '#212529', fontSize: 18, fontWeight: '600', marginTop: 16, textAlign: 'center' }}>
            Order Not Found
          </Text>
          <Text style={{ color: '#6C757D', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
            The order information could not be retrieved.
          </Text>
          <TouchableOpacity 
            style={{ 
              marginTop: 20, 
              paddingVertical: 12, 
              paddingHorizontal: 24, 
              backgroundColor: '#1976D2', 
              borderRadius: 8 
            }}
            onPress={() => router.push('/(root)/(tabs)/home')}
          >
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* Header */}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity 
            onPress={() => router.back()}
            style={{ padding: 8 }}
          >
            <Ionicons name="arrow-back" size={24} color="#495057" />
          </TouchableOpacity>
          <Text style={{ color: '#212529', fontSize: 18, fontWeight: '600' }}>
            Failed Delivery Report
          </Text>
          <View style={{ width: 40 }} />
        </View>
      </View>

      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Order Information Card */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 12, 
          padding: 20, 
          marginBottom: 16,
          borderWidth: 1,
          borderColor: '#E9ECEF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ 
              width: 40, 
              height: 40, 
              backgroundColor: '#FEF2F2', 
              borderRadius: 20, 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginRight: 12 
            }}>
              <Ionicons name="alert-circle" size={20} color="#DC3545" />
            </View>
            <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
              Order Information
            </Text>
          </View>
          
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#6C757D', fontSize: 14, fontWeight: '500' }}>Order ID:</Text>
              <Text style={{ color: '#212529', fontSize: 14, fontWeight: '600' }}>
                {order.order_number || order.id}
              </Text>
            </View>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#6C757D', fontSize: 14, fontWeight: '500' }}>Customer:</Text>
              <Text style={{ color: '#212529', fontSize: 14, fontWeight: '600' }}>
                {order.customer?.name || order.customer_name || 'N/A'}
              </Text>
            </View>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#6C757D', fontSize: 14, fontWeight: '500' }}>Phone:</Text>
              <Text style={{ color: '#212529', fontSize: 14, fontWeight: '600' }}>
                {order.customer?.phone || order.customer_phone || 'N/A'}
              </Text>
            </View>
            
            <View>
              <Text style={{ color: '#6C757D', fontSize: 14, fontWeight: '500', marginBottom: 4 }}>Address:</Text>
              <Text style={{ color: '#212529', fontSize: 14, fontWeight: '600', lineHeight: 20 }}>
                {order.customer?.address || order.customer_address || 'N/A'}
              </Text>
            </View>
          </View>
        </View>

        {/* Failure Reason Card */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 12, 
          padding: 20, 
          marginBottom: 16,
          borderWidth: 1,
          borderColor: '#E9ECEF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ 
              width: 40, 
              height: 40, 
              backgroundColor: '#FFF3E0', 
              borderRadius: 20, 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginRight: 12 
            }}>
              <Ionicons name="list" size={20} color="#F59E0B" />
            </View>
            <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
              Reason for Failed Delivery
            </Text>
            <Text style={{ color: '#DC3545', fontSize: 16, marginLeft: 4 }}>*</Text>
          </View>
          
          <TouchableOpacity 
            style={{ 
              backgroundColor: '#F8F9FA', 
              borderRadius: 8, 
              padding: 16, 
              borderWidth: 1, 
              borderColor: selectedReason ? '#1976D2' : '#E9ECEF',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
            onPress={() => setShowReasonModal(true)}
          >
            <Text style={{ 
              color: selectedReason ? '#212529' : '#6C757D', 
              fontSize: 16, 
              fontWeight: selectedReason ? '500' : '400' 
            }}>
              {selectedReason || 'Select a reason...'}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#6C757D" />
          </TouchableOpacity>
        </View>

        {/* Additional Details Card */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 12, 
          padding: 20, 
          marginBottom: 16,
          borderWidth: 1,
          borderColor: '#E9ECEF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ 
              width: 40, 
              height: 40, 
              backgroundColor: '#F3E8FF', 
              borderRadius: 20, 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginRight: 12 
            }}>
              <Ionicons name="document-text" size={20} color="#8B5CF6" />
            </View>
            <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
              Additional Details
            </Text>
            <Text style={{ color: '#94A3B8', fontSize: 14, marginLeft: 8 }}>
              (Optional)
            </Text>
          </View>
          
          <TextInput
            style={{
              backgroundColor: '#F8F9FA',
              borderRadius: 8,
              padding: 16,
              borderWidth: 1,
              borderColor: '#E9ECEF',
              fontSize: 16,
              color: '#212529',
              minHeight: 120,
              textAlignVertical: 'top'
            }}
            placeholder="Provide additional details about the failed delivery attempt..."
            placeholderTextColor="#6C757D"
            multiline
            numberOfLines={6}
            value={additionalNotes}
            onChangeText={setAdditionalNotes}
          />
        </View>

        {/* Action Buttons */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity
            style={{ 
              flex: 1, 
              backgroundColor: '#F8F9FA', 
              borderRadius: 12, 
              paddingVertical: 16,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#E9ECEF'
            }}
            onPress={handleCancel}
            disabled={isSubmitting}
          >
            <Text style={{ color: '#6C757D', fontSize: 16, fontWeight: '600' }}>
              Cancel
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={{ 
              flex: 1, 
              backgroundColor: selectedReason && !isSubmitting ? '#DC3545' : '#94A3B8', 
              borderRadius: 12, 
              paddingVertical: 16,
              alignItems: 'center',
              shadowColor: selectedReason && !isSubmitting ? '#DC3545' : 'transparent',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: selectedReason && !isSubmitting ? 0.3 : 0,
              shadowRadius: 8,
              elevation: selectedReason && !isSubmitting ? 6 : 0
            }}
            onPress={handleSubmitFailedDelivery}
            disabled={!selectedReason || isSubmitting}
          >
            {isSubmitting ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator size="small" color="white" style={{ marginRight: 8 }} />
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                  Submitting...
                </Text>
              </View>
            ) : (
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                Submit Report
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Reason Selection Modal */}
      <Modal visible={showReasonModal} transparent animationType="fade" onRequestClose={() => setShowReasonModal(false)}>
        <View style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0, 0, 0, 0.4)', 
          alignItems: 'center', 
          justifyContent: 'flex-end' 
        }}>
          <View style={{ 
            backgroundColor: 'white', 
            width: '100%', 
            borderTopLeftRadius: 16, 
            borderTopRightRadius: 16, 
            padding: 16, 
            maxHeight: '70%' 
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827' }}>
                Select Failure Reason
              </Text>
              <TouchableOpacity onPress={() => setShowReasonModal(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {FAILURE_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={{
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: '#F3F4F6',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                  onPress={() => {
                    setSelectedReason(reason);
                    setShowReasonModal(false);
                  }}
                >
                  <Text style={{ 
                    fontSize: 15, 
                    color: selectedReason === reason ? '#DC3545' : '#111827',
                    fontWeight: selectedReason === reason ? '600' : '400'
                  }}>
                    {reason}
                  </Text>
                  {selectedReason === reason && (
                    <Ionicons name="checkmark" size={18} color="#DC3545" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default FailedDeliveries;
