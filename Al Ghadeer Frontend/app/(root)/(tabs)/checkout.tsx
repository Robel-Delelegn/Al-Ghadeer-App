import { useOrderStore } from "@/store/index";
import { Order } from "@/types/order";
import {
  getOrderSelectedDeliveryActions,
  getRentItemDepositAction,
  getRentItemDisplayLabel,
} from "@/utils/rentItems";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useEffect } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
  Platform,
  Image,
} from "react-native";
import { showWarningAlert } from "@/store/utils/alert";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type PaymentMethod = "cash" | "wallet" | "credit";

interface PaymentOption {
  id: PaymentMethod;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}

const paymentOptions: PaymentOption[] = [
  {
    id: "cash",
    label: "Cash",
    icon: "cash-outline",
    description: "Pay with cash on delivery",
  },
  {
    id: "wallet",
    label: "Wallet",
    icon: "wallet-outline",
    description: "Use customer wallet balance",
  },
  {
    id: "credit",
    label: "Credit",
    icon: "receipt-outline",
    description:
      "Payment due at end of month (invoice or delivery note per confirmation)",
  },
];

const sanitizeMoneyInput = (value: string) => {
  const normalized = value.replace(/[^0-9.]/g, "");
  const [whole, ...fractionParts] = normalized.split(".");
  if (fractionParts.length === 0) {
    return whole;
  }
  return `${whole}.${fractionParts.join("")}`;
};

const parseMoneyDraft = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const Checkout: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    selectedOrder,
    assignedOrders,
    cartItems,
    selectedPaymentMethod,
    setPaymentMethod,
    setAssignedOrders,
  } = useOrderStore();

  const orderDetail = assignedOrders.find(
    (item) => selectedOrder === item.id,
  ) as Order | undefined;
  const [creditCollectionAmount, setCreditCollectionAmount] =
    React.useState("");
  const [creditCollectionRemark, setCreditCollectionRemark] =
    React.useState("");
  const selectedDeliveryActions = useMemo(
    () => getOrderSelectedDeliveryActions(orderDetail),
    [orderDetail],
  );

  // Initialize payment method based on requires_signature
  useEffect(() => {
    if (orderDetail) {
      if (orderDetail.requires_signature === true) {
        setPaymentMethod("credit");
      } else {
        setPaymentMethod("cash");
      }
    }
  }, [orderDetail, setPaymentMethod]);

  useEffect(() => {
    const existingDraft = orderDetail?.draft_credit_collections?.[0];
    const draftAmount =
      typeof existingDraft?.amount === "number" &&
      Number.isFinite(existingDraft.amount) &&
      existingDraft.amount > 0
        ? existingDraft.amount.toFixed(2)
        : "";
    const draftRemark =
      typeof existingDraft?.remark === "string" ? existingDraft.remark : "";

    setCreditCollectionAmount(draftAmount);
    setCreditCollectionRemark(draftRemark);
  }, [orderDetail?.draft_credit_collections, orderDetail?.id]);

  const handleChangeCreditCollectionAmount = useCallback((value: string) => {
    setCreditCollectionAmount(sanitizeMoneyInput(value));
  }, []);

  const handleBack = useCallback(() => {
    router.replace({
      pathname: "/(root)/(tabs)/bottles-assets",
      params: { backTo: "add-products" },
    });
  }, [router]);

  const handleEditItems = useCallback(() => {
    router.push({
      pathname: "/(root)/(tabs)/add-products",
      params: { backTo: "checkout" },
    });
  }, [router]);

  const handleEditBottlesAssets = useCallback(() => {
    router.push({
      pathname: "/(root)/(tabs)/bottles-assets",
      params: { backTo: "checkout" },
    });
  }, [router]);

  const parsedCreditCollectionAmount = useMemo(
    () => parseMoneyDraft(creditCollectionAmount),
    [creditCollectionAmount],
  );
  const normalizedCreditCollectionRemark = useMemo(
    () => creditCollectionRemark.trim(),
    [creditCollectionRemark],
  );
  const hasCreditCollectionInput = useMemo(
    () =>
      creditCollectionAmount.trim().length > 0 ||
      normalizedCreditCollectionRemark.length > 0,
    [creditCollectionAmount, normalizedCreditCollectionRemark],
  );
  const hasCreditCollectionDraft = useMemo(
    () =>
      parsedCreditCollectionAmount !== null && parsedCreditCollectionAmount > 0,
    [parsedCreditCollectionAmount],
  );
  const hasIncompleteCreditCollection = useMemo(
    () => hasCreditCollectionInput && !hasCreditCollectionDraft,
    [hasCreditCollectionDraft, hasCreditCollectionInput],
  );
  const selectedCreditCollections = useMemo(
    () =>
      hasCreditCollectionDraft && parsedCreditCollectionAmount !== null
        ? [
            {
              amount: Number(parsedCreditCollectionAmount.toFixed(2)),
              ...(normalizedCreditCollectionRemark
                ? { remark: normalizedCreditCollectionRemark }
                : {}),
            },
          ]
        : [],
    [
      hasCreditCollectionDraft,
      normalizedCreditCollectionRemark,
      parsedCreditCollectionAmount,
    ],
  );

  const {
    subtotal,
    vat,
    totalWithVat,
    itemCount,
    rentItemsTotal,
    hasRentItemsSelected,
  } = useMemo(() => {
    // Calculate regular products subtotal (with VAT)
    const sub = cartItems.reduce((sum, item) => {
      if (
        !item ||
        typeof item.price !== "number" ||
        typeof item.quantity !== "number"
      ) {
        return sum;
      }
      return sum + item.price * item.quantity;
    }, 0);
    const vatAmount = sub * 0.05;

    // Calculate bottle/asset movement total (no VAT) for selected actions.
    const rentTotal =
      selectedDeliveryActions.reduce((sum, item) => {
        if (item.in_truck) {
          return sum + (item.price || 0) * (item.quantity || 1);
        }
        return sum;
      }, 0) || 0;

    // Check if any bottle/asset actions are selected.
    const hasRentItems = selectedDeliveryActions.some(
      (item) => item.in_truck === true,
    );

    // Sale total excludes bottle/asset deposits and returns. Those movements are
    // recorded separately and must not affect sale totals or payment amount.
    const total = sub + vatAmount;
    const count = cartItems.reduce(
      (sum, item) => sum + (item?.quantity || 0),
      0,
    );

    return {
      subtotal: sub.toFixed(2),
      vat: vatAmount.toFixed(2),
      totalWithVat: total.toFixed(2),
      itemCount: count,
      rentItemsTotal: rentTotal.toFixed(2),
      hasRentItemsSelected: hasRentItems,
    };
  }, [cartItems, selectedDeliveryActions]);
  const handleContinueToPayment = useCallback(() => {
    // Allow proceeding if products, bottle/asset movement, or credit collection exists.
    if (
      cartItems.length === 0 &&
      !hasRentItemsSelected &&
      !hasCreditCollectionDraft
    ) {
      showWarningAlert(
        "Empty Cart",
        "Please add items, record bottle or asset movement, or record a credit collection.",
      );
      return;
    }

    if (hasIncompleteCreditCollection) {
      showWarningAlert(
        "Credit Collection",
        "Enter a valid amount before saving the credit collection.",
      );
      return;
    }

    if (!selectedPaymentMethod) {
      showWarningAlert("Payment Required", "Please select a payment method.");
      return;
    }

    if (orderDetail) {
      setAssignedOrders(
        assignedOrders.map((order) =>
          order.id === orderDetail.id
            ? {
                ...order,
                draft_credit_collections: selectedCreditCollections,
              }
            : order,
        ),
      );
    }

    // Use requires_signature from order to determine navigation
    const needsSignature = orderDetail?.requires_signature === true;

    // Handle Credit - redirect to signature page (invoice or delivery note per API response)
    if (selectedPaymentMethod === "credit") {
      router.push({
        pathname: "/(root)/(tabs)/organization-signature",
        params: { backTo: "checkout" },
      });
      return;
    }

    // Handle orders that require signature - redirect to signature page (legacy support)
    if (needsSignature) {
      router.push({
        pathname: "/(root)/(tabs)/organization-signature",
        params: { backTo: "checkout" },
      });
      return;
    }

    // Default: go to payment confirmation (for cash, wallet)
    router.push({
      pathname: "/(root)/(tabs)/payment-confirmation",
      params: { backTo: "checkout" },
    });
  }, [
    assignedOrders,
    cartItems,
    hasCreditCollectionDraft,
    hasIncompleteCreditCollection,
    hasRentItemsSelected,
    orderDetail,
    router,
    selectedCreditCollections,
    selectedPaymentMethod,
    setAssignedOrders,
  ]);

  const customerName = orderDetail?.customer_name || "Customer";
  const customerAddress = orderDetail?.customer_address || "—";
  const customerPhone = orderDetail?.customer_phone || "—";
  const customerType = orderDetail?.customer_type || "individual";
  // Ensure walletBalance is always a number (handle string values from API like "0.00")
  const walletBalanceRaw = orderDetail?.wallet_balance ?? 0;
  const walletBalance =
    typeof walletBalanceRaw === "string"
      ? parseFloat(walletBalanceRaw) || 0
      : typeof walletBalanceRaw === "number"
        ? walletBalanceRaw
        : 0;
  const isOrganization = customerType === "organization";
  const canContinue =
    (cartItems.length > 0 ||
      hasRentItemsSelected ||
      hasCreditCollectionDraft) &&
    Boolean(selectedPaymentMethod);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color="#1E40AF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Checkout</Text>
          {orderDetail && (
            <Text style={styles.headerSubtitle}>{customerName}</Text>
          )}
        </View>
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeText}>{itemCount}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Order Items */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Items</Text>
            <TouchableOpacity onPress={handleEditItems} activeOpacity={0.7}>
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>

          {cartItems.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBox}>
                <Ionicons name="cart-outline" size={28} color="#D1D5DB" />
              </View>
              <Text style={styles.emptyText}>No items in cart</Text>
            </View>
          ) : (
            cartItems
              .filter((item) => item?.name)
              .map((item, index) => (
                <View key={item.id}>
                  <View style={styles.itemRow}>
                    <View style={styles.itemIconBox}>
                      {item.image?.uri ? (
                        <Image
                          source={item.image}
                          style={styles.itemImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <Ionicons name="water" size={14} color="#0EA5E9" />
                      )}
                    </View>
                    <View style={styles.itemDetails}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.itemQuantity}>
                        Qty: {item.quantity}
                      </Text>
                    </View>
                    <View style={styles.itemPricing}>
                      <Text style={styles.itemPrice}>
                        AED {(item.price * 1.05 * item.quantity).toFixed(2)}
                      </Text>
                      <Text style={styles.itemUnitPrice}>
                        @ {(item.price * 1.05).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                  {index < cartItems.length - 1 && (
                    <View style={styles.itemDivider} />
                  )}
                </View>
              ))
          )}
        </View>

        {/* Bottle and Asset Movement */}
        {selectedDeliveryActions.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Bottles & Assets</Text>
              <TouchableOpacity
                onPress={handleEditBottlesAssets}
                activeOpacity={0.7}
              >
                <Text style={styles.editLink}>Edit</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.itemsList}>
              {selectedDeliveryActions
                .filter((item) => item.in_truck)
                .map((item, index) => {
                  const isReturnAction =
                    getRentItemDepositAction(item) === "deposit_return";
                  return (
                    <View key={item.id}>
                      <View style={styles.itemRow}>
                        <View style={styles.itemInfo}>
                          <View
                            style={[
                              styles.itemIconBox,
                              isReturnAction
                                ? styles.rentItemIconReturn
                                : styles.rentItemIconDeposit,
                            ]}
                          >
                            <Ionicons
                              name={
                                isReturnAction
                                  ? "arrow-undo-circle"
                                  : "arrow-redo-circle"
                              }
                              size={16}
                              color={isReturnAction ? "#059669" : "#3B82F6"}
                            />
                          </View>
                          <View style={styles.itemDetails}>
                            <Text style={styles.itemName} numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text style={styles.itemCategory}>
                              {getRentItemDisplayLabel(item)} • Qty:{" "}
                              {item.quantity}
                            </Text>
                            {item.serial ? (
                              <Text style={styles.itemCategory}>
                                Serial: {item.serial}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        <Text style={styles.itemPrice}>
                          AED {(item.price * item.quantity).toFixed(2)}
                        </Text>
                      </View>
                      {index <
                        selectedDeliveryActions.filter((item) => item.in_truck)
                          .length -
                          1 && <View style={styles.itemDivider} />}
                    </View>
                  );
                })}
            </View>
          </View>
        )}

        {/* Delivery To */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Deliver To</Text>
          <View style={styles.customerRow}>
            <View style={styles.customerAvatar}>
              <Text style={styles.customerInitial}>
                {customerName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.customerDetails}>
              <Text style={styles.customerName}>{customerName}</Text>
              <Text style={styles.customerPhone}>{customerPhone}</Text>
            </View>
          </View>

          <View style={styles.addressBox}>
            <View style={styles.addressIcon}>
              <Ionicons name="location" size={12} color="#6B7280" />
            </View>
            <Text style={styles.addressText} numberOfLines={2}>
              {customerAddress}
            </Text>
          </View>
        </View>

        {/* Credit Collection */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Credit Collection</Text>
            {hasCreditCollectionDraft ? (
              <View style={styles.collectionBadge}>
                <Text style={styles.collectionBadgeText}>Recorded</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.cardHelperText}>
            Record recovered balance from this stop. This is separate from the
            new sale payment.
          </Text>
          <View style={styles.collectionFields}>
            <View style={styles.collectionField}>
              <Text style={styles.collectionLabel}>Amount</Text>
              <View
                style={[
                  styles.collectionAmountRow,
                  hasIncompleteCreditCollection &&
                    styles.collectionAmountRowError,
                ]}
              >
                <Text style={styles.collectionPrefix}>AED</Text>
                <TextInput
                  style={styles.collectionAmountInput}
                  value={creditCollectionAmount}
                  onChangeText={handleChangeCreditCollectionAmount}
                  placeholder="0.00"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <View style={styles.collectionField}>
              <Text style={styles.collectionLabel}>Remark</Text>
              <TextInput
                style={styles.collectionRemarkInput}
                value={creditCollectionRemark}
                onChangeText={setCreditCollectionRemark}
                placeholder="Reference or note"
                placeholderTextColor="#94A3B8"
              />
            </View>
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
          <View style={styles.paymentContainer}>
            {/* Top Row: Cash, Wallet */}
            <View style={styles.paymentRow}>
              {paymentOptions
                .filter((opt) => ["cash", "wallet"].includes(opt.id))
                .map((option) => {
                  const isSelected = selectedPaymentMethod === option.id;
                  const isWallet = option.id === "wallet";
                  const canUseWallet =
                    isWallet && (walletBalance > 0 || isOrganization);
                  const insufficientBalance =
                    isWallet &&
                    !isOrganization &&
                    walletBalance < parseFloat(totalWithVat);

                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.paymentOption,
                        styles.paymentOptionTop,
                        isSelected && styles.paymentOptionSelected,
                        isWallet &&
                          !canUseWallet &&
                          !isOrganization &&
                          styles.paymentOptionDisabled,
                      ]}
                      onPress={() => {
                        if (isWallet && !canUseWallet && !isOrganization)
                          return;
                        setPaymentMethod(option.id);
                      }}
                      activeOpacity={0.7}
                      disabled={isWallet && !canUseWallet && !isOrganization}
                    >
                      <View
                        style={[
                          styles.paymentIconBox,
                          isSelected && styles.paymentIconBoxSelected,
                          isWallet &&
                            walletBalance < 0 &&
                            styles.paymentIconBoxNegative,
                        ]}
                      >
                        <Ionicons
                          name={option.icon}
                          size={22}
                          color={
                            isSelected
                              ? "#FFFFFF"
                              : isWallet && walletBalance < 0
                                ? "#F97316"
                                : "#6B7280"
                          }
                        />
                      </View>
                      <View style={styles.paymentLabelContainer}>
                        <Text
                          style={[
                            styles.paymentLabel,
                            isSelected && styles.paymentLabelSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                        {isWallet && (
                          <Text
                            style={[
                              styles.walletBalance,
                              walletBalance >= 0
                                ? styles.walletBalancePositive
                                : styles.walletBalanceNegative,
                              insufficientBalance &&
                                !isOrganization &&
                                styles.walletBalanceInsufficient,
                            ]}
                          >
                            AED {walletBalance.toFixed(2)}
                          </Text>
                        )}
                      </View>
                      {isSelected && (
                        <View style={styles.paymentCheck}>
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color="#059669"
                          />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
            </View>

            {/* Bottom Row: Credit (invoice or delivery note per API response) */}
            <View style={[styles.paymentRow, styles.paymentRowBottom]}>
              {paymentOptions
                .filter((opt) => opt.id === "credit")
                .map((option) => {
                  const isSelected = selectedPaymentMethod === option.id;

                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.paymentOption,
                        styles.paymentOptionBottom,
                        isSelected && styles.paymentOptionSelected,
                      ]}
                      onPress={() => setPaymentMethod(option.id)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.paymentIconBox,
                          isSelected && styles.paymentIconBoxSelected,
                        ]}
                      >
                        <Ionicons
                          name={option.icon}
                          size={22}
                          color={isSelected ? "#FFFFFF" : "#6B7280"}
                        />
                      </View>
                      <View style={styles.paymentLabelContainer}>
                        <Text
                          style={[
                            styles.paymentLabel,
                            isSelected && styles.paymentLabelSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </View>
                      {isSelected && (
                        <View style={styles.paymentCheck}>
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color="#059669"
                          />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
            </View>
          </View>
          {isOrganization && walletBalance < 0 && (
            <View style={styles.creditNote}>
              <Ionicons name="information-circle" size={14} color="#F97316" />
              <Text style={styles.creditNoteText}>
                Organization account - credit payment allowed
              </Text>
            </View>
          )}
        </View>

        {/* Summary */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>AED {subtotal}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>VAT (5%)</Text>
            <Text style={styles.summaryValue}>AED {vat}</Text>
          </View>
          {parseFloat(rentItemsTotal) > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Bottles & Assets</Text>
              <Text style={styles.summaryValue}>AED {rentItemsTotal}</Text>
            </View>
          )}
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Sale Total</Text>
            <Text style={styles.totalValue}>AED {totalWithVat}</Text>
          </View>
        </View>

        {/* Action Section */}
        <View style={styles.actionSection}>
          <View style={styles.actionSummary}>
            <Text style={styles.actionLabel}>Sale Total</Text>
            <Text style={styles.actionTotal}>AED {totalWithVat}</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.continueButton,
              !canContinue && styles.continueButtonDisabled,
            ]}
            onPress={handleContinueToPayment}
            disabled={!canContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
            <View
              style={[
                styles.continueArrow,
                !canContinue && styles.continueArrowDisabled,
              ]}
            >
              <Ionicons
                name="arrow-forward"
                size={16}
                color={!canContinue ? "#9CA3AF" : "#1E40AF"}
              />
            </View>
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
    backgroundColor: "#FAFBFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1E40AF",
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "#9CA3AF",
    marginTop: 2,
  },
  cartBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  cartBadgeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  editLink: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563EB",
  },
  cardHelperText: {
    marginTop: -4,
    marginBottom: 14,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
    color: "#64748B",
  },
  collectionBadge: {
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  collectionBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
  },
  collectionFields: {
    gap: 12,
  },
  collectionField: {
    gap: 6,
  },
  collectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  collectionAmountRow: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  collectionAmountRowError: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  collectionPrefix: {
    marginRight: 8,
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
  },
  collectionAmountInput: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  collectionRemarkInput: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "500",
    color: "#0F172A",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 24,
  },
  emptyIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#F9FAFB",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  itemIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#E0F2FE",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    overflow: "hidden",
  },
  itemImage: {
    width: "100%",
    height: "100%",
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1E40AF",
    marginBottom: 2,
  },
  itemQuantity: {
    fontSize: 12,
    color: "#6B7280",
  },
  itemPricing: {
    alignItems: "flex-end",
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E40AF",
  },
  itemUnitPrice: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 2,
  },
  itemDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginLeft: 48,
  },
  itemsList: {
    gap: 0,
  },
  itemInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  itemCategory: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 2,
  },
  rentItemIconBorrow: {
    backgroundColor: "#ECFDF5",
  },
  rentItemIconReturn: {
    backgroundColor: "#ECFDF5",
  },
  rentItemIconDeposit: {
    backgroundColor: "#EFF6FF",
  },
  customerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  customerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  customerInitial: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
  },
  customerDetails: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E40AF",
  },
  customerPhone: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  addressBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
  },
  addressIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  addressText: {
    flex: 1,
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 18,
  },
  paymentContainer: {
    gap: 10,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  paymentRowBottom: {
    justifyContent: "center",
    gap: 7,
  },
  paymentOption: {
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: "transparent",
    position: "relative",
    minHeight: 100,
    justifyContent: "center",
  },
  paymentOptionTop: {
    flex: 1,
    maxWidth: "48%",
  },
  paymentOptionBottom: {
    flex: 0,
    minWidth: "48%",
    maxWidth: "46%",
  },
  paymentOptionSelected: {
    backgroundColor: "#FFFFFF",
    borderColor: "#2563EB",
  },
  paymentOptionDisabled: {
    opacity: 0.5,
  },
  paymentIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  paymentIconBoxSelected: {
    backgroundColor: "#2563EB",
  },
  paymentIconBoxNegative: {
    backgroundColor: "#FFF7ED",
  },
  paymentLabelContainer: {
    alignItems: "center",
  },
  paymentLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  paymentLabelSelected: {
    color: "#1E40AF",
  },
  walletBalance: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 3,
  },
  walletBalancePositive: {
    color: "#059669",
  },
  walletBalanceNegative: {
    color: "#F97316",
  },
  walletBalanceInsufficient: {
    color: "#DC2626",
  },
  paymentCheck: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 2,
  },
  orgBadge: {
    backgroundColor: "#F3E8FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  orgBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#7C3AED",
  },
  creditNote: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    gap: 8,
  },
  creditNoteText: {
    fontSize: 11,
    color: "#92400E",
    flex: 1,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 9,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1E40AF",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 4,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E40AF",
  },
  totalValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E40AF",
  },
  actionSection: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    gap: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  actionSummary: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  actionTotal: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E40AF",
    letterSpacing: -0.5,
  },
  continueButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    height: 52,
    paddingHorizontal: 28,
    borderRadius: 14,
    gap: 10,
  },
  continueButtonDisabled: {
    backgroundColor: "#E5E7EB",
  },
  continueButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  continueArrow: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  continueArrowDisabled: {
    backgroundColor: "#F3F4F6",
  },
});

export default Checkout;
