import { useExpenseStore, useOrderStore } from '@/store/index';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { 
  Alert, 
  Image, 
  Modal, 
  ScrollView, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  View, 
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Platform,
  Pressable,
  KeyboardAvoidingView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

const EXPENSE_TYPES = [
  { id: 'fuel', label: 'Fuel', icon: 'flame-outline' as const },
  { id: 'parking', label: 'Parking', icon: 'car-outline' as const },
  { id: 'toll', label: 'Toll', icon: 'card-outline' as const },
  { id: 'maintenance', label: 'Maintenance', icon: 'construct-outline' as const },
  { id: 'supplies', label: 'Supplies', icon: 'cube-outline' as const },
  { id: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' as const },
];

const IP_ADDRESS = process.env.EXPO_PUBLIC_IP_ADDRESS || 'http://localhost:3000/api';

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
  const insets = useSafeAreaInsets();
  const { addExpense } = useExpenseStore();
  const { currentDriver } = useOrderStore();
  const [selectedType, setSelectedType] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [receiptUri, setReceiptUri] = useState<string | undefined>(undefined);
  const [receiptBase64, setReceiptBase64] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expenseHistory, setExpenseHistory] = useState<ServerExpense[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');

  const formattedAmount = useMemo(() => amount.replace(/[^0-9.]/g, ''), [amount]);
  const isFormValid = selectedType && formattedAmount && Number(formattedAmount) > 0;

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

  const fetchExpenseHistory = useCallback(async (status?: string) => {
    if (!currentDriver?.id) {
      Alert.alert('Error', 'Driver information not available.');
      return;
    }

    try {
      setLoadingHistory(true);
      let url = `${IP_ADDRESS}/expenses?driver_id=${currentDriver.id}`;
      if (status) url += `&status=${status}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

      const data: ServerExpense[] = await response.json();
      setExpenseHistory(data);
    } catch (error) {
      console.error('Error fetching expense history:', error);
      Alert.alert('Error', 'Failed to load expense history.');
    } finally {
      setLoadingHistory(false);
    }
  }, [currentDriver?.id]);

  useEffect(() => {
    if (showHistory) {
      fetchExpenseHistory(activeTab === 'pending' ? 'pending' : undefined);
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
        quality: 0.7,
        base64: false,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const imageUri = result.assets[0].uri;
        setReceiptUri(imageUri);
        try {
          const base64String = await convertImageToBase64(imageUri);
          setReceiptBase64(base64String);
        } catch {
          Alert.alert('Error', 'Failed to process the selected image.');
          setReceiptUri(undefined);
        }
      }
    } catch {
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
      
      const expenseData = {
        driver_id: currentDriver.id,
        type: selectedType,
        amount: numericAmount,
        description: description?.trim() || undefined,
        receipt_image: receiptBase64 || undefined,
        submission_date: new Date().toISOString()
      };

      const url = `${IP_ADDRESS}/expenses/submit?driver_id=${currentDriver.id}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expenseData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
      }

      const result: SubmitExpenseResponse = await response.json();
      if (!result.success) throw new Error(result.message || 'Failed to submit expense');

      addExpense({ 
        type: selectedType, 
        amount: numericAmount, 
        description: description?.trim() || undefined, 
        receiptUri: receiptBase64 || receiptUri
      });

      Alert.alert('Success', 'Expense submitted successfully!', [
        { text: 'OK', onPress: resetForm }
      ]);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Could not submit expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'approved': return { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' };
      case 'rejected': return { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' };
      default: return { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' };
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Expenses</Text>
          <Text style={styles.headerSubtitle}>Submit reimbursement requests</Text>
          </View>
        <TouchableOpacity style={styles.historyButton} onPress={() => setShowHistory(true)}>
          <Ionicons name="time-outline" size={20} color="#0F172A" />
          </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView 
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
      >
          {/* Expense Type Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Type</Text>
            <View style={styles.typeGrid}>
              {EXPENSE_TYPES.map((type) => (
          <TouchableOpacity
                  key={type.id}
                  style={[
                    styles.typeCard,
                    selectedType === type.label && styles.typeCardSelected
                  ]}
                  onPress={() => setSelectedType(type.label)}
                  activeOpacity={0.7}
          >
                  <View style={[
                    styles.typeIcon,
                    selectedType === type.label && styles.typeIconSelected
                  ]}>
                    <Ionicons 
                      name={type.icon} 
                      size={20} 
                      color={selectedType === type.label ? '#FFFFFF' : '#64748B'} 
                    />
                  </View>
                  <Text style={[
                    styles.typeLabel,
                    selectedType === type.label && styles.typeLabelSelected
                  ]}>
                    {type.label}
            </Text>
          </TouchableOpacity>
              ))}
        </View>
          </View>
          
          {/* Amount Input */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Amount</Text>
            <View style={styles.amountContainer}>
              <Text style={styles.currency}>AED</Text>
            <TextInput
                style={styles.amountInput}
              placeholder="0.00"
                placeholderTextColor="#CBD5E1"
              keyboardType="decimal-pad"
              value={formattedAmount}
              onChangeText={setAmount}
            />
          </View>
        </View>

          {/* Receipt Upload */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Receipt <Text style={styles.optional}>(optional)</Text></Text>
          {receiptUri ? (
              <View style={styles.receiptPreview}>
                <Image source={{ uri: receiptUri }} style={styles.receiptImage} />
                <TouchableOpacity 
                  style={styles.removeReceipt}
                  onPress={() => { setReceiptUri(undefined); setReceiptBase64(undefined); }}
                >
                  <Ionicons name="close" size={16} color="#FFFFFF" />
                </TouchableOpacity>
            </View>
          ) : (
              <TouchableOpacity style={styles.uploadButton} onPress={pickReceipt}>
                <Ionicons name="cloud-upload-outline" size={24} color="#94A3B8" />
                <Text style={styles.uploadText}>Upload receipt</Text>
            </TouchableOpacity>
          )}
        </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Note <Text style={styles.optional}>(optional)</Text></Text>
            <TextInput
              style={styles.descriptionInput}
              placeholder="Add a note..."
              placeholderTextColor="#CBD5E1"
              multiline
              numberOfLines={3}
              value={description}
              onChangeText={setDescription}
              textAlignVertical="top"
            />
          </View>

          {/* Submit Button */}
          <View style={styles.actionSection}>
          <TouchableOpacity
              style={[styles.submitButton, !isFormValid && styles.submitButtonDisabled]}
            onPress={handleSubmit}
              disabled={!isFormValid || submitting}
              activeOpacity={0.8}
          >
            {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="paper-plane-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.submitText}>Submit Expense</Text>
                </>
            )}
          </TouchableOpacity>
        </View>

          <View style={{ height: Math.max(insets.bottom, 16) + 80 }} />
      </ScrollView>
      </KeyboardAvoidingView>

      {/* History Modal */}
      <Modal visible={showHistory} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { paddingTop: Platform.OS === 'ios' ? 20 : insets.top }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>History</Text>
              <Text style={styles.modalSubtitle}>{expenseHistory.length} requests</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowHistory(false)}>
              <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Tabs */}
          <View style={styles.tabContainer}>
              <TouchableOpacity
              style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
                onPress={() => setActiveTab('pending')}
              >
              <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
                  Pending
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
              style={[styles.tab, activeTab === 'all' && styles.tabActive]}
                onPress={() => setActiveTab('all')}
              >
              <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
                All
                </Text>
              </TouchableOpacity>
            </View>

          <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false}>
              {loadingHistory ? (
              <View style={styles.emptyState}>
                <ActivityIndicator size="large" color="#0F172A" />
                </View>
              ) : expenseHistory.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="receipt-outline" size={32} color="#CBD5E1" />
                  </View>
                <Text style={styles.emptyTitle}>No expenses yet</Text>
                <Text style={styles.emptySubtitle}>Your submitted expenses will appear here</Text>
                </View>
              ) : (
              expenseHistory.map((expense) => {
                const statusStyle = getStatusStyle(expense.status);
                return (
                  <View key={expense.id} style={styles.historyCard}>
                    <View style={styles.historyCardHeader}>
                      <View style={styles.historyType}>
                        <Text style={styles.historyTypeText}>{expense.type}</Text>
                        <Text style={styles.historyDate}>
                          {new Date(expense.created_at).toLocaleDateString('en-US', { 
                            month: 'short', day: 'numeric' 
                          })}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
                        <Text style={[styles.statusText, { color: statusStyle.text }]}>
                          {expense.status}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.historyAmount}>AED {expense.amount.toFixed(2)}</Text>
                    {expense.description && (
                      <Text style={styles.historyDescription} numberOfLines={2}>
                          {expense.description}
                      </Text>
                    )}
                  </View>
                );
              })
              )}
            <View style={{ height: 40 }} />
            </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 2,
  },
  historyButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  section: {
    marginBottom: 28,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  optional: {
    fontWeight: '400',
    textTransform: 'none',
    color: '#94A3B8',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  typeCard: {
    width: (width - 48 - 24) / 3,
    marginHorizontal: 6,
    marginBottom: 12,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeCardSelected: {
    backgroundColor: '#F0F9FF',
    borderColor: '#0EA5E9',
  },
  typeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeIconSelected: {
    backgroundColor: '#0EA5E9',
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  typeLabelSelected: {
    color: '#0369A1',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 20,
    height: 64,
  },
  currency: {
    fontSize: 18,
    fontWeight: '600',
    color: '#94A3B8',
    marginRight: 12,
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -1,
  },
  uploadButton: {
    height: 120,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  uploadText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94A3B8',
  },
  receiptPreview: {
    position: 'relative',
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
  },
  receiptImage: {
    width: '100%',
    height: '100%',
  },
  removeReceipt: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  descriptionInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: '#0F172A',
    minHeight: 88,
  },
  actionSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    height: 56,
    borderRadius: 16,
    gap: 10,
  },
  submitButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
  submitText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
  },
  modalTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 2,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 24,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#0F172A',
  },
  historyList: {
    flex: 1,
    paddingHorizontal: 24,
  },
  historyCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  historyType: {
    flex: 1,
  },
  historyTypeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  historyDate: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  historyAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  historyDescription: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 8,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#94A3B8',
  },
});

export default Expenses;
