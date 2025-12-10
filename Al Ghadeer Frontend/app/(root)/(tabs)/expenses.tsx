import { useExpenseStore, useOrderStore } from '@/store/index';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Alert, Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';

const EXPENSE_TYPES = [
  'Fuel',
  'Parking',
  'Toll',
  'Maintenance',
  'Supplies',
  'Other',
];

const IP_ADDRESS = process.env.EXPO_PUBLIC_IP_ADDRESS || 'http://localhost:3000/api';

// API Response interfaces
interface SubmitExpenseResponse {
  success: boolean;
  message: string;
  expense: {
    id: number;
    request_id: string;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
  };
}

interface ServerExpense {
  id: number;
  request_id: string;
  type: string;
  amount: number;
  description?: string;
  receipt_image?: string;
  status: 'pending' | 'approved' | 'rejected';
  submission_date: string;
  created_at: string;
  updated_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  review_notes?: string;
}

const Expenses = () => {
  const { addExpense } = useExpenseStore();
  const { currentDriver } = useOrderStore();
  const [selectedType, setSelectedType] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [receiptUri, setReceiptUri] = useState<string | undefined>(undefined);
  const [receiptBase64, setReceiptBase64] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [openTypeModal, setOpenTypeModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expenseHistory, setExpenseHistory] = useState<ServerExpense[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');

  const formattedAmount = useMemo(() => amount.replace(/[^0-9.]/g, ''), [amount]);

  // Convert image to base64
  const convertImageToBase64 = async (uri: string): Promise<string> => {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return `data:image/jpeg;base64,${base64}`;
    } catch (error) {
      console.error('Error converting image to base64:', error);
      throw new Error('Failed to process image');
    }
  };

  // Fetch expense history from server
  const fetchExpenseHistory = useCallback(async (status?: string) => {
    if (!currentDriver?.id) {
      Alert.alert('Error', 'Driver information not available.');
      return;
    }

    try {
      setLoadingHistory(true);
      let url = `${IP_ADDRESS}/expenses`;
      url += `?driver_id=${currentDriver.id}`;
      if (status) {
        url += `&status=${status}`;
      }

      console.log('Fetching expense history from:', url);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data: ServerExpense[] = await response.json();
      console.log('Expense history fetched:', data.length, 'items');
      setExpenseHistory(data);
    } catch (error) {
      console.error('Error fetching expense history:', error);
      Alert.alert('Error', 'Failed to load expense history.');
    } finally {
      setLoadingHistory(false);
    }
  }, [currentDriver?.id]);

  // Load expense history when component mounts or tab changes
  useEffect(() => {
    if (showHistory) {
      const status = activeTab === 'pending' ? 'pending' : undefined;
      fetchExpenseHistory(status);
    }
  }, [showHistory, activeTab, fetchExpenseHistory]);

  const pickReceipt = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'We need access to your photos to upload a receipt.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7, // Reduced quality for smaller base64 size
        base64: false, // We'll convert manually for better control
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const imageUri = result.assets[0].uri;
        setReceiptUri(imageUri);
        
        // Convert to base64
        try {
          const base64String = await convertImageToBase64(imageUri);
          setReceiptBase64(base64String);
          console.log('Image converted to base64 successfully');
        } catch (error) {
          console.error('Error converting image to base64:', error);
          Alert.alert('Error', 'Failed to process the selected image. Please try again.');
          setReceiptUri(undefined);
        }
      }
    } catch (e) {
      Alert.alert('Error', 'Could not open image library.');
    }
  };

  const resetForm = () => {
    setSelectedType('');
    setAmount('');
    setDescription('');
    setReceiptUri(undefined);
    setReceiptBase64(undefined);
  };

  const handleSubmit = async () => {
    const numericAmount = Number(formattedAmount);
    if (!selectedType) {
      Alert.alert('Missing info', 'Please select an expense type.');
      return;
    }
    if (!formattedAmount || isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    if (!currentDriver?.id) {
      Alert.alert('Error', 'Driver information not available.');
      return;
    }

    try {
      setSubmitting(true);
      
      // Prepare expense data for server
      const expenseData = {
        driver_id: currentDriver.id,
        type: selectedType,
        amount: numericAmount,
        description: description?.trim() || undefined,
        receipt_image: receiptBase64 || undefined,
        submission_date: new Date().toISOString()
      };

      // Submit to server
      let url = `${IP_ADDRESS}/expenses/submit`;
      url += `?driver_id=${currentDriver.id}`;
      console.log('Submitting expense to:', url);
      console.log('Expense data:', { ...expenseData, receipt_image: receiptBase64 ? 'base64...' : 'none' });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(expenseData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
      }

      const result: SubmitExpenseResponse = await response.json();
      console.log('Expense submitted successfully:', result);

      if (!result.success) {
        throw new Error(result.message || 'Failed to submit expense');
      }

      // Also add to local store for immediate UI update
      addExpense({ 
        type: selectedType, 
        amount: numericAmount, 
        description: description?.trim() || undefined, 
        receiptUri: receiptBase64 || receiptUri // Use base64 if available, fallback to URI
      });

      Alert.alert(
        'Success!', 
        result.message || `Expense submitted successfully!\nRequest ID: ${result.expense.request_id}`,
        [
          { text: 'OK', onPress: () => resetForm() }
        ]
      );
    } catch (error) {
      console.error('Error submitting expense:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Could not submit expense.');
    } finally {
      setSubmitting(false);
    }
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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: '#111827', fontSize: 20, fontWeight: '600' }}>
              Submit Expense
            </Text>
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
            onPress={() => setShowHistory(true)}
          >
            <Ionicons name="time-outline" size={18} color="#6B7280" style={{ marginRight: 6 }} />
            <Text style={{ 
              color: '#6B7280', 
              fontSize: 14, 
              fontWeight: '500'
            }}>
              History
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <ScrollView 
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }} 
        showsVerticalScrollIndicator={false}
      >
        {/* Expense Type */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ color: '#111827', fontSize: 14, fontWeight: '500', marginBottom: 8 }}>
              Expense Type
            </Text>
          <TouchableOpacity
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 10,
              padding: 14,
              borderWidth: 1,
              borderColor: '#E5E7EB',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
            onPress={() => setOpenTypeModal(true)}
            activeOpacity={0.7}
          >
            <Text style={{ 
              color: selectedType ? '#111827' : '#9CA3AF', 
              fontSize: 15, 
              fontWeight: '400' 
            }}>
              {selectedType || 'Select type'}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Amount */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ color: '#111827', fontSize: 14, fontWeight: '500', marginBottom: 8 }}>
              Amount
            </Text>
          <View style={{
            backgroundColor: '#F9FAFB',
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 14,
            borderWidth: 1,
            borderColor: '#E5E7EB',
            flexDirection: 'row',
            alignItems: 'center'
          }}>
            <Text style={{ color: '#6B7280', fontSize: 15, fontWeight: '500', marginRight: 10 }}>
              AED
            </Text>
            <TextInput
              style={{ 
                flex: 1, 
                fontSize: 15, 
                color: '#111827',
                fontWeight: '400'
              }}
              placeholder="0.00"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
              value={formattedAmount}
              onChangeText={setAmount}
            />
          </View>
        </View>

        {/* Description */}
        <View style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ color: '#111827', fontSize: 14, fontWeight: '500' }}>
              Description
            </Text>
            <Text style={{ color: '#9CA3AF', fontSize: 12, marginLeft: 6 }}>
              Optional
            </Text>
          </View>
          <TextInput
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 10,
              padding: 14,
              borderWidth: 1,
              borderColor: '#E5E7EB',
              fontSize: 15,
              color: '#111827',
              minHeight: 90,
              textAlignVertical: 'top'
            }}
            placeholder="Add details..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={4}
            value={description}
            onChangeText={setDescription}
          />
        </View>

        {/* Receipt */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ color: '#111827', fontSize: 14, fontWeight: '500' }}>
              Receipt
            </Text>
            <Text style={{ color: '#9CA3AF', fontSize: 12, marginLeft: 6 }}>
              Optional
            </Text>
          </View>
          
          {receiptUri ? (
            <View>
              <Image 
                source={{ uri: receiptUri }} 
                style={{ 
                  width: '100%', 
                  height: 160, 
                  borderRadius: 10,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: '#E5E7EB'
                }} 
                resizeMode="cover"
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity 
                  style={{ 
                    flex: 1, 
                    backgroundColor: '#F9FAFB', 
                    borderRadius: 10, 
                    paddingVertical: 12,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: '#E5E7EB'
                  }} 
                  onPress={() => {
                    setReceiptUri(undefined);
                    setReceiptBase64(undefined);
                  }}
                >
                  <Text style={{ color: '#6B7280', fontSize: 14, fontWeight: '500' }}>
                    Remove
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ 
                    flex: 1, 
                    backgroundColor: '#111827', 
                    borderRadius: 10, 
                    paddingVertical: 12,
                    alignItems: 'center',
                  }} 
                  onPress={pickReceipt}
                >
                  <Text style={{ color: 'white', fontSize: 14, fontWeight: '500' }}>
                    Replace
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity 
              style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#E5E7EB',
                borderStyle: 'dashed',
                paddingVertical: 28,
                alignItems: 'center',
                justifyContent: 'center'
              }} 
              onPress={pickReceipt}
            >
              <Ionicons name="camera-outline" size={24} color="#9CA3AF" />
              <Text style={{ color: '#6B7280', fontSize: 14, fontWeight: '400', marginTop: 8 }}>
                Tap to upload
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Action Buttons - Minimal */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            style={{ 
              flex: 1, 
              backgroundColor: '#F9FAFB', 
              borderRadius: 10, 
              paddingVertical: 14,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#E5E7EB'
            }}
            onPress={resetForm}
            disabled={submitting}
          >
            <Text style={{ color: '#6B7280', fontSize: 15, fontWeight: '500' }}>
              Cancel
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ 
              flex: 1, 
              backgroundColor: selectedType && formattedAmount && !submitting ? '#111827' : '#D1D5DB', 
              borderRadius: 10, 
              paddingVertical: 14,
              alignItems: 'center',
            }}
            onPress={handleSubmit}
            disabled={!selectedType || !formattedAmount || submitting}
          >
            {submitting ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator size="small" color="white" style={{ marginRight: 8 }} />
                <Text style={{ color: 'white', fontSize: 15, fontWeight: '500' }}>
                  Submitting...
                </Text>
              </View>
            ) : (
              <Text style={{ color: 'white', fontSize: 15, fontWeight: '500' }}>
                Submit
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Expense Type Modal */}
      <Modal visible={openTypeModal} transparent animationType="fade" onRequestClose={() => setOpenTypeModal(false)}>
        <TouchableOpacity
          style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0, 0, 0, 0.4)', 
          alignItems: 'center', 
          justifyContent: 'flex-end' 
          }}
          activeOpacity={1}
          onPress={() => setOpenTypeModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={{ 
            backgroundColor: 'white', 
            width: '100%', 
            borderTopLeftRadius: 16, 
            borderTopRightRadius: 16, 
            padding: 16, 
            maxHeight: '60%' 
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827' }}>
                Select Type
              </Text>
              <TouchableOpacity onPress={() => setOpenTypeModal(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {EXPENSE_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={{
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: '#F3F4F6',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                  onPress={() => {
                    setSelectedType(type);
                    setOpenTypeModal(false);
                  }}
                >
                  <Text style={{ 
                    fontSize: 15, 
                    color: selectedType === type ? '#111827' : '#6B7280',
                    fontWeight: selectedType === type ? '600' : '400'
                  }}>
                    {type}
                  </Text>
                  {selectedType === type && (
                    <Ionicons name="checkmark" size={18} color="#111827" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Expense History Modal */}
      <Modal visible={showHistory} transparent animationType="slide" onRequestClose={() => setShowHistory(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)' }}>
          <View style={{ 
            flex: 1, 
            backgroundColor: 'white', 
            marginTop: 60, 
            borderTopLeftRadius: 16, 
            borderTopRightRadius: 16 
          }}>
            {/* Header */}
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              padding: 16, 
              borderBottomWidth: 1, 
              borderBottomColor: '#F3F4F6' 
            }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827' }}>
                Expense History
              </Text>
              <TouchableOpacity onPress={() => setShowHistory(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={{ 
              flexDirection: 'row', 
              backgroundColor: '#F9FAFB', 
              margin: 16, 
              borderRadius: 8, 
              padding: 2 
            }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 6,
                  backgroundColor: activeTab === 'pending' ? 'white' : 'transparent',
                }}
                onPress={() => setActiveTab('pending')}
              >
                <Text style={{ 
                  textAlign: 'center', 
                  fontSize: 14, 
                  fontWeight: '500',
                  color: activeTab === 'pending' ? '#111827' : '#6B7280'
                }}>
                  Pending
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 6,
                  backgroundColor: activeTab === 'all' ? 'white' : 'transparent',
                }}
                onPress={() => setActiveTab('all')}
              >
                <Text style={{ 
                  textAlign: 'center', 
                  fontSize: 14, 
                  fontWeight: '500',
                  color: activeTab === 'all' ? '#111827' : '#6B7280'
                }}>
                  All
                </Text>
              </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView 
              style={{ flex: 1, paddingHorizontal: 16 }}
              contentContainerStyle={{ paddingBottom: 100 }}
            >
              {loadingHistory ? (
                <View style={{ 
                  flex: 1, 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  paddingVertical: 60 
                  }}>
                  <ActivityIndicator size="large" color="#6B7280" />
                  <Text style={{ color: '#9CA3AF', fontSize: 14, marginTop: 16 }}>
                    Loading...
                    </Text>
                </View>
              ) : expenseHistory.length === 0 ? (
                <View style={{ 
                  flex: 1, 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  paddingVertical: 60 
                  }}>
                  <Ionicons name="receipt-outline" size={32} color="#D1D5DB" />
                  <Text style={{ color: '#6B7280', fontSize: 15, fontWeight: '500', marginTop: 12, textAlign: 'center' }}>
                    {activeTab === 'pending' ? 'No pending expenses' : 'No expenses found'}
                    </Text>
                </View>
              ) : (
                expenseHistory.map((expense) => (
                  <View key={expense.id} style={{ 
                    backgroundColor: '#FFFFFF', 
                    borderRadius: 10, 
                    padding: 14, 
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: '#F3F4F6'
                  }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#111827', fontSize: 15, fontWeight: '500', marginBottom: 4 }}>
                          {expense.type}
                        </Text>
                        <Text style={{ color: '#9CA3AF', fontSize: 11 }}>
                          {expense.request_id}
                        </Text>
                      </View>
                      <View style={{
                        backgroundColor: expense.status === 'pending' ? '#FEF3C7' : 
                                        expense.status === 'approved' ? '#D1FAE5' : '#FEE2E2',
                        borderRadius: 8,
                        paddingHorizontal: 8,
                        paddingVertical: 4
                      }}>
                        <Text style={{ 
                          fontSize: 10, 
                          fontWeight: '600',
                          color: expense.status === 'pending' ? '#92400E' : 
                                 expense.status === 'approved' ? '#065F46' : '#991B1B'
                        }}>
                          {expense.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ color: '#111827', fontSize: 16, fontWeight: '600' }}>
                        AED {expense.amount.toFixed(2)}
                      </Text>
                      <Text style={{ color: '#9CA3AF', fontSize: 12 }}>
                        {new Date(expense.created_at).toLocaleDateString()}
                      </Text>
                    </View>

                    {expense.description && (
                      <View style={{ marginBottom: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
                        <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 4 }}>
                          {expense.description}
                        </Text>
                      </View>
                    )}

                    {expense.review_notes && (
                      <View style={{ 
                        backgroundColor: '#F9FAFB', 
                        borderRadius: 6, 
                        padding: 10, 
                        marginTop: 8,
                        borderWidth: 1,
                        borderColor: '#E5E7EB'
                      }}>
                        <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '500', marginBottom: 4 }}>
                          Review Notes
                        </Text>
                        <Text style={{ color: '#374151', fontSize: 12, lineHeight: 18 }}>
                          {expense.review_notes}
                        </Text>
                      </View>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default Expenses;


