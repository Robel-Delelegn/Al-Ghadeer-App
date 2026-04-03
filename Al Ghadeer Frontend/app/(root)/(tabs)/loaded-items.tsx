import ApiErrorText from '@/components/ApiErrorText';
import { useOrderStore } from '@/store/index';
import { authenticatedFetch } from '@/store/auth';
import { parseApiResponse, parseApiResponseWithSoftError } from '@/utils/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { 
  ScrollView, 
  Text, 
  TouchableOpacity, 
  View, 
  ActivityIndicator, 
  RefreshControl,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { showErrorAlert, showSuccessAlert } from '@/store/utils/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const API_BASE_URL = process.env.EXPO_PUBLIC_IP_ADDRESS;

interface Item {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
}

type ItemGroup = 'wholesale' | 'refill' | 'other';

const normalizeCategory = (category?: string) =>
  (category || '').trim().toLowerCase().replace(/[\s_-]+/g, '');

const getItemGroup = (category?: string): ItemGroup => {
  const normalized = normalizeCategory(category);

  if (normalized.includes('refill')) return 'refill';
  if (normalized.includes('wholesale') || normalized.includes('bulk') || normalized.includes('retailitem')) {
    return 'wholesale';
  }
  return 'other';
};

interface ItemsResponse {
  success: boolean;
  message: string;
  data: Item[];
  requires_confirm?: boolean;
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
  const [requiresConfirm, setRequiresConfirm] = useState(true);
  const [step, setStep] = useState<'request' | 'review' | 'done' | 'view'>('request');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const groupOrder: ItemGroup[] = ['wholesale', 'refill', 'other'];

  const groupedItems = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const group = getItemGroup(item.category);
        acc[group].push(item);
        return acc;
      },
      {
        wholesale: [] as Item[],
        refill: [] as Item[],
        other: [] as Item[],
      }
    );
  }, [items]);

  const getGroupLabel = (group: ItemGroup) => {
    if (group === 'wholesale') return 'Wholesale';
    if (group === 'refill') return 'Refill';
    return 'Other';
  };

  const getGroupIcon = (group: ItemGroup): React.ComponentProps<typeof Ionicons>['name'] => {
    if (group === 'wholesale') return 'storefront-outline';
    if (group === 'refill') return 'water-outline';
    return 'cube-outline';
  };

  const fetchItems = useCallback(async () => {
    if (!currentDriver) return;

    setIsLoading(true);
    setApiError(null);
    try {
      const endpoint = `${API_BASE_URL}/drivers/loaded-items/request/?driver_id=${currentDriver.id}`;
      const response = await authenticatedFetch(endpoint, {
        method: 'GET',
      });

      const result = await parseApiResponseWithSoftError<{ items?: Item[]; data?: Item[]; message?: string; requires_confirm?: boolean; verification_id?: string } | Item[]>(response);
      if (!result.ok) {
        setItems([]);
        setApiError(result.error);
        return;
      }
      const data = result.data;
      const itemsList = Array.isArray(data) ? data : (data?.items ?? data?.data ?? []);
      const needsConfirm = Array.isArray(data) ? true : (data?.requires_confirm !== false);
      const verification = Array.isArray(data) ? null : (data?.verification_id ?? null);
      setItems(itemsList);
      setRequiresConfirm(needsConfirm);
      setVerificationId(verification);
      
      if (itemsList.length > 0) {
        setStep(needsConfirm ? 'review' : 'view');
      } else {
        setStep('request');
      }
      setIsCorrect(null);
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentDriver]);

  const resetProcess = useCallback(() => {
    setItems([]);
    setStep('request');
    setIsCorrect(null);
    setRequiresConfirm(true);
    setVerificationId(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!currentDriver || items.length === 0 || isCorrect === null) return;

    setIsConfirming(true);
    setApiError(null);
    try {
      const endpoint = `${API_BASE_URL}/drivers/loaded-items/confirm/?driver_id=${currentDriver.id}`;
      const response = await authenticatedFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
        items: items.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
        })),
        is_correct: isCorrect,
        confirmed_at: new Date().toISOString(),
        ...(verificationId && { verification_id: verificationId }),
        })
      });

      const confirmResult = await parseApiResponseWithSoftError<unknown>(response);
      if (!confirmResult.ok) {
        setApiError(confirmResult.error);
        return;
      }

      showSuccessAlert(
        isCorrect ? 'Items Loaded' : 'Issue Reported',
        isCorrect 
          ? 'Items have been confirmed and loaded successfully.'
          : 'Your report has been submitted. Management will review.',
        [{ text: 'Done', onPress: () => resetProcess() }]
        );
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Failed to confirm.');
    } finally {
      setIsConfirming(false);
    }
  }, [currentDriver, items, isCorrect, verificationId, resetProcess]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchItems();
    setIsRefreshing(false);
  }, [fetchItems]);

  // Auto-fetch items on component mount
  useEffect(() => {
    fetchItems();
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

      <ApiErrorText error={apiError} />

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
            {step === 'view' && 'Loaded Items'}
            {step === 'done' && 'Loading Complete'}
            </Text>
          
          <Text style={styles.statusSubtitle}>
            {step === 'request' && 'Loading items assigned for today...'}
            {step === 'review' && 'Verify the items match your physical count'}
            {step === 'view' && 'Items currently loaded in your truck'}
            {step === 'done' && 'Items have been confirmed and loaded'}
              </Text>
        </View>

        {/* Items List - Confirmation View */}
        {items.length > 0 && step === 'review' && requiresConfirm && (
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

              {groupOrder.map((group) => {
                const sectionItems = groupedItems[group];
                if (sectionItems.length === 0) return null;

                return (
                  <View key={group} style={styles.categorySection}>
                    <View style={styles.categoryHeader}>
                      <View
                        style={[
                          styles.categoryBadge,
                          group === 'wholesale' && styles.categoryBadgeWholesale,
                          group === 'refill' && styles.categoryBadgeRefill,
                          group === 'other' && styles.categoryBadgeOther,
                        ]}
                      >
                        <Ionicons
                          name={getGroupIcon(group)}
                          size={14}
                          color={group === 'wholesale' ? '#1D4ED8' : group === 'refill' ? '#0E7490' : '#475569'}
                        />
                        <Text style={styles.categoryBadgeText}>{getGroupLabel(group)}</Text>
                      </View>
                      <View style={styles.categoryCountBadge}>
                        <Text style={styles.categoryCountText}>{sectionItems.length}</Text>
                      </View>
                    </View>

                    {sectionItems.map((item) => (
                      <View key={item.id} style={styles.itemCard}>
                        <View
                          style={[
                            styles.itemIcon,
                            group === 'wholesale' && styles.itemIconWholesale,
                            group === 'refill' && styles.itemIconRefill,
                            group === 'other' && styles.itemIconOther,
                          ]}
                        >
                          <Ionicons
                            name={getGroupIcon(group)}
                            size={20}
                            color={group === 'wholesale' ? '#1D4ED8' : group === 'refill' ? '#0891B2' : '#475569'}
                          />
                        </View>
                        <View style={styles.itemInfo}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          <Text style={styles.itemCategory}>
                            {getGroupLabel(group)}
                            {group === 'other' && item.category ? ` • ${item.category}` : ''}
                          </Text>
                        </View>
                        <View style={styles.itemQuantity}>
                          <Text style={styles.itemQuantityValue}>{item.quantity}</Text>
                          <Text style={styles.itemQuantityUnit}>{item.unit}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })}
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

        {/* Items List - Table View (No Confirmation Required) */}
        {items.length > 0 && step === 'view' && !requiresConfirm && (
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

            {/* Items Table */}
            <View style={styles.itemsSection}>
              <Text style={styles.sectionTitle}>Items in Truck</Text>

              {groupOrder.map((group) => {
                const sectionItems = groupedItems[group];
                if (sectionItems.length === 0) return null;

                return (
                  <View key={group} style={styles.categorySection}>
                    <View style={styles.categoryHeader}>
                      <View
                        style={[
                          styles.categoryBadge,
                          group === 'wholesale' && styles.categoryBadgeWholesale,
                          group === 'refill' && styles.categoryBadgeRefill,
                          group === 'other' && styles.categoryBadgeOther,
                        ]}
                      >
                        <Ionicons
                          name={getGroupIcon(group)}
                          size={14}
                          color={group === 'wholesale' ? '#1D4ED8' : group === 'refill' ? '#0E7490' : '#475569'}
                        />
                        <Text style={styles.categoryBadgeText}>{getGroupLabel(group)}</Text>
                      </View>
                      <View style={styles.categoryCountBadge}>
                        <Text style={styles.categoryCountText}>{sectionItems.length}</Text>
                      </View>
                    </View>

                    <View style={styles.tableContainer}>
                      <View style={styles.tableHeader}>
                        <Text style={[styles.tableHeaderText, styles.tableColName]}>Item</Text>
                        <Text style={[styles.tableHeaderText, styles.tableColQuantity]}>Quantity</Text>
                        <Text style={[styles.tableHeaderText, styles.tableColUnit]}>Unit</Text>
                      </View>

                      {sectionItems.map((item, index) => (
                        <View
                          key={item.id}
                          style={[styles.tableRow, index < sectionItems.length - 1 && styles.tableRowBorder]}
                        >
                          <Text style={[styles.tableCell, styles.tableColName]}>{item.name}</Text>
                          <Text style={[styles.tableCell, styles.tableColQuantity]}>{item.quantity}</Text>
                          <Text style={[styles.tableCell, styles.tableColUnit]}>{item.unit}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Empty State */}
        {items.length === 0 && step === 'request' && !isLoading && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="cube-outline" size={40} color="#CBD5E1" />
            </View>
            <Text style={styles.emptyTitle}>No Items Available</Text>
            <Text style={styles.emptySubtitle}>
              Items haven't arrived yet or no items are scheduled for today
            </Text>
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
  categorySection: {
    marginBottom: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  categoryBadgeWholesale: {
    backgroundColor: '#DBEAFE',
  },
  categoryBadgeRefill: {
    backgroundColor: '#CFFAFE',
  },
  categoryBadgeOther: {
    backgroundColor: '#E2E8F0',
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E3A8A',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  categoryCountBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  categoryCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
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
  itemIconWholesale: {
    backgroundColor: '#DBEAFE',
  },
  itemIconRefill: {
    backgroundColor: '#CFFAFE',
  },
  itemIconOther: {
    backgroundColor: '#E2E8F0',
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
  tableContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableColName: {
    flex: 2,
  },
  tableColCategory: {
    flex: 1.5,
  },
  tableColQuantity: {
    flex: 1,
    textAlign: 'right',
  },
  tableColUnit: {
    flex: 1,
    textAlign: 'right',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  tableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableCell: {
    fontSize: 14,
    color: '#0F172A',
  },
});

export default LoadedItems;
