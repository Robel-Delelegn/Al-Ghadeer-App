import { useOrderStore } from '@/store/index';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState, useCallback } from 'react';
import { 
  Alert, 
  ScrollView, 
  Text, 
  TouchableOpacity, 
  View, 
  ActivityIndicator, 
  RefreshControl,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const API_BASE_URL = process.env.EXPO_PUBLIC_IP_ADDRESS || 'http://localhost:3000/api';

interface Item {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
}

interface ItemsResponse {
  success: boolean;
  message: string;
  data: Item[];
}

interface ConfirmationResponse {
  success: boolean;
  message: string;
  agreement?: {
    status: 'agreed' | 'disagreed';
    notes?: string;
  };
}

const LoadedItems = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentDriver } = useOrderStore();
  
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);
  const [step, setStep] = useState<'request' | 'review' | 'done'>('request');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  const fetchItems = useCallback(async () => {
    if (!currentDriver) {
      Alert.alert('Error', 'Driver information not found.');
      return;
    }

    setIsLoading(true);
    
    try {
      const endpoint = `${API_BASE_URL}/drivers/${currentDriver.id}/loaded-items/request`;
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      const data: ItemsResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to fetch items');
      }

      setItems(Array.isArray(data.data) ? data.data : []);
      setHasRequested(true);
      setStep(data.data?.length > 0 ? 'review' : 'request');
      setIsCorrect(null);
    } catch (error) {
      console.error('Error fetching items:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to fetch items.');
    } finally {
      setIsLoading(false);
    }
  }, [currentDriver]);

  const resetProcess = useCallback(() => {
    setItems([]);
    setHasRequested(false);
    setStep('request');
    setIsCorrect(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!currentDriver || items.length === 0 || isCorrect === null) return;

    setIsConfirming(true);
    
    try {
      const endpoint = `${API_BASE_URL}/drivers/${currentDriver.id}/loaded-items/confirm`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
        driver_id: currentDriver.id,
        items: items.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
        })),
        is_correct: isCorrect,
        confirmed_at: new Date().toISOString()
        })
      });

      const data: ConfirmationResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to confirm items');
      }

      Alert.alert(
        isCorrect ? 'Items Loaded' : 'Issue Reported',
        isCorrect 
          ? 'Items have been confirmed and loaded successfully.'
          : 'Your report has been submitted. Management will review.',
        [{ text: 'Done', onPress: () => resetProcess() }]
        );
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to confirm.');
    } finally {
      setIsConfirming(false);
    }
  }, [currentDriver, items, isCorrect, resetProcess]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchItems();
    setIsRefreshing(false);
  }, [fetchItems]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
        <Text style={styles.headerTitle}>Load Items</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={['#0F172A']} />
        }
      >
        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusIconContainer}>
            <View style={[styles.statusIcon, step === 'done' && styles.statusIconDone]}>
              <Ionicons 
                name={step === 'done' ? 'checkmark' : 'cube-outline'} 
                size={28} 
                color={step === 'done' ? '#FFFFFF' : '#0F172A'} 
              />
            </View>
          </View>
          
          <Text style={styles.statusTitle}>
            {step === 'request' && "Today's Loading"}
            {step === 'review' && 'Review Items'}
            {step === 'done' && 'Loading Complete'}
            </Text>
          
          <Text style={styles.statusSubtitle}>
            {step === 'request' && 'Request items assigned for loading today'}
            {step === 'review' && 'Verify the items match your physical count'}
            {step === 'done' && 'Items have been confirmed and loaded'}
              </Text>

          {step === 'request' && (
              <TouchableOpacity
              style={styles.requestButton}
                onPress={fetchItems}
                disabled={isLoading}
              activeOpacity={0.8}
              >
                {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                <>
                  <Ionicons name="download-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.requestButtonText}>Request Items</Text>
                </>
              )}
              </TouchableOpacity>
          )}
        </View>

        {/* Items List */}
        {items.length > 0 && step === 'review' && (
          <>
            {/* Summary Bar */}
            <View style={styles.summaryBar}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{items.length}</Text>
                <Text style={styles.summaryLabel}>Items</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{totalQuantity}</Text>
                <Text style={styles.summaryLabel}>Total Units</Text>
              </View>
            </View>

            {/* Items */}
            <View style={styles.itemsSection}>
              <Text style={styles.sectionTitle}>Items to Load</Text>
              
              {items.map((item, index) => (
                <View key={item.id} style={styles.itemCard}>
                  <View style={styles.itemIcon}>
                    <Ionicons name="water-outline" size={20} color="#0EA5E9" />
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemCategory}>{item.category}</Text>
                  </View>
                  <View style={styles.itemQuantity}>
                    <Text style={styles.itemQuantityValue}>{item.quantity}</Text>
                    <Text style={styles.itemQuantityUnit}>{item.unit}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Verification */}
            <View style={styles.verificationSection}>
              <Text style={styles.sectionTitle}>Verification</Text>
              <Text style={styles.verificationText}>
                Do the items above match your physical count?
              </Text>
              
              <View style={styles.verificationButtons}>
                <TouchableOpacity
                  style={[
                    styles.verifyButton,
                    isCorrect === true && styles.verifyButtonCorrect
                  ]}
                  onPress={() => setIsCorrect(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons 
                    name="checkmark-circle" 
                    size={22} 
                    color={isCorrect === true ? '#FFFFFF' : '#10B981'} 
                  />
                  <Text style={[
                    styles.verifyButtonText,
                    isCorrect === true && styles.verifyButtonTextActive
                  ]}>
                    Yes, Correct
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.verifyButton,
                    isCorrect === false && styles.verifyButtonIncorrect
                  ]}
                  onPress={() => setIsCorrect(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons 
                    name="close-circle" 
                    size={22} 
                    color={isCorrect === false ? '#FFFFFF' : '#EF4444'} 
                  />
                  <Text style={[
                    styles.verifyButtonText,
                    isCorrect === false && styles.verifyButtonTextActive
                  ]}>
                    No, Issue
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* Empty State */}
        {hasRequested && items.length === 0 && step === 'request' && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="cube-outline" size={40} color="#CBD5E1" />
            </View>
            <Text style={styles.emptyTitle}>No Items Available</Text>
            <Text style={styles.emptySubtitle}>
              Items haven't arrived yet or no items are scheduled for today
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchItems}>
              <Ionicons name="refresh-outline" size={18} color="#64748B" />
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Action Section */}
        {step === 'review' && items.length > 0 && (
          <View style={styles.actionSection}>
            <TouchableOpacity
              style={styles.resetButton}
              onPress={resetProcess}
              disabled={isConfirming}
            >
              <Ionicons name="refresh-outline" size={20} color="#64748B" />
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.confirmButton,
                isCorrect === null && styles.confirmButtonDisabled
              ]}
              onPress={handleConfirm}
              disabled={isCorrect === null || isConfirming}
              activeOpacity={0.8}
            >
              {isConfirming ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.confirmButtonText}>Confirm Loading</Text>
                  <View style={styles.confirmArrow}>
                    <Ionicons name="arrow-forward" size={18} color="#0F172A" />
                  </View>
                </>
              )}
            </TouchableOpacity>
        </View>
      )}

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 24,
    paddingHorizontal: 20,
  },
  statusCard: {
    alignItems: 'center',
    paddingVertical: 32,
    marginBottom: 24,
  },
  statusIconContainer: {
    marginBottom: 20,
  },
  statusIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIconDone: {
    backgroundColor: '#10B981',
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  statusSubtitle: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 24,
    gap: 10,
  },
  requestButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 28,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E2E8F0',
  },
  itemsSection: {
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
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 2,
  },
  itemCategory: {
    fontSize: 13,
    color: '#64748B',
  },
  itemQuantity: {
    alignItems: 'flex-end',
  },
  itemQuantityValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  itemQuantityUnit: {
    fontSize: 12,
    color: '#94A3B8',
  },
  verificationSection: {
    marginBottom: 24,
  },
  verificationText: {
    fontSize: 15,
    color: '#64748B',
    marginBottom: 16,
  },
  verificationButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  verifyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  verifyButtonCorrect: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  verifyButtonIncorrect: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  verifyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  verifyButtonTextActive: {
    color: '#FFFFFF',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    gap: 8,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  actionSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    gap: 8,
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  confirmButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    height: 56,
    borderRadius: 16,
    gap: 12,
  },
  confirmButtonDisabled: {
    backgroundColor: '#E2E8F0',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  confirmArrow: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default LoadedItems;
