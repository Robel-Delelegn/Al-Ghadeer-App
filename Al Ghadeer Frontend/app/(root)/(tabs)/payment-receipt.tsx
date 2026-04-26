import { authenticatedFetch } from "@/store/auth";
import { useOrderStore } from "@/store/index";
import { showErrorAlert, showSuccessAlert } from "@/store/utils/alert";
import { Order } from "@/types/order";
import { parseApiResponseWithSoftError } from "@/utils/api";
import {
  type DriverHistoryDetail,
  type DriverSaleInvoiceResponse,
} from "@/utils/driverHistory";
import { normalizeOrderProducts } from "@/utils/orderUtils";
import {
  getOrderSelectedDeliveryActions,
  getRentItemDepositAction,
  getRentItemDepositKind,
} from "@/utils/rentItems";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const IP_ADDRESS = process.env.EXPO_PUBLIC_IP_ADDRESS;

type PrintModule = typeof import("expo-print");

let printModule: PrintModule | null | undefined;

type ReceiptViewMode = "delivery-note" | "invoice";

type DeliveryActionRow = {
  id: string;
  label: string;
  quantity: number;
  unitPrice: number;
  type: "deposit" | "deposit_return";
  depositKind: "asset" | "bottle";
};

type SaleRow = {
  id: string;
  label: string;
  quantity: number;
  unitPrice: number;
};

type CreditCollectionRow = {
  id: string;
  amount: number;
  remark: string | null;
};

const getPrintModule = (): PrintModule | null => {
  if (printModule !== undefined) {
    return printModule;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    printModule = require("expo-print") as PrintModule;
  } catch (error) {
    printModule = null;
    console.error("expo-print is unavailable in this build:", error);
  }

  return printModule;
};

const formatDetailAddress = (detail?: DriverHistoryDetail | null): string => {
  const address = detail?.address;
  if (!address) return "";

  const parts = [
    address.label,
    address.street,
    address.building,
    address.flat,
    address.area,
    address.city,
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);

  return parts.join(", ");
};

const formatDocumentDate = (value?: string | null): string => {
  if (!value) return new Date().toLocaleString("en-GB");

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getDateParts = (
  value?: string | null,
): {
  date: string;
  time: string;
} => {
  const parsed = value ? new Date(value) : new Date();
  const fallback = new Date();
  const target = Number.isNaN(parsed.getTime()) ? fallback : parsed;

  return {
    date: target.toISOString().split("T")[0],
    time: target.toTimeString().split(" ")[0],
  };
};

const formatPaymentMethod = (value: unknown): string => {
  if (value === "wallet") return "Wallet";
  if (value === "check") return "Check";
  if (value === "credit" || value === "invoice" || value === "credit_invoice") {
    return "Credit";
  }
  return "Cash";
};

const formatQuantity = (value: number): string => {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
};

const formatCurrency = (value: number): string => {
  return `AED ${value.toFixed(2)}`;
};

const hasLinePrice = (value: number): boolean => {
  return Number.isFinite(value) && value > 0;
};

const formatOptionalLinePrice = (value: number): string => {
  return hasLinePrice(value) ? formatCurrency(value) : "";
};

const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const toSafeFilePart = (value: string): string => {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
};

const getFallbackRentItemLabel = (
  item: NonNullable<Order["rent_items"]>[number],
): string => {
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const serial =
    typeof item.serial === "string" && item.serial.trim().length > 0
      ? item.serial.trim()
      : null;

  if (name && serial) {
    return `${name} • ${serial}`;
  }

  if (name) {
    return name;
  }

  const kind = getRentItemDepositKind(item) === "bottle" ? "Bottle" : "Asset";
  const action =
    getRentItemDepositAction(item) === "deposit" ? "Deposit" : "Return";
  return `${kind} ${action}`;
};

const getDeliveryActionTypeLabel = (row: DeliveryActionRow): string => {
  const kind = row.depositKind === "bottle" ? "Bottle" : "Asset";
  const action = row.type === "deposit" ? "Deposit" : "Return";
  return `${kind} ${action}`;
};

const buildActionSectionHtml = (rows: DeliveryActionRow[]): string => {
  if (rows.length === 0) {
    return "";
  }

  const hasPricedRows = rows.some((row) => hasLinePrice(row.unitPrice));
  const rowsHtml = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(getDeliveryActionTypeLabel(row))}</td>
          <td>${escapeHtml(row.label)}</td>
          <td class="qty-cell">${escapeHtml(formatQuantity(row.quantity))}</td>
          ${
            hasPricedRows
              ? `<td class="amount-cell">${escapeHtml(formatOptionalLinePrice(row.unitPrice))}</td>`
              : ""
          }
        </tr>
      `,
    )
    .join("");

  return `
    <section class="section">
      <div class="section-title">Deposits &amp; Returns</div>
      <table class="table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Item</th>
            <th class="qty-head">Qty</th>
            ${hasPricedRows ? `<th class="amount-head">Price (No VAT)</th>` : ""}
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </section>
  `;
};

const buildCashCollectionSectionHtml = (
  rows: CreditCollectionRow[],
): string => {
  if (rows.length === 0) {
    return "";
  }

  const rowsHtml = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.remark || "Cash Collection")}</td>
          <td class="amount-cell">${escapeHtml(formatCurrency(row.amount))}</td>
        </tr>
      `,
    )
    .join("");
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);

  return `
    <section class="section">
      <div class="section-title">Cash Collection</div>
      <table class="table">
        <thead>
          <tr>
            <th>Remark</th>
            <th class="amount-head">Amount (No VAT)</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr>
            <td>Total Cash Collection</td>
            <td class="amount-cell">${escapeHtml(formatCurrency(totalAmount))}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  `;
};

const DeliveryNoteInfoRow: React.FC<{
  label: string;
  value: string;
}> = ({ label, value }) => {
  return (
    <View style={styles.deliveryNoteInfoRow}>
      <Text style={styles.deliveryNoteInfoLabel}>{label}</Text>
      <Text style={styles.deliveryNoteInfoValue}>{value}</Text>
    </View>
  );
};

const DeliveryNoteTableSection: React.FC<{
  title: string;
  rows: { id: string; label: string; quantity: number; unitPrice: number }[];
}> = ({ title, rows }) => {
  if (rows.length === 0) {
    return null;
  }

  const hasPricedRows = rows.some((row) => hasLinePrice(row.unitPrice));

  return (
    <View style={styles.invoiceItemsSection}>
      <Text style={styles.deliveryNoteSectionTitle}>{title}</Text>
      <View style={styles.invoiceItemsHeaderRow}>
        <Text
          style={[styles.invoiceItemsHeaderText, styles.invoiceProductCell]}
        >
          Item
        </Text>
        <Text style={[styles.invoiceItemsHeaderText, styles.invoiceQtyCell]}>
          Qty
        </Text>
        {hasPricedRows ? (
          <Text
            style={[
              styles.invoiceItemsHeaderText,
              styles.deliveryNotePriceCell,
            ]}
          >
            Price (No VAT)
          </Text>
        ) : null}
      </View>
      {rows.map((row, index) => (
        <View
          key={row.id}
          style={[
            styles.invoiceItemRow,
            index !== rows.length - 1 && styles.invoiceItemRowBorder,
          ]}
        >
          <Text style={[styles.invoiceItemText, styles.invoiceProductCell]}>
            {row.label}
          </Text>
          <Text style={[styles.invoiceItemText, styles.invoiceQtyCell]}>
            {formatQuantity(row.quantity)}
          </Text>
          {hasPricedRows ? (
            <Text
              style={[styles.invoiceItemText, styles.deliveryNotePriceCell]}
            >
              {formatOptionalLinePrice(row.unitPrice)}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
};

const DeliveryNoteActionSection: React.FC<{
  rows: DeliveryActionRow[];
}> = ({ rows }) => {
  if (rows.length === 0) {
    return null;
  }

  const hasPricedRows = rows.some((row) => hasLinePrice(row.unitPrice));

  return (
    <View style={styles.invoiceItemsSection}>
      <Text style={styles.deliveryNoteSectionTitle}>Deposits & Returns</Text>
      <View style={styles.invoiceItemsHeaderRow}>
        <Text
          style={[styles.invoiceItemsHeaderText, styles.deliveryNoteTypeCell]}
        >
          Type
        </Text>
        <Text
          style={[styles.invoiceItemsHeaderText, styles.invoiceProductCell]}
        >
          Item
        </Text>
        <Text style={[styles.invoiceItemsHeaderText, styles.invoiceQtyCell]}>
          Qty
        </Text>
        {hasPricedRows ? (
          <Text
            style={[
              styles.invoiceItemsHeaderText,
              styles.deliveryNotePriceCell,
            ]}
          >
            Price (No VAT)
          </Text>
        ) : null}
      </View>
      {rows.map((row, index) => (
        <View
          key={row.id}
          style={[
            styles.invoiceItemRow,
            index !== rows.length - 1 && styles.invoiceItemRowBorder,
          ]}
        >
          <Text style={[styles.invoiceItemText, styles.deliveryNoteTypeCell]}>
            {getDeliveryActionTypeLabel(row)}
          </Text>
          <Text style={[styles.invoiceItemText, styles.invoiceProductCell]}>
            {row.label}
          </Text>
          <Text style={[styles.invoiceItemText, styles.invoiceQtyCell]}>
            {formatQuantity(row.quantity)}
          </Text>
          {hasPricedRows ? (
            <Text
              style={[styles.invoiceItemText, styles.deliveryNotePriceCell]}
            >
              {formatOptionalLinePrice(row.unitPrice)}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
};

const DeliveryNoteCashCollectionSection: React.FC<{
  rows: CreditCollectionRow[];
}> = ({ rows }) => {
  if (rows.length === 0) {
    return null;
  }

  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <View style={styles.invoiceItemsSection}>
      <Text style={styles.deliveryNoteSectionTitle}>Cash Collection</Text>
      <View style={styles.invoiceItemsHeaderRow}>
        <Text
          style={[
            styles.invoiceItemsHeaderText,
            styles.invoiceCollectionNoteCell,
          ]}
        >
          Remark
        </Text>
        <Text
          style={[
            styles.invoiceItemsHeaderText,
            styles.invoiceCollectionAmountCell,
          ]}
        >
          Amount
        </Text>
      </View>
      {rows.map((row, index) => (
        <View
          key={row.id}
          style={[
            styles.invoiceItemRow,
            index !== rows.length - 1 && styles.invoiceItemRowBorder,
          ]}
        >
          <Text
            style={[styles.invoiceItemText, styles.invoiceCollectionNoteCell]}
          >
            {row.remark || "Cash Collection"}
          </Text>
          <Text
            style={[
              styles.invoiceItemText,
              styles.invoiceItemTotalText,
              styles.invoiceCollectionAmountCell,
            ]}
          >
            {formatCurrency(row.amount)}
          </Text>
        </View>
      ))}
      <View style={styles.invoiceCollectionTotalRow}>
        <Text
          style={[
            styles.invoiceCollectionTotalText,
            styles.invoiceCollectionNoteCell,
          ]}
        >
          Total (No VAT)
        </Text>
        <Text
          style={[
            styles.invoiceCollectionTotalText,
            styles.invoiceCollectionAmountCell,
          ]}
        >
          {formatCurrency(totalAmount)}
        </Text>
      </View>
    </View>
  );
};

const PaymentReceipt: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ view?: string | string[] }>();
  const {
    selectedOrder,
    assignedOrders,
    completedOrders,
    cartItems,
    selectedPaymentMethod,
    lastConfirmPaymentResponse,
    clearCart,
    setLastConfirmPaymentResponse,
  } = useOrderStore();

  const orderDetail =
    assignedOrders.find((item) => item.id === selectedOrder) ||
    completedOrders.find((item) => item.id === selectedOrder);

  const [isDownloading, setIsDownloading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [generatedInvoice, setGeneratedInvoice] =
    useState<DriverSaleInvoiceResponse | null>(null);

  const printNativeModule = useMemo(() => getPrintModule(), []);
  const paramView = Array.isArray(params.view) ? params.view[0] : params.view;
  const requestedView: ReceiptViewMode =
    paramView === "invoice" ? "invoice" : "delivery-note";

  const matchesConfirmOrder =
    !!lastConfirmPaymentResponse &&
    !!orderDetail &&
    (lastConfirmPaymentResponse.orderId === orderDetail.id ||
      lastConfirmPaymentResponse.order_number === orderDetail.order_number ||
      lastConfirmPaymentResponse.order_number === orderDetail.display_id);

  const confirmationDetail =
    matchesConfirmOrder && lastConfirmPaymentResponse?.detail
      ? lastConfirmPaymentResponse.detail
      : null;

  const shippingDetails = useMemo(
    () => ({
      name:
        confirmationDetail?.customer.name ||
        orderDetail?.customer_name ||
        "N/A",
      address:
        formatDetailAddress(confirmationDetail) ||
        orderDetail?.customer_address ||
        "N/A",
      contact:
        confirmationDetail?.customer.phone ||
        orderDetail?.customer_phone ||
        "N/A",
    }),
    [
      confirmationDetail,
      orderDetail?.customer_address,
      orderDetail?.customer_name,
      orderDetail?.customer_phone,
    ],
  );

  const saleRows = useMemo<SaleRow[]>(() => {
    if (confirmationDetail?.sale?.items?.length) {
      return confirmationDetail.sale.items.map((item) => ({
        id: item.id || item.itemId,
        label: item.label,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      }));
    }

    if (orderDetail?.products) {
      return normalizeOrderProducts(orderDetail.products).productsArray.map(
        (product) => ({
          id: product.id,
          label: product.name,
          quantity: product.quantity,
          unitPrice: typeof product.price === "number" ? product.price : 0,
        }),
      );
    }

    return cartItems
      .filter((item) => item?.name)
      .map((item) => ({
        id: item.id,
        label: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
      }));
  }, [cartItems, confirmationDetail?.sale?.items, orderDetail?.products]);

  const deliveryActionRows = useMemo<DeliveryActionRow[]>(() => {
    if (confirmationDetail?.depositReturns?.length) {
      return confirmationDetail.depositReturns.map((entry) => ({
        id: entry.id,
        label: entry.label,
        quantity: entry.quantity,
        unitPrice: entry.unitPrice,
        type: entry.type,
        depositKind: entry.depositKind,
      }));
    }

    return getOrderSelectedDeliveryActions(orderDetail)
      .filter((item) => (item.quantity || 0) > 0)
      .map((item) => ({
        id: item.id,
        label: getFallbackRentItemLabel(item),
        quantity: item.quantity,
        unitPrice: typeof item.price === "number" ? item.price : 0,
        type: getRentItemDepositAction(item),
        depositKind: getRentItemDepositKind(item),
      }));
  }, [confirmationDetail?.depositReturns, orderDetail]);

  const creditCollectionRows = useMemo<CreditCollectionRow[]>(() => {
    if (confirmationDetail?.creditCollections?.length) {
      return confirmationDetail.creditCollections.flatMap((entry, index) => {
        const amount = Number(entry.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          return [];
        }

        const remark =
          typeof entry.remark === "string" ? entry.remark.trim() : "";

        return [
          {
            id: entry.id || `cash-collection-${index}`,
            amount,
            remark: remark || null,
          },
        ];
      });
    }

    return (orderDetail?.draft_credit_collections ?? []).flatMap(
      (entry, index) => {
        const amount = Number(entry.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          return [];
        }

        const remark =
          typeof entry.remark === "string" ? entry.remark.trim() : "";

        return [
          {
            id: `cash-collection-${index}`,
            amount,
            remark: remark || null,
          },
        ];
      },
    );
  }, [
    confirmationDetail?.creditCollections,
    orderDetail?.draft_credit_collections,
  ]);

  const computedSubtotal = useMemo(
    () =>
      saleRows.reduce((sum, row) => {
        return sum + row.unitPrice * row.quantity;
      }, 0),
    [saleRows],
  );

  const subtotalAmount =
    confirmationDetail?.sale?.totals.subtotal ?? computedSubtotal;
  const vatAmount =
    confirmationDetail?.sale?.totals.vat ?? computedSubtotal * 0.05;
  const totalAmount =
    confirmationDetail?.sale?.totals.total ?? subtotalAmount + vatAmount;

  const invoiceNumber =
    generatedInvoice?.displayId ||
    (matchesConfirmOrder
      ? lastConfirmPaymentResponse?.invoice_number
      : orderDetail?.invoice_number) ||
    confirmationDetail?.sale?.invoice?.displayId ||
    "";
  const hasInvoiceNumber = invoiceNumber.trim().length > 0;
  const currentView: ReceiptViewMode =
    requestedView === "invoice" && hasInvoiceNumber
      ? "invoice"
      : "delivery-note";
  const isDeliveryNote = currentView === "delivery-note";

  const saleId =
    lastConfirmPaymentResponse?.sale_id ||
    confirmationDetail?.sale?.saleId ||
    "";
  const canOpenInvoice = Boolean(hasInvoiceNumber || saleId);

  const referenceNumber =
    confirmationDetail?.displayId ||
    orderDetail?.display_id ||
    orderDetail?.order_number ||
    lastConfirmPaymentResponse?.order_number ||
    "—";
  const documentTimestampSource =
    generatedInvoice?.createdAt ||
    confirmationDetail?.sale?.invoice?.createdAt ||
    confirmationDetail?.createdAt ||
    orderDetail?.date ||
    null;
  const documentTimestamp = formatDocumentDate(documentTimestampSource);
  const { date: invoiceDateLabel, time: invoiceTimeLabel } = useMemo(
    () => getDateParts(documentTimestampSource),
    [documentTimestampSource],
  );
  const receiverName = confirmationDetail?.receiver?.name || "—";
  const receiverPosition = confirmationDetail?.receiver?.position || "—";
  const documentRemark =
    confirmationDetail?.remark || orderDetail?.delivery_instructions || null;
  const deliveryKindLabel =
    confirmationDetail?.kind === "adhoc_delivery"
      ? "Direct Sale"
      : "Scheduled Delivery";
  const hasReceiverName = receiverName.trim() !== "—";
  const receiverDisplayName = hasReceiverName ? receiverName : "Not recorded";
  const hasReceiverPosition = receiverPosition.trim() !== "—";
  const hasContact = shippingDetails.contact.trim() !== "N/A";
  const hasAddress = shippingDetails.address.trim() !== "N/A";
  const hasRemark =
    typeof documentRemark === "string" && documentRemark.trim().length > 0;
  const paymentMethodDisplay = formatPaymentMethod(
    generatedInvoice
      ? confirmationDetail?.sale?.payment?.method || selectedPaymentMethod
      : confirmationDetail?.sale?.payment?.method ||
          orderDetail?.payment_method ||
          selectedPaymentMethod,
  );

  const persistInvoiceInStore = useCallback(
    (invoice: DriverSaleInvoiceResponse) => {
      setGeneratedInvoice(invoice);

      if (lastConfirmPaymentResponse) {
        setLastConfirmPaymentResponse({
          ...lastConfirmPaymentResponse,
          invoice_number: invoice.displayId,
          detail: confirmationDetail?.sale
            ? {
                ...confirmationDetail,
                sale: {
                  ...confirmationDetail.sale,
                  invoice: {
                    id: invoice.id,
                    displayId: invoice.displayId,
                    totalAmount: invoice.totalAmount,
                    createdAt: invoice.createdAt,
                    isPaid: invoice.isPaid,
                    hasPendingPayment: invoice.hasPendingPayment,
                    remark: invoice.remark,
                  },
                },
              }
            : lastConfirmPaymentResponse.detail || null,
        });
      }

      const matchesOrder = (order: Order) => {
        if (selectedOrder && order.id === selectedOrder) return true;
        if (!lastConfirmPaymentResponse) return false;
        return (
          order.id === lastConfirmPaymentResponse.orderId ||
          order.order_number === lastConfirmPaymentResponse.order_number ||
          order.display_id === lastConfirmPaymentResponse.order_number
        );
      };

      useOrderStore.setState((state) => ({
        assignedOrders: state.assignedOrders.map((order) =>
          matchesOrder(order)
            ? {
                ...order,
                invoice_number: invoice.displayId,
              }
            : order,
        ),
        completedOrders: state.completedOrders.map((order) =>
          matchesOrder(order)
            ? {
                ...order,
                invoice_number: invoice.displayId,
              }
            : order,
        ),
      }));
    },
    [
      confirmationDetail,
      lastConfirmPaymentResponse,
      selectedOrder,
      setLastConfirmPaymentResponse,
    ],
  );

  const navigateToInvoice = useCallback(() => {
    router.replace({
      pathname: "/(root)/(tabs)/payment-receipt",
      params: { view: "invoice" },
    });
  }, [router]);

  const handleGenerateInvoice = useCallback(async () => {
    if (isGeneratingInvoice) return;

    if (hasInvoiceNumber) {
      navigateToInvoice();
      return;
    }

    if (!saleId) {
      showErrorAlert(
        "Invoice unavailable",
        "This sale does not have an invoice source.",
      );
      return;
    }

    setIsGeneratingInvoice(true);
    try {
      const response = await authenticatedFetch(
        `${IP_ADDRESS}/sales/${encodeURIComponent(saleId)}/invoice`,
        {
          method: "POST",
        },
      );

      const result =
        await parseApiResponseWithSoftError<DriverSaleInvoiceResponse>(
          response,
        );

      if (!result.ok) {
        showErrorAlert(
          "Invoice failed",
          result.error || "Failed to generate invoice. Please try again.",
        );
        return;
      }

      persistInvoiceInStore(result.data);
      navigateToInvoice();
    } catch (error) {
      console.error("Failed to generate invoice:", error);
      showErrorAlert(
        "Invoice failed",
        "Failed to generate invoice. Please try again.",
      );
    } finally {
      setIsGeneratingInvoice(false);
    }
  }, [
    hasInvoiceNumber,
    isGeneratingInvoice,
    navigateToInvoice,
    persistInvoiceInStore,
    saleId,
  ]);

  const handleClose = useCallback(async () => {
    if (isNavigating) return;

    setIsNavigating(true);
    try {
      clearCart();
      setLastConfirmPaymentResponse(null);
      router.replace("/(root)/(tabs)/home");
    } catch (error) {
      console.error("Failed to close document flow:", error);
      router.push("/(root)/(tabs)/home");
    } finally {
      setIsNavigating(false);
    }
  }, [clearCart, isNavigating, router, setLastConfirmPaymentResponse]);

  const generateDeliveryNoteHTML = useCallback(() => {
    const remarkHtml =
      typeof documentRemark === "string" && documentRemark.trim().length > 0
        ? escapeHtml(documentRemark.trim())
        : "";

    const hasPricedSaleRows = saleRows.some((row) =>
      hasLinePrice(row.unitPrice),
    );
    const saleItemColumnCount = hasPricedSaleRows ? 3 : 2;
    const itemsHtml =
      saleRows.length > 0
        ? saleRows
            .map(
              (row) => `
                <tr>
                  <td>${escapeHtml(row.label)}</td>
                  <td class="qty-cell">${escapeHtml(formatQuantity(row.quantity))}</td>
                  ${
                    hasPricedSaleRows
                      ? `<td class="amount-cell">${escapeHtml(formatOptionalLinePrice(row.unitPrice))}</td>`
                      : ""
                  }
                </tr>
              `,
            )
            .join("")
        : `
            <tr>
              <td colspan="${saleItemColumnCount}" class="empty-cell">No sale items recorded.</td>
            </tr>
          `;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Delivery Note - ${escapeHtml(referenceNumber)}</title>
          <style>
            @page {
              margin: 16mm;
            }
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              color: #0f172a;
              background: #ffffff;
              font-size: 12px;
            }
            .page {
              max-width: 760px;
              margin: 0 auto;
              background: #ffffff;
              border: 1px solid #cbd5e1;
            }
            .header {
              padding: 20px 22px 16px;
              border-bottom: 1px solid #cbd5e1;
            }
            .header-row {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 20px;
            }
            .company {
              font-size: 18px;
              font-weight: 700;
              line-height: 1.4;
            }
            .title {
              font-size: 22px;
              font-weight: 700;
              margin: 8px 0 4px;
            }
            .subtitle {
              color: #475569;
              font-size: 12px;
            }
            .ref-box {
              min-width: 180px;
              border: 1px solid #cbd5e1;
              padding: 12px 14px;
            }
            .ref-row + .ref-row {
              margin-top: 10px;
            }
            .ref-label {
              color: #64748b;
              font-size: 11px;
              text-transform: uppercase;
              margin-bottom: 6px;
            }
            .ref-value {
              font-size: 16px;
              font-weight: 700;
            }
            .content {
              padding: 18px 22px 22px;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 12px;
              margin-bottom: 18px;
            }
            .meta-card {
              border: 1px solid #cbd5e1;
              padding: 10px 12px;
            }
            .meta-label {
              color: #64748b;
              font-size: 10px;
              text-transform: uppercase;
              margin-bottom: 4px;
            }
            .meta-value {
              font-size: 13px;
              font-weight: 600;
            }
            .section {
              margin-top: 18px;
            }
            .section-title {
              font-size: 12px;
              font-weight: 700;
              text-transform: uppercase;
              margin-bottom: 8px;
            }
            .detail-box {
              border: 1px solid #cbd5e1;
              padding: 12px;
              line-height: 1.55;
            }
            .detail-row {
              display: flex;
              border-bottom: 1px solid #e2e8f0;
              padding: 8px 0;
            }
            .detail-row:last-child {
              border-bottom: none;
            }
            .detail-term {
              width: 150px;
              color: #475569;
              font-weight: 700;
              padding-right: 12px;
            }
            .detail-value {
              flex: 1;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              border: 1px solid #cbd5e1;
            }
            th {
              text-align: left;
              padding: 10px 12px;
              background: #f8fafc;
              border-bottom: 1px solid #cbd5e1;
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
            }
            td {
              padding: 10px 12px;
              border-bottom: 1px solid #e2e8f0;
              vertical-align: top;
            }
            tr:last-child td {
              border-bottom: none;
            }
            .qty-head,
            .qty-cell {
              width: 90px;
              text-align: center;
            }
            .amount-head,
            .amount-cell {
              width: 130px;
              text-align: right;
            }
            tfoot td {
              font-weight: 700;
              background: #f8fafc;
            }
            .empty-cell {
              text-align: center;
              color: #64748b;
            }
            .remark-box {
              border: 1px solid #cbd5e1;
              padding: 12px;
              line-height: 1.6;
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="header">
              <div class="header-row">
                <div>
                  <div class="company">AL GHADEER DRINKING WATER FACTORY L.L.C</div>
                  <div class="title">Delivery Note</div>
                  <div class="subtitle">${escapeHtml(deliveryKindLabel)}</div>
                </div>
                <div class="ref-box">
                  <div class="ref-row">
                    <div class="ref-label">Reference</div>
                    <div class="ref-value">${escapeHtml(referenceNumber)}</div>
                  </div>
                  <div class="ref-row">
                    <div class="ref-label">Date</div>
                    <div class="ref-value">${escapeHtml(documentTimestamp)}</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="content">
              <div class="meta-grid">
                <div class="meta-card">
                  <div class="meta-label">Customer</div>
                  <div class="meta-value">${escapeHtml(shippingDetails.name)}</div>
                </div>
                <div class="meta-card">
                  <div class="meta-label">Received By</div>
                  <div class="meta-value">${escapeHtml(receiverDisplayName)}</div>
                </div>
              </div>

              <section class="section">
                <div class="section-title">Delivery Details</div>
                <div class="detail-box">
                  ${
                    hasAddress
                      ? `
                          <div class="detail-row">
                            <div class="detail-term">Address</div>
                            <div class="detail-value">${escapeHtml(shippingDetails.address)}</div>
                          </div>
                        `
                      : ""
                  }
                  ${
                    hasContact
                      ? `
                          <div class="detail-row">
                            <div class="detail-term">Phone</div>
                            <div class="detail-value">${escapeHtml(shippingDetails.contact)}</div>
                          </div>
                        `
                      : ""
                  }
                  ${
                    hasReceiverPosition
                      ? `
                          <div class="detail-row">
                            <div class="detail-term">Position</div>
                            <div class="detail-value">${escapeHtml(receiverPosition)}</div>
                          </div>
                        `
                      : ""
                  }
                </div>
              </section>

              <section class="section">
                <div class="section-title">Delivered Items</div>
                <table class="table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th class="qty-head">Qty</th>
                      ${
                        hasPricedSaleRows
                          ? `<th class="amount-head">Price (No VAT)</th>`
                          : ""
                      }
                    </tr>
                  </thead>
                  <tbody>${itemsHtml}</tbody>
                </table>
              </section>

              ${buildActionSectionHtml(deliveryActionRows)}
              ${buildCashCollectionSectionHtml(creditCollectionRows)}
              ${
                remarkHtml
                  ? `
                      <section class="section">
                        <div class="section-title">Remarks</div>
                        <div class="remark-box">${remarkHtml}</div>
                      </section>
                    `
                  : ""
              }
            </div>
          </div>
        </body>
      </html>
    `;
  }, [
    creditCollectionRows,
    deliveryKindLabel,
    documentRemark,
    documentTimestamp,
    deliveryActionRows,
    hasAddress,
    hasContact,
    hasReceiverPosition,
    receiverPosition,
    receiverDisplayName,
    referenceNumber,
    saleRows,
    shippingDetails.address,
    shippingDetails.contact,
    shippingDetails.name,
  ]);

  const generateInvoiceHTML = useCallback(() => {
    const itemsHtml =
      saleRows.length > 0
        ? saleRows
            .map((row) => {
              const priceExVat = row.unitPrice;
              const itemVatTotal = priceExVat * 0.05 * row.quantity;
              const itemTotal = (priceExVat + priceExVat * 0.05) * row.quantity;

              return `
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 6px; text-align: left; font-size: 11px;">${escapeHtml(row.label)}</td>
                  <td style="padding: 6px; text-align: center; font-size: 11px;">${escapeHtml(formatQuantity(row.quantity))}</td>
                  <td style="padding: 6px; text-align: right; font-size: 11px;">${priceExVat.toFixed(2)}</td>
                  <td style="padding: 6px; text-align: right; font-size: 11px;">${itemVatTotal.toFixed(2)}</td>
                  <td style="padding: 6px; text-align: right; font-size: 11px; font-weight: bold;">${itemTotal.toFixed(2)}</td>
                </tr>
              `;
            })
            .join("")
        : `
            <tr>
              <td colspan="5" style="padding: 12px; text-align:center; color:#64748b;">No sale items recorded.</td>
            </tr>
          `;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Invoice - ${escapeHtml(invoiceNumber || referenceNumber)}</title>
          <style>
            body {
              font-family: 'Courier New', monospace;
              margin: 0;
              padding: 10px;
              color: #000;
              background: white;
              font-size: 12px;
              line-height: 1.2;
            }
            .receipt-container {
              max-width: 300px;
              margin: 0 auto;
              background: white;
            }
            .company-header {
              text-align: center;
              margin-bottom: 15px;
              border-bottom: 1px solid #000;
              padding-bottom: 10px;
            }
            .company-name {
              font-size: 14px;
              font-weight: 700;
              margin-bottom: 2px;
            }
            .company-location {
              font-size: 10px;
              margin-bottom: 5px;
            }
            .invoice-title {
              font-size: 12px;
              font-weight: bold;
              text-align: center;
              margin: 10px 0;
            }
            .trn {
              font-size: 10px;
              text-align: center;
              margin-bottom: 15px;
            }
            .info-section {
              margin: 8px 0;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              margin: 3px 0;
              font-size: 11px;
            }
            .info-label {
              font-weight: bold;
            }
            .items-table {
              width: 100%;
              border-collapse: collapse;
              margin: 10px 0;
              font-size: 11px;
            }
            .items-table th {
              text-align: left;
              padding: 5px 0;
              border-bottom: 1px solid #000;
              font-weight: bold;
            }
            .items-table td {
              padding: 3px 0;
              border-bottom: 1px dotted #ccc;
            }
            .total-section {
              margin-top: 15px;
              border-top: 1px solid #000;
              padding-top: 10px;
            }
            .total-row {
              display: flex;
              justify-content: space-between;
              margin: 3px 0;
              font-size: 11px;
            }
            .final-total {
              font-weight: bold;
              font-size: 12px;
              border-top: 1px solid #000;
              padding-top: 5px;
              margin-top: 5px;
            }
            .contact-section {
              margin-top: 20px;
              text-align: center;
              font-size: 10px;
              border-top: 1px solid #000;
              padding-top: 10px;
            }
            .contact-row {
              margin: 2px 0;
            }
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="company-header">
              <div class="company-name">Al Ghadeer DRINKING WATER FACTORY L.L.C</div>
              <div class="company-location">Al Ain, UAE</div>
            </div>

            <div class="invoice-title">Tax Invoice</div>
            <div class="trn">TRN: 100234134300003</div>

            <div class="info-section">
              <div class="info-row">
                <span class="info-label">Date:</span>
                <span>${invoiceDateLabel}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Time:</span>
                <span>${invoiceTimeLabel}</span>
              </div>
              <div class="info-row">
                <span class="info-label">User:</span>
                <span>Driver</span>
              </div>
              <div class="info-row">
                <span class="info-label">Invoice No:</span>
                <span>${escapeHtml(invoiceNumber || "—")}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Customer:</span>
                <span>${escapeHtml(shippingDetails.name || "N/A")}</span>
              </div>
            </div>

            <div class="info-section">
              <div class="info-row">
                <span class="info-label">Customer TRN:</span>
                <span></span>
              </div>
              <div class="info-row">
                <span class="info-label">Payment Mode:</span>
                <span>${escapeHtml(paymentMethodDisplay)}</span>
              </div>
            </div>

            <table class="items-table">
                <thead>
                  <tr>
                    <th style="text-align: left;">Product</th>
                    <th style="text-align: center;">Qty</th>
                    <th style="text-align: right;">Price (ex VAT)</th>
                    <th style="text-align:right;">VAT</th>
                    <th style="text-align:right;">Total</th>
                  </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
            </table>

            <div class="total-section">
              <div class="total-row">
                <span>Subtotal (Excluding VAT):</span>
                <span>${subtotalAmount.toFixed(2)}</span>
              </div>
              <div class="total-row">
                <span>VAT (5%):</span>
                <span>${vatAmount.toFixed(2)}</span>
              </div>
              <div class="total-row final-total">
                <span>Total (Including VAT):</span>
                <span>${totalAmount.toFixed(2)}</span>
              </div>
            </div>

            <div class="contact-section">
              <div class="contact-row">Tel: +97137211353</div>
              <div class="contact-row">Website: www.alghadeerwater.com</div>
              <div class="contact-row">Email: Info@alghadeerwater.com</div>
            </div>
          </div>
        </body>
      </html>
    `;
  }, [
    invoiceNumber,
    invoiceDateLabel,
    invoiceTimeLabel,
    paymentMethodDisplay,
    referenceNumber,
    saleRows,
    shippingDetails.name,
    subtotalAmount,
    totalAmount,
    vatAmount,
  ]);

  const handleDownloadDocument = useCallback(async () => {
    if (isDownloading) return;
    if (!printNativeModule) {
      showErrorAlert(
        "Download unavailable",
        "This build is missing Expo Print. Rebuild and reinstall the app.",
      );
      return;
    }

    setIsDownloading(true);
    try {
      const html = isDeliveryNote
        ? generateDeliveryNoteHTML()
        : generateInvoiceHTML();
      const documentType = isDeliveryNote ? "Delivery_Note" : "Invoice";
      const filePart = toSafeFilePart(
        invoiceNumber || referenceNumber || "document",
      );
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

      const { uri } = await printNativeModule.printToFileAsync({
        html,
        base64: false,
      });

      const nextPath = `${FileSystem.documentDirectory}${documentType}_${filePart}_${timestamp}.pdf`;
      await FileSystem.moveAsync({ from: uri, to: nextPath });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(nextPath, {
          mimeType: "application/pdf",
          dialogTitle: `Share ${documentType.replace("_", " ")}`,
          UTI: "com.adobe.pdf",
        });
      } else {
        showSuccessAlert("Document saved", `Saved to ${nextPath}`);
      }
    } catch (error) {
      console.error("Failed to download document:", error);
      showErrorAlert(
        "Download failed",
        `Unable to download the ${isDeliveryNote ? "delivery note" : "invoice"}.`,
      );
    } finally {
      setIsDownloading(false);
    }
  }, [
    generateDeliveryNoteHTML,
    generateInvoiceHTML,
    invoiceNumber,
    isDeliveryNote,
    isDownloading,
    printNativeModule,
    referenceNumber,
  ]);

  const handlePrintDocument = useCallback(async () => {
    if (isPrinting) return;
    if (!printNativeModule) {
      showErrorAlert(
        "Print unavailable",
        "This build is missing Expo Print. Rebuild and reinstall the app.",
      );
      return;
    }

    setIsPrinting(true);
    try {
      const html = isDeliveryNote
        ? generateDeliveryNoteHTML()
        : generateInvoiceHTML();

      await printNativeModule.printAsync({ html });
    } catch (error) {
      console.error("Failed to print document:", error);
      showErrorAlert(
        "Print failed",
        `Unable to print the ${isDeliveryNote ? "delivery note" : "invoice"}.`,
      );
    } finally {
      setIsPrinting(false);
    }
  }, [
    generateDeliveryNoteHTML,
    generateInvoiceHTML,
    isDeliveryNote,
    isPrinting,
    printNativeModule,
  ]);

  const hasDocumentContext = Boolean(
    orderDetail || confirmationDetail || lastConfirmPaymentResponse,
  );

  if (!hasDocumentContext) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Ionicons name="document-text-outline" size={52} color="#94A3B8" />
        <Text style={styles.emptyTitle}>No document found</Text>
        <Text style={styles.emptyText}>
          There is no active delivery note or invoice in progress.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={handleClose}>
          <Text style={styles.primaryButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 16),
          },
        ]}
      >
        <TouchableOpacity
          onPress={handleClose}
          style={styles.headerAction}
          disabled={isNavigating}
        >
          <Ionicons name="close" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {isDeliveryNote ? "Delivery Note" : "Invoice"}
          </Text>
          <Text style={styles.headerSubtitle}>
            {isDeliveryNote
              ? "Review the delivery note and print it if needed."
              : "Invoice generated for the completed sale."}
          </Text>
        </View>
        {isDeliveryNote ? (
          <TouchableOpacity
            style={[
              styles.headerUtilityButton,
              (!printNativeModule || isPrinting) &&
                styles.headerUtilityButtonDisabled,
            ]}
            onPress={handlePrintDocument}
            disabled={!printNativeModule || isPrinting}
            activeOpacity={0.85}
          >
            {isPrinting ? (
              <ActivityIndicator size="small" color="#0F172A" />
            ) : (
              <>
                <Ionicons name="print-outline" size={16} color="#0F172A" />
                <Text style={styles.headerUtilityText}>Print</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom + 132, 148) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {isDeliveryNote ? (
          <View style={styles.invoicePreviewCard}>
            <View style={styles.invoicePreviewHeader}>
              <Text style={styles.invoiceCompanyText}>
                AL GHADEER DRINKING WATER
              </Text>
              <Text style={styles.invoiceCompanyText}>FACTORY L.L.C</Text>
              <Text style={styles.invoiceCompanySubtext}>Al Ain, UAE</Text>
              <Text style={styles.invoiceDocumentTitle}>Delivery Note</Text>
              <Text style={styles.deliveryNoteHeaderSubtext}>
                {deliveryKindLabel}
              </Text>
            </View>

            <View style={styles.invoiceInfoSection}>
              <DeliveryNoteInfoRow label="Date:" value={invoiceDateLabel} />
              <DeliveryNoteInfoRow label="Time:" value={invoiceTimeLabel} />
              <DeliveryNoteInfoRow label="Reference:" value={referenceNumber} />
              <DeliveryNoteInfoRow
                label="Customer:"
                value={shippingDetails.name || "—"}
              />
              <DeliveryNoteInfoRow
                label="Received By:"
                value={receiverDisplayName}
              />
            </View>

            {(hasContact || hasReceiverPosition || hasAddress || hasRemark) && (
              <View style={styles.invoiceInfoSection}>
                {hasContact ? (
                  <DeliveryNoteInfoRow
                    label="Phone:"
                    value={shippingDetails.contact}
                  />
                ) : null}
                {hasReceiverPosition ? (
                  <DeliveryNoteInfoRow
                    label="Receiver Position:"
                    value={receiverPosition}
                  />
                ) : null}
                {hasAddress ? (
                  <DeliveryNoteInfoRow
                    label="Address:"
                    value={shippingDetails.address}
                  />
                ) : null}
                {hasRemark ? (
                  <DeliveryNoteInfoRow
                    label="Remarks:"
                    value={documentRemark || ""}
                  />
                ) : null}
              </View>
            )}

            <DeliveryNoteTableSection
              title="Delivered Items"
              rows={saleRows.map((row) => ({
                id: row.id,
                label: row.label,
                quantity: row.quantity,
                unitPrice: row.unitPrice,
              }))}
            />
            <DeliveryNoteActionSection rows={deliveryActionRows} />
            <DeliveryNoteCashCollectionSection rows={creditCollectionRows} />

            {saleRows.length === 0 &&
            deliveryActionRows.length === 0 &&
            creditCollectionRows.length === 0 ? (
              <Text style={styles.placeholderText}>
                No delivery items were recorded in the confirmation response.
              </Text>
            ) : null}

            <View style={styles.invoiceContactSection}>
              <Text style={styles.invoiceContactText}>Tel: +97137211353</Text>
              <Text style={styles.invoiceContactText}>
                Website: www.alghadeerwater.com
              </Text>
              <Text style={styles.invoiceContactText}>
                Email: Info@alghadeerwater.com
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.invoicePreviewCard}>
            <View style={styles.invoicePreviewHeader}>
              <Text style={styles.invoiceCompanyText}>
                AL GHADEER DRINKING WATER
              </Text>
              <Text style={styles.invoiceCompanyText}>FACTORY L.L.C</Text>
              <Text style={styles.invoiceCompanySubtext}>Al Ain, UAE</Text>
              <Text style={styles.invoiceDocumentTitle}>Tax Invoice</Text>
              <Text style={styles.invoiceTrnText}>TRN: 100234134300003</Text>
            </View>

            <View style={styles.invoiceInfoSection}>
              <View style={styles.invoiceDetailRow}>
                <Text style={styles.invoiceDetailLabel}>Date:</Text>
                <Text style={styles.invoiceDetailValue}>
                  {invoiceDateLabel}
                </Text>
              </View>
              <View style={styles.invoiceDetailRow}>
                <Text style={styles.invoiceDetailLabel}>Time:</Text>
                <Text style={styles.invoiceDetailValue}>
                  {invoiceTimeLabel}
                </Text>
              </View>
              <View style={styles.invoiceDetailRow}>
                <Text style={styles.invoiceDetailLabel}>User:</Text>
                <Text style={styles.invoiceDetailValue}>Driver</Text>
              </View>
              <View style={styles.invoiceDetailRow}>
                <Text style={styles.invoiceDetailLabel}>Invoice No:</Text>
                <Text style={styles.invoiceDetailValue}>
                  {invoiceNumber || "—"}
                </Text>
              </View>
              <View style={styles.invoiceDetailRow}>
                <Text style={styles.invoiceDetailLabel}>Customer:</Text>
                <Text style={styles.invoiceDetailValue}>
                  {shippingDetails.name || "N/A"}
                </Text>
              </View>
            </View>

            <View style={styles.invoiceInfoSection}>
              <View style={styles.invoiceDetailRow}>
                <Text style={styles.invoiceDetailLabel}>Customer TRN:</Text>
                <Text style={styles.invoiceDetailValue}></Text>
              </View>
              <View style={styles.invoiceDetailRow}>
                <Text style={styles.invoiceDetailLabel}>Payment Mode:</Text>
                <Text style={styles.invoiceDetailValue}>
                  {paymentMethodDisplay}
                </Text>
              </View>
            </View>

            <View style={styles.invoiceItemsSection}>
              <View style={styles.invoiceItemsHeaderRow}>
                <Text
                  style={[
                    styles.invoiceItemsHeaderText,
                    styles.invoiceProductCell,
                  ]}
                >
                  Product
                </Text>
                <Text
                  style={[styles.invoiceItemsHeaderText, styles.invoiceQtyCell]}
                >
                  Qty
                </Text>
                <Text
                  style={[
                    styles.invoiceItemsHeaderText,
                    styles.invoiceAmountCell,
                  ]}
                >
                  Price (ex VAT)
                </Text>
                <Text
                  style={[styles.invoiceItemsHeaderText, styles.invoiceVatCell]}
                >
                  VAT
                </Text>
                <Text
                  style={[
                    styles.invoiceItemsHeaderText,
                    styles.invoiceAmountCell,
                  ]}
                >
                  Total
                </Text>
              </View>

              {saleRows.length > 0 ? (
                saleRows.map((row, index) => {
                  const priceExVat = row.unitPrice;
                  const itemVatTotal = priceExVat * 0.05 * row.quantity;
                  const itemTotal =
                    (priceExVat + priceExVat * 0.05) * row.quantity;

                  return (
                    <View
                      key={row.id}
                      style={[
                        styles.invoiceItemRow,
                        index !== saleRows.length - 1 &&
                          styles.invoiceItemRowBorder,
                      ]}
                    >
                      <Text
                        style={[
                          styles.invoiceItemText,
                          styles.invoiceProductCell,
                        ]}
                      >
                        {row.label}
                      </Text>
                      <Text
                        style={[styles.invoiceItemText, styles.invoiceQtyCell]}
                      >
                        {formatQuantity(row.quantity)}
                      </Text>
                      <Text
                        style={[
                          styles.invoiceItemText,
                          styles.invoiceAmountCell,
                        ]}
                      >
                        AED {priceExVat.toFixed(2)}
                      </Text>
                      <Text
                        style={[styles.invoiceItemText, styles.invoiceVatCell]}
                      >
                        AED {itemVatTotal.toFixed(2)}
                      </Text>
                      <Text
                        style={[
                          styles.invoiceItemText,
                          styles.invoiceItemTotalText,
                          styles.invoiceAmountCell,
                        ]}
                      >
                        AED {itemTotal.toFixed(2)}
                      </Text>
                    </View>
                  );
                })
              ) : (
                <Text style={styles.placeholderText}>
                  No sale items were recorded for this invoice.
                </Text>
              )}
            </View>

            <View style={styles.invoiceTotalsSection}>
              <View style={styles.invoiceDetailRow}>
                <Text style={styles.invoiceSummaryLabel}>
                  Subtotal (Excluding VAT)
                </Text>
                <Text style={styles.invoiceDetailValue}>
                  {formatCurrency(subtotalAmount)}
                </Text>
              </View>
              <View style={styles.invoiceDetailRow}>
                <Text style={styles.invoiceSummaryLabel}>VAT (5%)</Text>
                <Text style={styles.invoiceDetailValue}>
                  {formatCurrency(vatAmount)}
                </Text>
              </View>
              <View
                style={[styles.invoiceDetailRow, styles.invoiceTotalFinalRow]}
              >
                <Text style={styles.invoiceFinalLabel}>
                  Total (Including VAT)
                </Text>
                <Text style={styles.invoiceFinalValue}>
                  {formatCurrency(totalAmount)}
                </Text>
              </View>
            </View>

            <View style={styles.invoiceContactSection}>
              <Text style={styles.invoiceContactText}>Tel: +97137211353</Text>
              <Text style={styles.invoiceContactText}>
                Website: www.alghadeerwater.com
              </Text>
              <Text style={styles.invoiceContactText}>
                Email: Info@alghadeerwater.com
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        {isDeliveryNote ? (
          <>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (!canOpenInvoice || isGeneratingInvoice) &&
                  styles.primaryButtonDisabled,
              ]}
              onPress={handleGenerateInvoice}
              disabled={!canOpenInvoice || isGeneratingInvoice}
              activeOpacity={0.9}
            >
              {isGeneratingInvoice ? (
                <>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.primaryButtonText}>
                    Generating Invoice...
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons
                    name={
                      hasInvoiceNumber
                        ? "document-text-outline"
                        : "add-circle-outline"
                    }
                    size={18}
                    color="#FFFFFF"
                  />
                  <Text style={styles.primaryButtonText}>
                    {hasInvoiceNumber ? "View Invoice" : "Generate Invoice"}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleClose}
              disabled={isNavigating}
              activeOpacity={0.9}
            >
              {isNavigating ? (
                <>
                  <ActivityIndicator color="#0F172A" size="small" />
                  <Text style={styles.secondaryButtonText}>Closing...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="home-outline" size={18} color="#0F172A" />
                  <Text style={styles.secondaryButtonText}>Close</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[
                styles.secondaryButton,
                (!printNativeModule || isDownloading) &&
                  styles.secondaryButtonDisabled,
              ]}
              onPress={handleDownloadDocument}
              disabled={!printNativeModule || isDownloading}
              activeOpacity={0.9}
            >
              {isDownloading ? (
                <>
                  <ActivityIndicator color="#0F172A" size="small" />
                  <Text style={styles.secondaryButtonText}>
                    Preparing PDF...
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="download-outline" size={18} color="#0F172A" />
                  <Text style={styles.secondaryButtonText}>
                    Download Invoice
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.secondaryButton,
                (!printNativeModule || isPrinting) &&
                  styles.secondaryButtonDisabled,
              ]}
              onPress={handlePrintDocument}
              disabled={!printNativeModule || isPrinting}
              activeOpacity={0.9}
            >
              {isPrinting ? (
                <>
                  <ActivityIndicator color="#0F172A" size="small" />
                  <Text style={styles.secondaryButtonText}>
                    Opening Print...
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="print-outline" size={18} color="#0F172A" />
                  <Text style={styles.secondaryButtonText}>Print Invoice</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleClose}
              disabled={isNavigating}
              activeOpacity={0.9}
            >
              {isNavigating ? (
                <>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.primaryButtonText}>Closing...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="home-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Close</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F4F7FB",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerCenter: {
    flex: 1,
    paddingHorizontal: 16,
  },
  headerTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontFamily: "Jakarta-Bold",
  },
  headerSubtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 2,
    lineHeight: 18,
    fontFamily: "Jakarta-Regular",
  },
  headerSpacer: {
    width: 40,
  },
  headerUtilityButton: {
    minWidth: 78,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  headerUtilityButtonDisabled: {
    opacity: 0.6,
  },
  headerUtilityText: {
    color: "#0F172A",
    fontSize: 13,
    fontFamily: "Jakarta-SemiBold",
  },
  content: {
    padding: 20,
    gap: 16,
  },
  notePaper: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E4E9EF",
    padding: 22,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
    elevation: 3,
  },
  notePaperHeader: {
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F6",
    paddingBottom: 16,
  },
  noteHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  noteHeaderBrand: {
    flex: 1,
  },
  notePaperCompany: {
    color: "#212529",
    fontSize: 16,
    marginBottom: 2,
    fontFamily: "Jakarta-Bold",
  },
  noteLocationText: {
    color: "#6C757D",
    fontSize: 12,
    fontFamily: "Jakarta-Regular",
  },
  notePaperTitle: {
    color: "#212529",
    fontSize: 18,
    marginTop: 12,
    fontFamily: "Jakarta-Bold",
  },
  notePaperSubtitle: {
    color: "#6C757D",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
    fontFamily: "Jakarta-Regular",
  },
  noteDocumentBox: {
    width: 148,
    borderWidth: 1,
    borderColor: "#E4E9EF",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#FAFBFD",
  },
  noteDocumentRow: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F5",
  },
  noteDocumentRowLast: {
    borderBottomWidth: 0,
  },
  noteDocumentLabel: {
    color: "#6C757D",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
    fontFamily: "Jakarta-SemiBold",
  },
  noteDocumentValue: {
    color: "#212529",
    fontSize: 12,
    lineHeight: 17,
    fontFamily: "Jakarta-Bold",
  },
  noteMetaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  noteSummaryCell: {
    width: "48.5%",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E7ECF2",
    borderRadius: 14,
    backgroundColor: "#FBFCFD",
  },
  noteSummaryLabel: {
    color: "#6C757D",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 5,
    fontFamily: "Jakarta-SemiBold",
  },
  noteSummaryValue: {
    color: "#212529",
    fontSize: 14,
    lineHeight: 21,
    fontFamily: "Jakarta-Bold",
  },
  noteSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#EEF2F6",
  },
  noteSectionTitle: {
    color: "#0F172A",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
    fontFamily: "Jakarta-Bold",
  },
  noteFieldGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  noteField: {
    width: "48.5%",
    paddingHorizontal: 10,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E9EDF2",
    borderRadius: 14,
    backgroundColor: "#FBFCFD",
  },
  noteFieldFull: {
    width: "100%",
  },
  noteFieldLabel: {
    color: "#64748B",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 5,
    fontFamily: "Jakarta-SemiBold",
  },
  noteFieldValue: {
    color: "#0F172A",
    fontSize: 14,
    lineHeight: 21,
    fontFamily: "Jakarta-SemiBold",
  },
  noteTable: {
    borderWidth: 1,
    borderColor: "#D8E0E8",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  noteTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  noteTableHead: {
    backgroundColor: "#F6F8FA",
  },
  noteTableHeadText: {
    color: "#475569",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontFamily: "Jakarta-SemiBold",
  },
  noteTableLabel: {
    flex: 1,
    color: "#0F172A",
    fontSize: 14,
    lineHeight: 20,
    paddingRight: 12,
    fontFamily: "Jakarta-SemiBold",
  },
  noteActionTypeCell: {
    width: 110,
    color: "#475569",
    fontSize: 12,
    lineHeight: 18,
    paddingRight: 12,
    fontFamily: "Jakarta-SemiBold",
  },
  noteTableQty: {
    width: 68,
    color: "#0F172A",
    fontSize: 14,
    fontFamily: "Jakarta-Bold",
    textAlign: "center",
  },
  notePlaceholder: {
    borderWidth: 1,
    borderColor: "#E4E9EF",
    borderRadius: 14,
    backgroundColor: "#FBFCFD",
    padding: 14,
    marginTop: 18,
  },
  invoicePreviewCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E9ECEF",
    shadowColor: "#1E40AF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  invoicePreviewHeader: {
    alignItems: "center",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E9ECEF",
    paddingBottom: 12,
  },
  invoiceCompanyText: {
    color: "#212529",
    fontSize: 16,
    marginBottom: 2,
    fontFamily: "Jakarta-Bold",
  },
  invoiceCompanySubtext: {
    color: "#6C757D",
    fontSize: 12,
    marginBottom: 8,
    fontFamily: "Jakarta-Regular",
  },
  invoiceDocumentTitle: {
    color: "#212529",
    fontSize: 14,
    fontFamily: "Jakarta-SemiBold",
  },
  deliveryNoteHeaderSubtext: {
    color: "#6C757D",
    fontSize: 12,
    marginTop: 4,
    fontFamily: "Jakarta-Regular",
  },
  invoiceTrnText: {
    color: "#6C757D",
    fontSize: 10,
    marginTop: 2,
    fontFamily: "Jakarta-SemiBold",
  },
  invoiceInfoSection: {
    marginBottom: 16,
  },
  invoiceDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  invoiceDetailLabel: {
    color: "#6C757D",
    fontSize: 11,
    fontFamily: "Jakarta-SemiBold",
  },
  invoiceDetailValue: {
    color: "#212529",
    fontSize: 11,
    textAlign: "right",
    fontFamily: "Jakarta-Bold",
  },
  deliveryNoteInfoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  },
  deliveryNoteInfoLabel: {
    color: "#6C757D",
    fontSize: 11,
    fontFamily: "Jakarta-SemiBold",
  },
  deliveryNoteInfoValue: {
    flex: 1,
    color: "#212529",
    fontSize: 11,
    lineHeight: 18,
    textAlign: "right",
    fontFamily: "Jakarta-Bold",
  },
  invoiceItemsSection: {
    marginBottom: 16,
  },
  invoiceItemsHeaderRow: {
    flexDirection: "row",
    paddingBottom: 6,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E9ECEF",
  },
  invoiceItemsHeaderText: {
    color: "#6C757D",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.2,
    fontFamily: "Jakarta-SemiBold",
  },
  deliveryNoteSectionTitle: {
    color: "#212529",
    fontSize: 12,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.2,
    fontFamily: "Jakarta-Bold",
  },
  invoiceProductCell: {
    flex: 1,
  },
  invoiceQtyCell: {
    width: 35,
    textAlign: "center",
  },
  invoiceVatCell: {
    width: 60,
    textAlign: "right",
  },
  invoiceAmountCell: {
    width: 65,
    textAlign: "right",
  },
  deliveryNotePriceCell: {
    width: 82,
    textAlign: "right",
  },
  invoiceCollectionNoteCell: {
    flex: 1,
    paddingRight: 12,
  },
  invoiceCollectionAmountCell: {
    width: 96,
    textAlign: "right",
  },
  invoiceCollectionTotalRow: {
    flexDirection: "row",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E9ECEF",
  },
  invoiceCollectionTotalText: {
    color: "#212529",
    fontSize: 11,
    fontFamily: "Jakarta-Bold",
  },
  deliveryNoteTypeCell: {
    width: 110,
    color: "#475569",
    paddingRight: 12,
  },
  invoiceItemRow: {
    flexDirection: "row",
    marginBottom: 6,
    paddingBottom: 6,
  },
  invoiceItemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F3F4",
  },
  invoiceItemText: {
    color: "#212529",
    fontSize: 11,
    fontFamily: "Jakarta-Regular",
  },
  invoiceItemTotalText: {
    fontFamily: "Jakarta-SemiBold",
  },
  invoiceTotalsSection: {
    borderTopWidth: 1,
    borderTopColor: "#E9ECEF",
    paddingTop: 12,
  },
  invoiceSummaryLabel: {
    color: "#6C757D",
    fontSize: 11,
    fontFamily: "Jakarta-Regular",
  },
  invoiceTotalFinalRow: {
    borderTopWidth: 1,
    borderTopColor: "#E9ECEF",
    paddingTop: 8,
    marginTop: 4,
  },
  invoiceFinalLabel: {
    color: "#212529",
    fontSize: 13,
    fontFamily: "Jakarta-Bold",
  },
  invoiceFinalValue: {
    color: "#212529",
    fontSize: 13,
    fontFamily: "Jakarta-Bold",
  },
  invoiceContactSection: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#E9ECEF",
    paddingTop: 12,
    alignItems: "center",
  },
  invoiceContactText: {
    color: "#6C757D",
    fontSize: 10,
    marginBottom: 2,
    fontFamily: "Jakarta-Medium",
  },
  deliveryRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  placeholderText: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 21,
    fontFamily: "Jakarta-Regular",
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    gap: 10,
  },
  primaryButton: {
    backgroundColor: "#0284C7",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonDisabled: {
    backgroundColor: "#93C5FD",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Jakarta-SemiBold",
  },
  secondaryButton: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryButtonDisabled: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    color: "#0F172A",
    fontSize: 15,
    fontFamily: "Jakarta-SemiBold",
  },
  emptyTitle: {
    color: "#0F172A",
    fontSize: 22,
    marginTop: 16,
    fontFamily: "Jakarta-Bold",
  },
  emptyText: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 18,
    fontFamily: "Jakarta-Regular",
  },
});

export default PaymentReceipt;
