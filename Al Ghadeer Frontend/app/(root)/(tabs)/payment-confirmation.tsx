import ApiErrorText from '@/components/ApiErrorText';
import { useOrderStore } from '@/store/index';
import { useAuthStore, authenticatedFetch } from '@/store/auth';
import { Order } from '@/types/order';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { 
  ActivityIndicator, 
  ScrollView, 
  Text, 
  TouchableOpacity, 
  View,
  StyleSheet,
  Dimensions,
  Platform,
  Image,
} from 'react-native';
import { showErrorAlert } from '@/store/utils/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parseApiResponseWithSoftError } from '@/utils/api';
import {
  buildDeliveryTaskOutcomes,
  toDeliverySaleItemType,
  toMoney,
} from '@/utils/deliveries';

const { width } = Dimensions.get('window');
const IP_ADDRESS = process.env.EXPO_PUBLIC_IP_ADDRESS;

const getDepositReturnType = (
  actionType?: string,
): 'deposit' | 'deposit_return' => {
  const normalized = (actionType || '').toLowerCase();
  if (
    normalized.includes('refund') ||
    normalized.includes('return') ||
    normalized.includes('from-customer')
  ) {
    return 'deposit_return';
  }
  return 'deposit';
};

const getDepositKind = (
  value?: string,
  fallbackCategory?: string,
): 'asset' | 'bottle' => {
  const normalized = (value || fallbackCategory || '').toLowerCase();
  return normalized.includes('bottle') ? 'bottle' : 'asset';
};

const PaymentConfirmation: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuthStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const { 
    selectedOrder, 
    assignedOrders, 
    cartItems,
    selectedPaymentMethod,
    updateOrderStatus,
    setLastConfirmPaymentResponse,
  } = useOrderStore();
  
  const orderDetail = assignedOrders.find(item => selectedOrder === item.id) as Order | undefined;
  const editableRentItems = useMemo(
    () => (orderDetail?.rent_items || []).filter(item => item.in_truck === true),
    [orderDetail?.rent_items]
  );
  const [rentItemQuantities, setRentItemQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    const initial: Record<string, number> = {};
    editableRentItems.forEach((item) => {
      initial[item.id] = Math.max(0, item.quantity || 0);
    });
    setRentItemQuantities(initial);
  }, [editableRentItems]);

  const handleChangeRentItemQuantity = useCallback((itemId: string, delta: number) => {
    setRentItemQuantities((prev) => {
      const current = prev[itemId] ?? 0;
      const nextQuantity = Math.max(0, current + delta);
      return { ...prev, [itemId]: nextQuantity };
    });
  }, []);

  // Get signature data from params if available (for organization orders)
  const signatureData = params.signature_data as string | undefined;
  const receiverName = params.receiver_name as string | undefined;
  const receiverPosition = params.receiver_position as string | undefined;
  const notes = params.notes as string | undefined;
  
  const { subtotal, vat, totalWithVat, itemCount, rentItemsTotal, hasRentItemsSelected } = useMemo(() => {
    // Calculate regular products subtotal (with VAT)
    const sub = cartItems.reduce((sum, item) => {
      if (!item || typeof item.price !== 'number' || typeof item.quantity !== 'number') {
        return sum;
      }
      return sum + item.price * item.quantity;
    }, 0);
    const vatAmount = sub * 0.05;
    
    // Calculate rent items total (no VAT) from editable quantities
    const rentTotal = editableRentItems.reduce((sum, item) => {
      const quantity = Math.max(0, rentItemQuantities[item.id] ?? item.quantity ?? 0);
      return sum + ((item.price || 0) * quantity);
    }, 0);

    // Check if any rent items have a positive quantity
    const hasRentItems = editableRentItems.some((item) => {
      const quantity = Math.max(0, rentItemQuantities[item.id] ?? item.quantity ?? 0);
      return quantity > 0;
    });
    
    // Total = products (with VAT) + rent items (no VAT)
    const total = sub + vatAmount + rentTotal;
    const count = cartItems.reduce((sum, item) => sum + (item?.quantity || 0), 0);
    
    return {
      subtotal: sub.toFixed(2),
      vat: vatAmount.toFixed(2),
      totalWithVat: total.toFixed(2),
      itemCount: count,
      rentItemsTotal: rentTotal.toFixed(2),
      hasRentItemsSelected: hasRentItems,
    };
  }, [cartItems, editableRentItems, rentItemQuantities]);

  const paymentIcon = useMemo(() => {
    switch (selectedPaymentMethod) {
      case 'wallet': return 'wallet';
      case 'credit': return 'receipt';
      default: return 'cash';
    }
  }, [selectedPaymentMethod]);

  const paymentLabel = useMemo(() => {
    switch (selectedPaymentMethod) {
      case 'wallet': return 'Wallet';
      case 'credit': return 'Credit';
      default: return 'Cash';
    }
  }, [selectedPaymentMethod]);

  const handleConfirmPayment = useCallback(async () => {
    if (!orderDetail) {
      showErrorAlert('Error', 'Order details not found.');
      return;
    }
    
    // Allow confirmation if either cart has items OR rent items are selected
    if (cartItems.length === 0 && !hasRentItemsSelected) {
      showErrorAlert('Error', 'No items selected.');
      return;
    }
    
    setIsProcessing(true);
    setApiError(null);
    try {
      const rentItems = (orderDetail?.rent_items || [])
        .filter(item => item.in_truck === true)
        .map(item => ({
          ...item,
          quantity: Math.max(0, rentItemQuantities[item.id] ?? item.quantity ?? 0),
        }))
        .filter(item => item.quantity > 0);

      const saleItems = cartItems
        .filter(item => item?.name && item.quantity > 0)
        .map(item => ({
          itemId: item.item_id || item.id,
          itemType: toDeliverySaleItemType(item.item_type || item.category),
          quantity: item.quantity,
          unitPrice: toMoney(item.price),
        }));

      const depositsReturns = rentItems.map(item => ({
        type: getDepositReturnType(item.other_action_type),
        depositKind: getDepositKind(item.other_action_item_type, item.category),
        itemId: item.id,
        quantity: item.quantity,
        unitPrice: toMoney(item.price),
      }));

      const receiver =
        receiverName && receiverName.trim().length > 0
          ? {
              name: receiverName.trim(),
              ...(receiverPosition?.trim()
                ? { position: receiverPosition.trim() }
                : {}),
              ...(signatureData ? { signatureData } : {}),
            }
          : undefined;

      const requestBody = {
        status: 'success' as const,
        displayId: orderDetail.display_id || orderDetail.order_number || orderDetail.id,
        tasks: buildDeliveryTaskOutcomes(orderDetail.tasks || [], 'success'),
        ...(saleItems.length > 0
          ? {
              sale: {
                items: saleItems,
                totals: {
                  subtotal: toMoney(subtotal),
                  vat: toMoney(vat),
                  total: toMoney(totalWithVat),
                },
                payment: {
                  method: selectedPaymentMethod,
                  amount: toMoney(totalWithVat),
                },
              },
            }
          : {}),
        ...(depositsReturns.length > 0 ? { depositsReturns } : {}),
        ...(receiver ? { receiver } : {}),
        ...(notes?.trim() ? { remark: notes.trim() } : {}),
      };

      console.log('[delivery-confirm] request payload', {
        deliveryId: orderDetail.id,
        displayId: requestBody.displayId,
        tasks: requestBody.tasks,
        saleItems: saleItems.length,
        depositsReturns: depositsReturns.length,
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (user?.id || orderDetail.driver_id) {
        headers['X-Driver-Id'] = (user?.id || orderDetail.driver_id) as string;
      }

      const response = await authenticatedFetch(
        `${IP_ADDRESS}/deliveries/${encodeURIComponent(orderDetail.id)}`,
        {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      const parseResult = await parseApiResponseWithSoftError<{ deliveryNoteId: string }>(response);
      if (!parseResult.ok) {
        console.error('[delivery-confirm] failed response', parseResult.error);
        setApiError(parseResult.error);
        return;
      }
      const result = parseResult.data;

      // Mark order as delivered and store delivery note id for traceability
      if (orderDetail) {
        // Persist adjusted rent item quantities before moving order to completed orders
        if (orderDetail.rent_items && orderDetail.rent_items.length > 0) {
          const quantityMap = new Map(rentItems.map(item => [item.id, item.quantity] as const));
          const store = useOrderStore.getState();
          const updatedAssignedOrders = store.assignedOrders.map((order) => {
            if (order.id !== orderDetail.id) return order;
            return {
              ...order,
              rent_items: (order.rent_items || []).map((item) => {
                const updatedQuantity = quantityMap.has(item.id) ? quantityMap.get(item.id)! : 0;
                return {
                  ...item,
                  quantity: updatedQuantity,
                  in_truck: updatedQuantity > 0,
                };
              }),
            };
          });
          useOrderStore.setState({ assignedOrders: updatedAssignedOrders });
        }

        setLastConfirmPaymentResponse({
          orderId: orderDetail.id,
          sale_id: result.deliveryNoteId,
          order_number: orderDetail.display_id || orderDetail.order_number || orderDetail.id,
        });
        updateOrderStatus(orderDetail.id, 'delivered');
      }

      router.replace('/(root)/(tabs)/payment-receipt');
      
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [orderDetail, cartItems, subtotal, vat, totalWithVat, selectedPaymentMethod, router, updateOrderStatus, setLastConfirmPaymentResponse, signatureData, receiverName, receiverPosition, notes, user?.id, hasRentItemsSelected, rentItemQuantities]);

  const customerName = orderDetail?.customer_name || 'Customer';
  const customerAddress = orderDetail?.customer_address || '—';
  const customerPhone = orderDetail?.customer_phone || '—';
  const customerType = orderDetail?.customer_type || 'individual';
  // Ensure walletBalance is always a number (handle string values from API like "0.00")
  const walletBalanceRaw = orderDetail?.wallet_balance ?? 0;
  const walletBalance = typeof walletBalanceRaw === 'string' ? parseFloat(walletBalanceRaw) || 0 : (typeof walletBalanceRaw === 'number' ? walletBalanceRaw : 0);
  const isOrganization = customerType === 'organization';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ApiErrorText error={apiError} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color="#1E40AF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Confirm Payment</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Hero */}
        <View style={styles.heroSection}>
          <View style={styles.heroIconBox}>
            <Ionicons name="shield-checkmark" size={28} color="#059669" />
          </View>
          <Text style={styles.heroTitle}>Ready to Confirm</Text>
          <Text style={styles.heroSubtitle}>Review the details before completing</Text>
        </View>

        {/* Order Items */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Order Items</Text>
            <View style={styles.itemCountBadge}>
              <Text style={styles.itemCountText}>{itemCount}</Text>
            </View>
          </View>
          
          {cartItems.length === 0 ? (
            <View style={styles.emptyItems}>
              <Ionicons name="cart-outline" size={28} color="#D1D5DB" />
              <Text style={styles.emptyItemsText}>No items</Text>
            </View>
          ) : (
            <>
              {/* Table Header */}
              <View style={styles.itemsTableHeader}>
                <Text style={styles.tableHeaderText}>Product</Text>
                <Text style={[styles.tableHeaderText, styles.tableHeaderQty]}>Qty</Text>
                <Text style={[styles.tableHeaderText, styles.tableHeaderPrice]}>Price (ex VAT)</Text>
                <Text style={[styles.tableHeaderText, styles.tableHeaderPrice]}>VAT</Text>
                <Text style={[styles.tableHeaderText, styles.tableHeaderPrice]}>Total</Text>
              </View>
              {cartItems.filter(item => item?.name).map((item, index) => {
                const priceExVat = item.price;
                const vatAmount = priceExVat * 0.05;
                const priceWithVat = priceExVat + vatAmount;
                const itemVatTotal = vatAmount * item.quantity;
                const itemTotal = priceWithVat * item.quantity;
                
                return (
                  <View key={item.id}>
                    <View style={styles.itemsTableRow}>
                      <View style={styles.itemProductInfo}>
                        {item.image?.uri ? (
                          <Image 
                            source={item.image} 
                            style={styles.itemTableImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.itemTableIconBox}>
                            <Ionicons name="water" size={12} color="#0EA5E9" />
                          </View>
                        )}
                        <Text style={styles.itemTableName} numberOfLines={2}>{item.name}</Text>
                      </View>
                      <Text style={[styles.itemTableValue, styles.tableQty]}>{item.quantity}</Text>
                      <Text style={[styles.itemTableValue, styles.tablePrice]}>AED {priceExVat.toFixed(2)}</Text>
                      <Text style={[styles.itemTableValue, styles.tablePrice]}>AED {itemVatTotal.toFixed(2)}</Text>
                      <Text style={[styles.itemTableValue, styles.tablePrice, styles.itemTableTotal]}>AED {itemTotal.toFixed(2)}</Text>
                    </View>
                    {index < cartItems.length - 1 && <View style={styles.itemDivider} />}
                  </View>
                );
              })}
            </>
          )}
        </View>

        {/* Rent Items */}
        {editableRentItems.length > 0 && (
          <View style={styles.card}>
            <View style={styles.itemsTableHeader}>
              <Text style={styles.tableHeaderText}>Rent Items</Text>
              <Text style={[styles.tableHeaderText, styles.tableHeaderQtyControl]}>Qty</Text>
              <Text style={[styles.tableHeaderText, styles.tableHeaderPrice]}>Price</Text>
            </View>
            {editableRentItems.map((item, index) => {
              const quantity = Math.max(0, rentItemQuantities[item.id] ?? item.quantity ?? 0);
              return (
              <View key={item.id}>
                <View style={styles.itemsTableRow}>
                  <View style={styles.itemProductInfo}>
                    <View style={[styles.itemTableIconBox, item.category === 'borrow' ? styles.rentItemIconBorrow : styles.rentItemIconDeposit]}>
                      <Ionicons 
                        name={item.category === 'borrow' ? 'arrow-down-circle' : 'arrow-up-circle'} 
                        size={14} 
                        color={item.category === 'borrow' ? '#10B981' : '#3B82F6'} 
                      />
                    </View>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemMeta}>{item.category === 'borrow' ? 'Borrow' : 'Deposit'}</Text>
                    </View>
                  </View>
                  <View style={styles.rentQtyControl}>
                    <TouchableOpacity
                      style={[styles.rentQtyButton, quantity === 0 && styles.rentQtyButtonDisabled]}
                      onPress={() => handleChangeRentItemQuantity(item.id, -1)}
                      disabled={quantity === 0}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="remove" size={12} color={quantity === 0 ? '#CBD5E1' : '#1E40AF'} />
                    </TouchableOpacity>
                    <Text style={styles.rentQtyText}>{quantity}</Text>
                    <TouchableOpacity
                      style={styles.rentQtyButton}
                      onPress={() => handleChangeRentItemQuantity(item.id, 1)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add" size={12} color="#1E40AF" />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.itemTableValue, styles.tablePrice, styles.itemTableTotal]}>AED {(item.price * quantity).toFixed(2)}</Text>
                </View>
                {index < editableRentItems.length - 1 && <View style={styles.itemDivider} />}
              </View>
            )})}
          </View>
        )}

        {/* Customer */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer</Text>
          <View style={styles.customerRow}>
            <View style={styles.customerAvatar}>
              <Text style={styles.customerInitial}>
                {customerName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.customerInfo}>
              <Text style={styles.customerName}>{customerName}</Text>
              <Text style={styles.customerPhone}>{customerPhone}</Text>
            </View>
          </View>
          <View style={styles.addressBox}>
            <Ionicons name="location" size={14} color="#6B7280" />
            <Text style={styles.addressText} numberOfLines={2}>{customerAddress}</Text>
          </View>
        </View>

        {/* Payment Method */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Payment Method</Text>
            {isOrganization && (
              <View style={styles.orgBadge}>
                <Text style={styles.orgBadgeText}>Organization</Text>
              </View>
            )}
          </View>
          <View style={styles.paymentRow}>
            <View style={[
              styles.paymentIconBox,
              selectedPaymentMethod === 'wallet' && walletBalance < 0 && styles.paymentIconBoxNegative
            ]}>
              <Ionicons 
                name={paymentIcon} 
                size={20} 
                color={selectedPaymentMethod === 'wallet' && walletBalance < 0 ? '#F97316' : '#1E40AF'} 
              />
            </View>
            <View style={styles.paymentInfo}>
              <Text style={styles.paymentLabel}>{paymentLabel}</Text>
              {selectedPaymentMethod === 'wallet' ? (
                <Text style={[
                  styles.paymentSublabel,
                  walletBalance >= 0 ? styles.walletPositive : styles.walletNegative
                ]}>
                  Balance: AED {walletBalance.toFixed(2)}
                </Text>
              ) : (
                <Text style={styles.paymentSublabel}>Selected method</Text>
              )}
            </View>
            <View style={styles.paymentCheck}>
              <Ionicons name="checkmark" size={14} color="#059669" />
            </View>
          </View>
          {selectedPaymentMethod === 'wallet' && isOrganization && walletBalance < 0 && (
            <View style={styles.creditNote}>
              <Ionicons name="information-circle" size={14} color="#F97316" />
              <Text style={styles.creditNoteText}>Credit balance will be added to account</Text>
            </View>
          )}
        </View>

        {/* Totals - Professional Invoice Format */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment Summary</Text>
          <View style={styles.totalDivider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal (Excluding VAT)</Text>
            <Text style={styles.totalValue}>AED {subtotal}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>VAT (5%)</Text>
            <Text style={styles.totalValue}>AED {vat}</Text>
          </View>
          {parseFloat(rentItemsTotal) > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Rent Items</Text>
              <Text style={styles.totalValue}>AED {rentItemsTotal}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.grandTotalLabel}>Total (Including VAT)</Text>
            <Text style={styles.grandTotalValue}>AED {totalWithVat}</Text>
          </View>
        </View>

        {/* Action Section */}
        <View style={styles.actionSection}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.back()}
            disabled={isProcessing}
            activeOpacity={0.7}
          >
            <Ionicons name="pencil" size={18} color="#6B7280" />
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.confirmButton, isProcessing && styles.confirmButtonDisabled]}
            onPress={handleConfirmPayment}
            disabled={isProcessing || (cartItems.length === 0 && !hasRentItemsSelected)}
            activeOpacity={0.8}
          >
            {isProcessing ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.confirmButtonText}>Processing...</Text>
              </>
            ) : (
              <>
                <Text style={styles.confirmButtonText}>Pay AED {totalWithVat}</Text>
                <View style={styles.confirmArrow}>
                  <Ionicons name="checkmark" size={16} color="#059669" />
                </View>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: Math.max(insets.bottom, 20) + 80 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFBFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1E40AF',
    letterSpacing: -0.4,
  },
  headerRight: {
    width: 36,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 24,
    paddingHorizontal: 20,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  heroIconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E40AF',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#1E40AF',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  itemCountBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  itemCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  emptyItems: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  emptyItemsText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  itemIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E40AF',
    marginBottom: 2,
  },
  itemMeta: {
    fontSize: 12,
    color: '#6B7280',
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
  },
  itemDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 8,
  },
  itemsTableHeader: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    marginBottom: 8,
  },
  tableHeaderText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableHeaderQty: {
    width: 35,
    textAlign: 'center',
  },
  tableHeaderQtyControl: {
    width: 80,
    textAlign: 'center',
  },
  tableHeaderPrice: {
    width: 70,
    textAlign: 'right',
  },
  itemsTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  itemProductInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  itemTableImage: {
    width: 28,
    height: 28,
    borderRadius: 6,
    marginRight: 8,
  },
  itemTableIconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  itemTableName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#1E40AF',
  },
  itemTableValue: {
    fontSize: 12,
    color: '#4B5563',
  },
  tableQty: {
    width: 35,
    textAlign: 'center',
  },
  rentQtyControl: {
    width: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  rentQtyButton: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rentQtyButtonDisabled: {
    backgroundColor: '#F9FAFB',
  },
  rentQtyText: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
  },
  tablePrice: {
    width: 70,
    textAlign: 'right',
  },
  itemTableTotal: {
    fontWeight: '600',
    color: '#1E40AF',
  },
  rentItemIconBorrow: {
    backgroundColor: '#ECFDF5',
  },
  rentItemIconDeposit: {
    backgroundColor: '#EFF6FF',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  customerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  customerInitial: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E40AF',
  },
  customerPhone: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  addressText: {
    flex: 1,
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  paymentIconBoxNegative: {
    backgroundColor: '#FFF7ED',
  },
  paymentInfo: {
    flex: 1,
  },
  paymentLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E40AF',
  },
  paymentSublabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  walletPositive: {
    color: '#059669',
  },
  walletNegative: {
    color: '#F97316',
  },
  paymentCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orgBadge: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  orgBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#7C3AED',
  },
  creditNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    gap: 8,
  },
  creditNoteText: {
    fontSize: 11,
    color: '#92400E',
    flex: 1,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
  },
  totalLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E40AF',
  },
  totalDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  grandTotalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E40AF',
  },
  grandTotalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#059669',
  },
  actionSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#1E40AF',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    gap: 8,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  confirmButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    height: 52,
    borderRadius: 14,
    gap: 10,
  },
  confirmButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  confirmArrow: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default PaymentConfirmation;
