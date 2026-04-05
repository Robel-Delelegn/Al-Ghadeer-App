import ApiErrorText from '@/components/ApiErrorText';
import { useOrderStore } from '@/store/index';
import { useAuthStore, authenticatedFetch } from '@/store/auth';
import { Order } from '@/types/order';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 
  ActivityIndicator, 
  ScrollView, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  View,
  StyleSheet,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  Modal,
  Image,
} from 'react-native';
import { showWarningAlert, showErrorAlert } from '@/store/utils/alert';
import { parseApiResponseWithSoftError } from '@/utils/api';
import {
  buildDeliveryTaskOutcomes,
  toDeliverySaleItemType,
  toMoney,
} from '@/utils/deliveries';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SignatureViewRef } from 'react-native-signature-canvas';

const { width, height } = Dimensions.get('window');
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

type SignatureCanvasComponent = typeof import('react-native-signature-canvas').default;

let signatureCanvasComponent: SignatureCanvasComponent | null | undefined;

const getSignatureCanvasComponent = (): SignatureCanvasComponent | null => {
  if (signatureCanvasComponent !== undefined) {
    return signatureCanvasComponent;
  }

  try {
    signatureCanvasComponent = require('react-native-signature-canvas').default as SignatureCanvasComponent;
  } catch (error) {
    signatureCanvasComponent = null;
    console.error('react-native-signature-canvas is unavailable in this build:', error);
  }

  return signatureCanvasComponent;
};

const OrganizationSignature: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const signatureRef = useRef<SignatureViewRef>(null);
  const SignatureCanvas = useMemo(() => getSignatureCanvasComponent(), []);
  const isSignatureModuleAvailable = SignatureCanvas !== null;
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiverName, setReceiverName] = useState('');
  const [receiverPosition, setReceiverPosition] = useState('');
  const [notes, setNotes] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  
  const { 
    selectedOrder, 
    assignedOrders, 
    cartItems,
    selectedPaymentMethod,
    updateOrderStatus,
    setLastConfirmPaymentResponse,
  } = useOrderStore();
  const { user } = useAuthStore();
  
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
  
  const { subtotal, vat, totalWithVat, itemCount } = useMemo(() => {
    const sub = cartItems.reduce((sum, item) => {
      if (!item || typeof item.price !== 'number' || typeof item.quantity !== 'number') {
        return sum;
      }
      return sum + item.price * item.quantity;
    }, 0);
    const vatAmount = sub * 0.05;
    const total = sub + vatAmount;
    const count = cartItems.reduce((sum, item) => sum + (item?.quantity || 0), 0);
    
    return {
      subtotal: sub.toFixed(2),
      vat: vatAmount.toFixed(2),
      totalWithVat: total.toFixed(2),
      itemCount: count
    };
  }, [cartItems]);

  const organizationName = orderDetail?.customer_name || 'Organization';
  // Ensure walletBalance is always a number (handle string values from API like "0.00")
  const walletBalanceRaw = orderDetail?.wallet_balance ?? 0;
  const walletBalance = typeof walletBalanceRaw === 'string' ? parseFloat(walletBalanceRaw) || 0 : (typeof walletBalanceRaw === 'number' ? walletBalanceRaw : 0);
  const newBalance = walletBalance - parseFloat(totalWithVat);

  // Handle signature capture - closes modal when captured from modal
  const handleSignature = useCallback((signature: string) => {
    if (!signature || signature.trim().length === 0) {
      console.log('Empty signature received');
      showWarningAlert('No Signature', 'Please draw a signature before saving.');
      return;
    }
    
    // Keep the full signature data URL with prefix (data:image/png;base64,...)
    // Don't strip the prefix - send it as-is to the server
    console.log('Signature captured, length:', signature.length, 'First 50 chars:', signature.substring(0, 50),'...');
    
    if (signature && signature.length > 0) {
      setSignatureData(signature); // Store full data URL with prefix
      setHasSignature(true);
      // Close modal if it's open (when capturing from full-screen modal)
      if (showSignatureModal) {
        setShowSignatureModal(false);
      }
    } else {
      console.log('Signature is empty');
      showErrorAlert('Error', 'Failed to capture signature. Please try again.');
    }
  }, [showSignatureModal]);

  const handleEmpty = useCallback(() => {
    setHasSignature(false);
    setSignatureData(null);
    setHasDrawnSignature(false);
  }, []);

  const handleClear = useCallback(() => {
    signatureRef.current?.clearSignature();
    setHasSignature(false);
    setSignatureData(null);
    setHasDrawnSignature(false);
  }, []);

  const handleOpenSignature = useCallback(() => {
    if (!isSignatureModuleAvailable) {
      showErrorAlert(
        'Signature Unavailable',
        'This app build is missing the WebView native module. Rebuild and reinstall the Android app.'
      );
      return;
    }

    setShowSignatureModal(true);
    setHasDrawnSignature(false);
  }, [isSignatureModuleAvailable]);

  const handleSignatureEnd = useCallback(() => {
    // User finished drawing a stroke - enable Done button
    setHasDrawnSignature(true);
  }, []);

  const handleDoneSignature = useCallback(() => {
    if (signatureRef.current && hasDrawnSignature) {
      // Read the signature - this will trigger onOK callback which closes modal
      try {
        signatureRef.current.readSignature();
      } catch (error) {
        console.error('Error reading signature:', error);
        showErrorAlert('Error', 'Failed to capture signature. Please try again.');
      }
    }
  }, [hasDrawnSignature]);

  const handleCancelSignature = useCallback(() => {
    setShowSignatureModal(false);
  }, []);

  const handleConfirm = useCallback(async () => {
    const hasRentItemsSelected = editableRentItems.some((item) => {
      const quantity = Math.max(0, rentItemQuantities[item.id] ?? item.quantity ?? 0);
      return quantity > 0;
    });

    if (cartItems.length === 0 && !hasRentItemsSelected) {
      showWarningAlert('No Items', 'Please add items or set quantity for other actions.');
      return;
    }

    if (!receiverName.trim()) {
      showWarningAlert('Required', 'Please enter the receiver\'s name.');
      return;
    }

    if (!hasSignature || !signatureData) {
      showWarningAlert('Required', 'Please provide a signature.');
      return;
    }

    if (!orderDetail) {
      showErrorAlert('Error', 'Order details not found.');
      return;
    }

    setIsProcessing(true);
    setApiError(null);
    try {
      // Calculate subtotal, VAT, and total
      const sub = cartItems.reduce((sum, item) => {
        if (!item || typeof item.price !== 'number' || typeof item.quantity !== 'number') {
          return sum;
        }
        return sum + item.price * item.quantity;
      }, 0);
      const vatAmount = sub * 0.05;
      const total = sub + vatAmount;

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

      const requestData = {
        status: 'success' as const,
        displayId: orderDetail.display_id || orderDetail.order_number || orderDetail.id,
        tasks: buildDeliveryTaskOutcomes(orderDetail.tasks || [], 'success'),
        ...(saleItems.length > 0
          ? {
              sale: {
                items: saleItems,
                totals: {
                  subtotal: toMoney(sub),
                  vat: toMoney(vatAmount),
                  total: toMoney(total),
                },
                payment: {
                  method: selectedPaymentMethod || 'cash',
                  amount: toMoney(total),
                },
              },
            }
          : {}),
        ...(depositsReturns.length > 0 ? { depositsReturns } : {}),
        receiver: {
          name: receiverName.trim(),
          ...(receiverPosition.trim()
            ? { position: receiverPosition.trim() }
            : {}),
          signatureData,
        },
        ...(notes.trim() ? { remark: notes.trim() } : {}),
      };

      console.log('[delivery-confirm-signature] request payload', {
        deliveryId: orderDetail.id,
        displayId: requestData.displayId,
        tasks: requestData.tasks,
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
          body: JSON.stringify(requestData),
        }
      );

      const parseResult = await parseApiResponseWithSoftError<{ deliveryNoteId: string }>(response);
      if (!parseResult.ok) {
        console.error('[delivery-confirm-signature] failed response', parseResult.error);
        setApiError(parseResult.error);
        return;
      }
      const result = parseResult.data;

      // Mark order as delivered and store confirm payment response for receipt
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
      setApiError(error instanceof Error ? error.message : 'Failed to process delivery.');
    } finally {
      setIsProcessing(false);
    }
  }, [editableRentItems, rentItemQuantities, cartItems, receiverName, hasSignature, signatureData, orderDetail, receiverPosition, notes, selectedPaymentMethod, user?.id, setLastConfirmPaymentResponse, updateOrderStatus, router]);

  const signatureStyle = `.m-signature-pad {
    box-shadow: none;
    border: none;
    background-color: #FFFFFF;
  }
  .m-signature-pad--body {
    border: none;
  }
  .m-signature-pad--footer {
    display: none;
  }
  body, html {
    background-color: #FFFFFF;
  }`;

  const signatureStyleFullScreen = `.m-signature-pad {
    box-shadow: none;
    border: none;
    background-color: #FFFFFF;
    width: 100%;
    height: 100%;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }
  .m-signature-pad--body {
    border: none;
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }
  .m-signature-pad--body canvas {
    width: 100% !important;
    height: 100% !important;
    touch-action: none;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
  .m-signature-pad--footer {
    display: none;
  }
  body, html {
    background-color: #FFFFFF;
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    touch-action: none;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }`;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Credit Delivery</Text>
          <View style={styles.orgBadge}>
            <Ionicons name="business" size={10} color="#7C3AED" />
            <Text style={styles.orgBadgeText}>Organization</Text>
          </View>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ApiErrorText error={apiError} />

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
          {/* Organization Info Card */}
          <View style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <View style={styles.orgIcon}>
                <Ionicons name="business" size={24} color="#7C3AED" />
              </View>
              <View style={styles.infoDetails}>
                <Text style={styles.orgName}>{organizationName}</Text>
                <Text style={styles.orderNumber}>{orderDetail?.order_number}</Text>
              </View>
            </View>
            
            <View style={styles.amountRow}>
              <View style={styles.amountItem}>
                <Text style={styles.amountLabel}>Order Total</Text>
                <Text style={styles.amountValue}>AED {totalWithVat}</Text>
              </View>
              <View style={styles.amountDivider} />
              <View style={styles.amountItem}>
                <Text style={styles.amountLabel}>Current Balance</Text>
                <Text style={[
                  styles.amountValue,
                  walletBalance >= 0 ? styles.balancePositive : styles.balanceNegative
                ]}>
                  AED {walletBalance.toFixed(2)}
                </Text>
              </View>
            </View>

            <View style={styles.newBalanceBox}>
              <Ionicons name="trending-down" size={16} color="#F97316" />
              <Text style={styles.newBalanceLabel}>Balance after delivery:</Text>
              <Text style={styles.newBalanceValue}>AED {newBalance.toFixed(2)}</Text>
            </View>
          </View>

          {/* Items Summary */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Items Delivered</Text>
              <View style={styles.itemBadge}>
                <Text style={styles.itemBadgeText}>{itemCount}</Text>
              </View>
            </View>
            {cartItems.filter(item => item?.name).map((item, index) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemQty}>×{item.quantity}</Text>
                <Text style={styles.itemPrice}>AED {(item.price * item.quantity).toFixed(2)}</Text>
              </View>
            ))}
          </View>

          {/* Other Actions */}
          {editableRentItems.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Other Actions</Text>
                <View style={styles.itemBadge}>
                  <Text style={styles.itemBadgeText}>{editableRentItems.length}</Text>
                </View>
              </View>
              {editableRentItems.map((item, index) => {
                const quantity = Math.max(0, rentItemQuantities[item.id] ?? item.quantity ?? 0);
                return (
                  <View key={item.id}>
                    <View style={styles.otherActionRow}>
                      <View style={styles.otherActionLeft}>
                        <View style={[styles.otherActionIcon, item.category === 'borrow' ? styles.otherActionIconBorrow : styles.otherActionIconDeposit]}>
                          <Ionicons
                            name={item.category === 'borrow' ? 'arrow-down-circle' : 'arrow-up-circle'}
                            size={16}
                            color={item.category === 'borrow' ? '#10B981' : '#3B82F6'}
                          />
                        </View>
                        <View style={styles.otherActionInfo}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          <Text style={styles.otherActionMeta}>{item.category === 'borrow' ? 'Borrow' : 'Deposit'}</Text>
                        </View>
                      </View>
                      <View style={styles.otherActionRight}>
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
                        <Text style={styles.itemPrice}>AED {(item.price * quantity).toFixed(2)}</Text>
                      </View>
                    </View>
                    {index < editableRentItems.length - 1 && <View style={styles.itemDivider} />}
                  </View>
                );
              })}
            </View>
          )}

          {/* Receiver Details */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Receiver Information</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Receiver Name <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="Full name of the person receiving"
                placeholderTextColor="#9CA3AF"
                value={receiverName}
                onChangeText={setReceiverName}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Position / Title</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Office Manager, Receptionist"
                placeholderTextColor="#9CA3AF"
                value={receiverPosition}
                onChangeText={setReceiverPosition}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Notes</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="Any additional notes..."
                placeholderTextColor="#9CA3AF"
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* Signature Pad */}
          <View style={styles.signatureCard}>
            <View style={styles.signatureHeader}>
              <Text style={styles.cardTitle}>Signature <Text style={styles.required}>*</Text></Text>
              {hasSignature && (
                <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
                  <Ionicons name="refresh" size={16} color="#6B7280" />
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            
            <Text style={styles.signatureHint}>
              I acknowledge receipt of the above items and agree to pay the amount due.
            </Text>

            {!isSignatureModuleAvailable ? (
              <View style={styles.signatureUnavailable}>
                <Ionicons name="alert-circle" size={28} color="#DC2626" />
                <Text style={styles.signatureUnavailableTitle}>Signature is unavailable in this build</Text>
                <Text style={styles.signatureUnavailableText}>
                  Rebuild and reinstall the Android app to load the required native WebView module.
                </Text>
              </View>
            ) : hasSignature ? (
              <TouchableOpacity 
                style={styles.signaturePreview}
                onPress={handleOpenSignature}
                activeOpacity={0.9}
              >
                <View style={styles.signaturePreviewContent}>
                  {signatureData ? (
                    <Image 
                      source={{ uri: signatureData.startsWith('data:image') ? signatureData : `data:image/png;base64,${signatureData}` }} 
                      style={styles.signatureImage}
                      resizeMode="contain"
                      onError={(error) => {
                        console.log('Image load error:', error);
                      }}
                      onLoad={() => {
                        console.log('Image loaded successfully');
                      }}
                    />
                  ) : (
                    <View style={styles.signaturePlaceholder}>
                      <Ionicons name="document-text" size={32} color="#CBD5E1" />
                      <Text style={styles.signaturePlaceholderText}>No signature</Text>
                    </View>
                  )}
                  <View style={styles.signatureEditBadge}>
                    <Ionicons name="create-outline" size={14} color="#7C3AED" />
                    <Text style={styles.signatureEditBadgeText}>Tap to edit</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={styles.signatureButton}
                onPress={handleOpenSignature}
                activeOpacity={0.8}
              >
                <View style={styles.signatureButtonContent}>
                  <Ionicons name="pencil" size={32} color="#7C3AED" />
                  <Text style={styles.signatureButtonText}>Tap to Sign</Text>
                  <Text style={styles.signatureButtonSubtext}>Use your finger or stylus</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* Confirm Button */}
          <View style={styles.actionSection}>
            <TouchableOpacity
              style={[
                styles.confirmButton,
                (!hasSignature || !receiverName.trim() || isProcessing) && styles.confirmButtonDisabled
              ]}
              onPress={handleConfirm}
              disabled={!hasSignature || !receiverName.trim() || isProcessing}
              activeOpacity={0.8}
            >
              {isProcessing ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.confirmButtonText}>Processing...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                  <Text style={styles.confirmButtonText}>Confirm Credit Delivery</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={{ height: Math.max(insets.bottom, 20) + 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Full-Screen Signature Modal */}
      <Modal
        visible={showSignatureModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleCancelSignature}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity 
              style={styles.modalCancelButton}
              onPress={handleCancelSignature}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Sign Here</Text>
            <TouchableOpacity 
              style={styles.modalClearButton}
              onPress={handleClear}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh" size={20} color="#6B7280" />
              <Text style={styles.modalClearText}>Clear</Text>
            </TouchableOpacity>
          </View>

          {/* Signature Canvas - Full Screen */}
          <View style={styles.modalSignatureContainer}>
            {SignatureCanvas ? (
              <SignatureCanvas
                ref={signatureRef}
                onOK={handleSignature}
                onEmpty={handleEmpty}
                onEnd={handleSignatureEnd}
                autoClear={false}
                descriptionText=""
                webStyle={signatureStyleFullScreen}
                backgroundColor="#FFFFFF"
                penColor="#111827"
                minWidth={2}
                maxWidth={4}
                imageType="image/png"
              />
            ) : (
              <View style={styles.signatureUnavailableModal}>
                <Ionicons name="alert-circle" size={28} color="#DC2626" />
                <Text style={styles.signatureUnavailableTitle}>Signature is unavailable in this build</Text>
              </View>
            )}
          </View>

          {/* Modal Footer */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.modalCancelFooterButton}
              onPress={handleCancelSignature}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCancelFooterText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modalDoneButton,
                (!hasDrawnSignature || !isSignatureModuleAvailable) && styles.modalDoneButtonDisabled
              ]}
              onPress={handleDoneSignature}
              disabled={!hasDrawnSignature || !isSignatureModuleAvailable}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.modalDoneButtonText,
                (!hasDrawnSignature || !isSignatureModuleAvailable) && styles.modalDoneButtonTextDisabled
              ]}>
                Done
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  orgBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
    gap: 4,
  },
  orgBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#7C3AED',
  },
  headerRight: {
    width: 36,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#E9D5FF',
    ...Platform.select({
      ios: {
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  orgIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F3E8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  infoDetails: {
    flex: 1,
  },
  orgName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  orderNumber: {
    fontSize: 13,
    color: '#64748B',
  },
  amountRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  amountItem: {
    flex: 1,
    alignItems: 'center',
  },
  amountDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 12,
  },
  amountLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  balancePositive: {
    color: '#059669',
  },
  balanceNegative: {
    color: '#F97316',
  },
  newBalanceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  newBalanceLabel: {
    fontSize: 13,
    color: '#92400E',
    flex: 1,
  },
  newBalanceValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EA580C',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
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
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  required: {
    color: '#DC2626',
  },
  itemBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  itemBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  itemQty: {
    fontSize: 13,
    color: '#64748B',
    marginRight: 12,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  itemDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  otherActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  otherActionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  otherActionIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  otherActionIconBorrow: {
    backgroundColor: '#ECFDF5',
  },
  otherActionIconDeposit: {
    backgroundColor: '#EFF6FF',
  },
  otherActionInfo: {
    flex: 1,
  },
  otherActionMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  otherActionRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  rentQtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 3,
  },
  rentQtyButton: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
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
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  inputMultiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  signatureCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  signatureUnavailable: {
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    gap: 8,
  },
  signatureUnavailableModal: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#FEF2F2',
    gap: 8,
  },
  signatureUnavailableTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
    textAlign: 'center',
  },
  signatureUnavailableText: {
    fontSize: 13,
    color: '#7F1D1D',
    textAlign: 'center',
    lineHeight: 18,
  },
  signatureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clearText: {
    fontSize: 13,
    color: '#6B7280',
  },
  signatureHint: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 12,
    lineHeight: 18,
  },
  signatureButton: {
    height: 200,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    backgroundColor: '#FAFAFA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signatureButtonContent: {
    alignItems: 'center',
    gap: 8,
  },
  signatureButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7C3AED',
  },
  signatureButtonSubtext: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  signaturePreview: {
    height: 200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#FFFFFF',
  },
  signaturePreviewContent: {
    width: '100%',
    height: '100%',
    position: 'relative',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
  },
  signatureImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  signaturePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  signaturePlaceholderText: {
    fontSize: 14,
    color: '#CBD5E1',
    fontWeight: '500',
  },
  signatureEditBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.2)',
    ...Platform.select({
      ios: {
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  signatureEditBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7C3AED',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalCancelButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalClearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  modalClearText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  modalSignatureContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 12,
  },
  modalCancelFooterButton: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelFooterText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  modalDoneButton: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDoneButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  modalDoneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalDoneButtonTextDisabled: {
    color: '#9CA3AF',
  },
  actionSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED',
    height: 56,
    borderRadius: 14,
    gap: 10,
  },
  confirmButtonDisabled: {
    backgroundColor: '#C4B5FD',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default OrganizationSignature;
