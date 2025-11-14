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

const IP_ADDRESS = "192.168.0.194:3000/api";

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
      let url = `http://${IP_ADDRESS}/expenses`;
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
      let url = `http://${IP_ADDRESS}/expenses/submit`;
      url += `?driver_id=+${currentDriver.id}`;
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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: 'white', fontSize: 20, fontWeight: 'bold' }}>
              Submit Expense
            </Text>
            <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 14, marginTop: 2 }}>
              Track your work-related expenses
            </Text>
          </View>
          
          {/* Top Right History Button */}
          <TouchableOpacity
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.3)',
              flexDirection: 'row',
              alignItems: 'center'
            }}
            onPress={() => setShowHistory(true)}
          >
            <Ionicons name="time" size={16} color="white" style={{ marginRight: 6 }} />
            <Text style={{ 
              color: 'white', 
              fontSize: 14, 
              fontWeight: '600'
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
        {/* Expense Type Card */}
        <View style={{ 
          backgroundColor: 'white', 
          borderRadius: 16, 
          padding: 20, 
          marginBottom: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
          elevation: 3
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ 
              width: 4, 
              height: 24, 
              backgroundColor: '#3B82F6', 
              borderRadius: 2, 
              marginRight: 12 
            }} />
            <Text style={{ color: '#111827', fontSize: 18, fontWeight: '600' }}>
              Expense Type
            </Text>
          </View>
          
          <TouchableOpacity
            style={{
              backgroundColor: '#F8FAFC',
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: '#E2E8F0',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
            onPress={() => setOpenTypeModal(true)}
            activeOpacity={0.8}
          >
            <Text style={{ 
              color: selectedType ? '#111827' : '#64748B', 
              fontSize: 16, 
              fontWeight: '500' 
            }}>
              {selectedType || 'Choose expense type'}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* Amount Card */}
        <View style={{ 
          backgroundColor: 'white', 
          borderRadius: 16, 
          padding: 20, 
          marginBottom: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
          elevation: 3
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ 
              width: 4, 
              height: 24, 
              backgroundColor: '#F59E0B', 
              borderRadius: 2, 
              marginRight: 12 
            }} />
            <Text style={{ color: '#111827', fontSize: 18, fontWeight: '600' }}>
              Amount
            </Text>
          </View>
          
          <View style={{
            backgroundColor: '#F8FAFC',
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderWidth: 1,
            borderColor: '#E2E8F0',
            flexDirection: 'row',
            alignItems: 'center'
          }}>
            <Text style={{ color: '#64748B', fontSize: 16, fontWeight: '600', marginRight: 12 }}>
              AED
            </Text>
            <TextInput
              style={{ 
                flex: 1, 
                fontSize: 16, 
                color: '#111827',
                fontWeight: '500'
              }}
              placeholder="0.00"
              placeholderTextColor="#94A3B8"
              keyboardType="decimal-pad"
              value={formattedAmount}
              onChangeText={setAmount}
            />
          </View>
        </View>

        {/* Description Card */}
        <View style={{ 
          backgroundColor: 'white', 
          borderRadius: 16, 
          padding: 20, 
          marginBottom: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
          elevation: 3
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ 
              width: 4, 
              height: 24, 
              backgroundColor: '#8B5CF6', 
              borderRadius: 2, 
              marginRight: 12 
            }} />
            <Text style={{ color: '#111827', fontSize: 18, fontWeight: '600' }}>
              Description
            </Text>
            <Text style={{ color: '#94A3B8', fontSize: 14, marginLeft: 8 }}>
              (Optional)
            </Text>
          </View>
          
          <TextInput
            style={{
              backgroundColor: '#F8FAFC',
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: '#E2E8F0',
              fontSize: 16,
              color: '#111827',
              minHeight: 100,
              textAlignVertical: 'top'
            }}
            placeholder="Add any additional details..."
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={4}
            value={description}
            onChangeText={setDescription}
          />
        </View>

        {/* Receipt Card */}
        <View style={{ 
          backgroundColor: 'white', 
          borderRadius: 16, 
          padding: 20, 
          marginBottom: 20,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
          elevation: 3
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ 
              width: 4, 
              height: 24, 
              backgroundColor: '#10B981', 
              borderRadius: 2, 
              marginRight: 12 
            }} />
            <Text style={{ color: '#111827', fontSize: 18, fontWeight: '600' }}>
              Receipt Photo
            </Text>
            <Text style={{ color: '#94A3B8', fontSize: 14, marginLeft: 8 }}>
              (Optional)
            </Text>
          </View>
          
          {receiptUri ? (
            <View>
              <Image 
                source={{ uri: receiptUri }} 
                style={{ 
                  width: '100%', 
                  height: 180, 
                  borderRadius: 12,
                  marginBottom: 16
                }} 
                resizeMode="cover"
              />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity 
                  style={{ 
                    flex: 1, 
                    backgroundColor: '#F1F5F9', 
                    borderRadius: 12, 
                    paddingVertical: 14,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: '#E2E8F0'
                  }} 
                  onPress={() => {
                    setReceiptUri(undefined);
                    setReceiptBase64(undefined);
                  }}
                >
                  <Text style={{ color: '#64748B', fontSize: 16, fontWeight: '600' }}>
                    Remove
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ 
                    flex: 1, 
                    backgroundColor: '#10B981', 
                    borderRadius: 12, 
                    paddingVertical: 14,
                    alignItems: 'center',
                    shadowColor: '#10B981',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.2,
                    shadowRadius: 4,
                    elevation: 4
                  }} 
                  onPress={pickReceipt}
                >
                  <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                    Replace
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity 
              style={{
                backgroundColor: '#F8FAFC',
                borderRadius: 12,
                borderWidth: 2,
                borderColor: '#E2E8F0',
                borderStyle: 'dashed',
                paddingVertical: 32,
                alignItems: 'center',
                justifyContent: 'center'
              }} 
              onPress={pickReceipt}
            >
              <Ionicons name="camera" size={32} color="#94A3B8" />
              <Text style={{ color: '#64748B', fontSize: 16, fontWeight: '500', marginTop: 8 }}>
                Tap to upload receipt
              </Text>
              <Text style={{ color: '#94A3B8', fontSize: 14, marginTop: 4 }}>
                JPG, PNG supported
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Action Buttons */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity
            style={{ 
              flex: 1, 
              backgroundColor: '#F1F5F9', 
              borderRadius: 16, 
              paddingVertical: 16,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#E2E8F0'
            }}
            onPress={resetForm}
            disabled={submitting}
          >
            <Text style={{ color: '#64748B', fontSize: 16, fontWeight: '600' }}>
              Cancel
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ 
              flex: 1, 
              backgroundColor: selectedType && formattedAmount && !submitting ? '#10B981' : '#94A3B8', 
              borderRadius: 16, 
              paddingVertical: 16,
              alignItems: 'center',
              shadowColor: selectedType && formattedAmount && !submitting ? '#10B981' : 'transparent',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: selectedType && formattedAmount && !submitting ? 0.3 : 0,
              shadowRadius: 8,
              elevation: selectedType && formattedAmount && !submitting ? 6 : 0
            }}
            onPress={handleSubmit}
            disabled={!selectedType || !formattedAmount || submitting}
          >
            {submitting ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator size="small" color="white" style={{ marginRight: 8 }} />
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                  Submitting...
                </Text>
              </View>
            ) : (
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                Submit Expense
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Expense Type Modal */}
      <Modal visible={openTypeModal} transparent animationType="fade" onRequestClose={() => setOpenTypeModal(false)}>
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
            maxHeight: '60%' 
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827' }}>
                Select Expense Type
              </Text>
              <TouchableOpacity onPress={() => setOpenTypeModal(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
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
                    color: selectedType === type ? '#10B981' : '#111827',
                    fontWeight: selectedType === type ? '600' : '400'
                  }}>
                    {type}
                  </Text>
                  {selectedType === type && (
                    <Ionicons name="checkmark" size={18} color="#10B981" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Expense History Modal */}
      <Modal visible={showHistory} transparent animationType="slide" onRequestClose={() => setShowHistory(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)' }}>
          <View style={{ 
            flex: 1, 
            backgroundColor: 'white', 
            marginTop: 60, 
            borderTopLeftRadius: 20, 
            borderTopRightRadius: 20 
          }}>
            {/* Header */}
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              padding: 16, 
              borderBottomWidth: 1, 
              borderBottomColor: '#E5E7EB' 
            }}>
              <Text style={{ fontSize: 20, fontWeight: '600', color: '#111827' }}>
                Expense History
              </Text>
              <TouchableOpacity onPress={() => setShowHistory(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={{ 
              flexDirection: 'row', 
              backgroundColor: '#F3F4F6', 
              margin: 16, 
              borderRadius: 10, 
              padding: 3 
            }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 7,
                  backgroundColor: activeTab === 'pending' ? 'white' : 'transparent',
                  shadowColor: activeTab === 'pending' ? '#000' : 'transparent',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: activeTab === 'pending' ? 0.1 : 0,
                  shadowRadius: 2,
                  elevation: activeTab === 'pending' ? 1 : 0
                }}
                onPress={() => setActiveTab('pending')}
              >
                <Text style={{ 
                  textAlign: 'center', 
                  fontSize: 14, 
                  fontWeight: '600',
                  color: activeTab === 'pending' ? '#10B981' : '#6B7280'
                }}>
                  Pending
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 7,
                  backgroundColor: activeTab === 'all' ? 'white' : 'transparent',
                  shadowColor: activeTab === 'all' ? '#000' : 'transparent',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: activeTab === 'all' ? 0.1 : 0,
                  shadowRadius: 2,
                  elevation: activeTab === 'all' ? 1 : 0
                }}
                onPress={() => setActiveTab('all')}
              >
                <Text style={{ 
                  textAlign: 'center', 
                  fontSize: 14, 
                  fontWeight: '600',
                  color: activeTab === 'all' ? '#10B981' : '#6B7280'
                }}>
                  All Requests
                </Text>
              </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
              {loadingHistory ? (
                <View style={{ 
                  flex: 1, 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  paddingVertical: 40 
                }}>
                  <View style={{
                    backgroundColor: 'white',
                    borderRadius: 16,
                    padding: 24,
                    alignItems: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 4
                  }}>
                    <ActivityIndicator size="large" color="#10B981" />
                    <Text style={{ color: '#6B7280', fontSize: 14, marginTop: 12, fontWeight: '500' }}>
                      Loading expenses...
                    </Text>
                  </View>
                </View>
              ) : expenseHistory.length === 0 ? (
                <View style={{ 
                  flex: 1, 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  paddingVertical: 40 
                }}>
                  <View style={{
                    backgroundColor: 'white',
                    borderRadius: 16,
                    padding: 24,
                    alignItems: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 4
                  }}>
                    <Ionicons name="receipt" size={40} color="#9CA3AF" />
                    <Text style={{ color: '#6B7280', fontSize: 16, fontWeight: '600', marginTop: 12, textAlign: 'center' }}>
                      {activeTab === 'pending' ? 'No pending expenses' : 'No expense requests found'}
                    </Text>
                    <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 6, textAlign: 'center' }}>
                      Your submitted expenses will appear here
                    </Text>
                  </View>
                </View>
              ) : (
                expenseHistory.map((expense) => (
                  <View key={expense.id} style={{ 
                    backgroundColor: 'white', 
                    borderRadius: 12, 
                    padding: 16, 
                    marginBottom: 12,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.05,
                    shadowRadius: 2,
                    elevation: 2
                  }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#111827', fontSize: 16, fontWeight: '600', marginBottom: 2 }}>
                          {expense.type}
                        </Text>
                        <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600' }}>
                          ID: {expense.request_id}
                        </Text>
                      </View>
                      <View style={{
                        backgroundColor: expense.status === 'pending' ? '#FEF3C7' : 
                                        expense.status === 'approved' ? '#F0FDF4' : '#FEF2F2',
                        borderWidth: 1,
                        borderColor: expense.status === 'pending' ? '#F59E0B' : 
                                     expense.status === 'approved' ? '#10B981' : '#EF4444',
                        borderRadius: 12,
                        paddingHorizontal: 8,
                        paddingVertical: 4
                      }}>
                        <Text style={{ 
                          fontSize: 10, 
                          fontWeight: '600',
                          color: expense.status === 'pending' ? '#D97706' : 
                                 expense.status === 'approved' ? '#10B981' : '#EF4444'
                        }}>
                          {expense.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ color: '#10B981', fontSize: 18, fontWeight: '600' }}>
                        AED {expense.amount.toFixed(2)}
                      </Text>
                      <Text style={{ color: '#6B7280', fontSize: 11 }}>
                        {new Date(expense.created_at).toLocaleDateString()}
                      </Text>
                    </View>

                    {expense.description && (
                      <View style={{ marginBottom: 8 }}>
                        <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600', marginBottom: 2 }}>
                          DESCRIPTION
                        </Text>
                        <Text style={{ color: '#374151', fontSize: 13, lineHeight: 18 }}>
                          {expense.description}
                        </Text>
                      </View>
                    )}

                    {expense.review_notes && (
                      <View style={{ 
                        backgroundColor: '#EFF6FF', 
                        borderRadius: 6, 
                        padding: 8, 
                        marginBottom: 8,
                        borderWidth: 1,
                        borderColor: '#DBEAFE'
                      }}>
                        <Text style={{ color: '#1E40AF', fontSize: 11, fontWeight: '600', marginBottom: 2 }}>
                          REVIEW NOTES
                        </Text>
                        <Text style={{ color: '#1E3A8A', fontSize: 13, lineHeight: 18 }}>
                          {expense.review_notes}
                        </Text>
                      </View>
                    )}

                    {expense.reviewed_at && (
                      <Text style={{ color: '#6B7280', fontSize: 11 }}>
                        Reviewed: {new Date(expense.reviewed_at).toLocaleDateString()}
                      </Text>
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


