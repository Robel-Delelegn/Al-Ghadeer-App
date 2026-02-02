import { useOrderStore } from '@/store/index';
import { Order } from '@/types/order';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useState, useEffect } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { showSuccessAlert, showErrorAlert } from '@/store/utils/alert';

const PaymentReceipt: React.FC = () => {
  const router = useRouter();
  const { selectedOrder, assignedOrders, completedOrders, cartItems, selectedPaymentMethod, lastConfirmPaymentResponse } = useOrderStore();
  // Check both assignedOrders and completedOrders since order might have been marked as delivered
  const orderDetail = assignedOrders.find(item => selectedOrder === item.id) || 
                      completedOrders.find(item => selectedOrder === item.id) as Order | undefined;

  // Check if this is rent-items-only (no cart items)
  const isRentItemsOnly = cartItems.length === 0 && orderDetail?.rent_items?.some(item => item.in_truck === true);

  // Loading states for buttons
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  // customer_id = customer.id from OrdersResponse (customer dictionary)
  const shippingDetails = orderDetail ? {
    name: orderDetail.customer_name || 'N/A',
    address: orderDetail.customer_address || 'N/A',
    contact: orderDetail.customer_phone || 'N/A',
    customerId: orderDetail.customer_id ?? '',  // from customer.id - no dummy
  } : { name: 'N/A', address: 'N/A', contact: 'N/A', customerId: '' };
  const customerIdDisplay = shippingDetails.customerId || '—';
  const paymentMethodDisplay = selectedPaymentMethod === 'credit_card' ? 'Credit Card' : 
                                selectedPaymentMethod === 'wallet' ? 'Wallet' : 
                                selectedPaymentMethod === 'credit' ? 'Credit' :
                                ['invoice', 'credit_invoice'].includes(selectedPaymentMethod ?? '') ? 'Credit' :
                                'Cash';
  // Debug logging
  console.log('Payment Receipt - orderDetail:', orderDetail);
  console.log('Payment Receipt - cartItems:', cartItems);
  console.log('Payment Receipt - shippingDetails:', shippingDetails);
  
  // Calculate totals with safety checks
  const productsSubtotal = cartItems.reduce((sum, item) => {
    if (!item || typeof item.price !== 'number' || typeof item.quantity !== 'number') {
      console.error('Invalid cart item for calculation in receipt:', item);
      return sum;
    }
    return sum + item.price * item.quantity;
  }, 0);
  const subtotal = productsSubtotal.toFixed(2);
  const vat = (Number(subtotal) * 0.05).toFixed(2);
  // Rent items are not included in receipt totals
  const totalWithVat = (Number(subtotal) + Number(vat)).toFixed(2);
  const orderId = orderDetail?.order_number || 'N/A';
  // Use invoice_number from ConfirmPaymentResponse - if we have a matching confirm response, use ONLY that
  // Don't fall back to orderDetail.invoice_number when confirm response explicitly has no invoice_number
  const matchesConfirmOrder = orderDetail && lastConfirmPaymentResponse && (
    lastConfirmPaymentResponse.orderId === orderDetail.id ||
    lastConfirmPaymentResponse.order_number === orderDetail.order_number
  );
  // If confirm response matches, use its invoice_number (may be undefined = no invoice = delivery note)
  // Only fall back to orderDetail.invoice_number if no matching confirm response
  const invoiceNumber = matchesConfirmOrder 
    ? (lastConfirmPaymentResponse?.invoice_number || '')
    : (orderDetail?.invoice_number ?? '');
  const invoiceDisplay = invoiceNumber || '—';
  // For credit flow: invoice_number present → Invoice, absent → Delivery Note
  const isCreditFlow = ['credit', 'invoice', 'credit_invoice'].includes(selectedPaymentMethod ?? '');
  const hasInvoiceNumber = !!invoiceNumber;
  const isDeliveryNote = isCreditFlow ? !hasInvoiceNumber : false;
  
  // Debug: log delivery note determination
  console.log('Payment Receipt - isDeliveryNote:', isDeliveryNote, 'isCreditFlow:', isCreditFlow, 'hasInvoiceNumber:', hasInvoiceNumber, 'invoiceNumber:', invoiceNumber, 'matchesConfirmOrder:', matchesConfirmOrder, 'selectedPaymentMethod:', selectedPaymentMethod);
  const paymentDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const generateDeliveryNoteHTML = useCallback(() => {
    // Delivery note: simple list of items delivered, no invoice number, no payment, no amounts
    const itemsWithNumbers = cartItems
      .filter(item => item?.name)
      .map((item, index) => ({
        itemNo: String(index + 1).padStart(2, '0'),
        name: item.name,
        quantity: item.quantity,
      }));

    const itemsHTML = itemsWithNumbers.map(item => {
      const checkboxHTML = Array.from({ length: item.quantity }, () => 
        '<span style="display: inline-block; width: 12px; height: 12px; border: 1px solid #000; margin: 2px;"></span>'
      ).join('');
      return `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 6px; text-align: center; font-size: 11px;">${item.itemNo}</td>
          <td style="padding: 6px; text-align: center; font-size: 11px;"></td>
          <td style="padding: 6px; text-align: left; font-size: 11px;">${item.name}</td>
          <td style="padding: 6px; text-align: center; font-size: 11px;">${checkboxHTML}</td>
        </tr>
      `;
    }).join('');

    const currentDate = new Date();
    const dateStr = currentDate.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Delivery Note - ${orderId}</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              margin: 0; 
              padding: 10px; 
              color: #000; 
              background: white;
              font-size: 11px;
              line-height: 1.3;
            }
            .delivery-container {
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
              font-size: 12px;
              font-weight: bold;
              margin-bottom: 5px;
              color: #0066CC;
            }
            .company-name-arabic {
              font-size: 11px;
              margin-bottom: 5px;
              color: #0066CC;
            }
            .contact-info {
              font-size: 9px;
              margin: 3px 0;
              line-height: 1.4;
            }
            .delivery-note-header {
              text-align: center;
              margin: 15px 0;
              font-size: 14px;
              font-weight: bold;
            }
            .info-section {
              margin: 8px 0;
              font-size: 10px;
            }
            .info-row {
              display: flex;
              margin: 4px 0;
            }
            .info-label {
              min-width: 80px;
              font-weight: bold;
            }
            .items-table {
              width: 100%;
              border-collapse: collapse;
              margin: 15px 0;
              font-size: 10px;
            }
            .items-table th {
              text-align: center;
              padding: 6px 4px;
              border: 1px solid #000;
              font-weight: bold;
              background: #f0f0f0;
            }
            .items-table td {
              padding: 6px 4px;
              border: 1px solid #ccc;
              text-align: center;
            }
            .footer-section {
              margin-top: 20px;
              border-top: 1px solid #000;
              padding-top: 10px;
              font-size: 10px;
            }
            .footer-row {
              margin: 8px 0;
            }
            .signature-section {
              margin-top: 15px;
              display: flex;
              justify-content: space-between;
            }
            .signature-field {
              flex: 1;
              text-align: center;
              margin: 0 5px;
              padding-top: 40px;
              border-top: 1px solid #000;
            }
            .disclaimer {
              margin-top: 15px;
              font-size: 8px;
              line-height: 1.4;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="delivery-container">
            <div class="company-header">
              <div class="company-name">Al Ghadeer Drinking Water Factory L.L.C</div>
              <div class="company-name-arabic">مياه شرب معبأة</div>
              <div class="contact-info">
                <strong>Al Ain Head Office:</strong><br>
                Tel.: 03/7211353, Fax: 03/7216169<br>
                P.O.Box: 80239, U.A.E.
              </div>
              <div class="contact-info">
                <strong>Abu Dhabi Branch:</strong><br>
                Tel.: 02/5551324, Fax: 02/5551325<br>
                P.O.Box: 54272, U.A.E.
              </div>
            </div>

            <div class="delivery-note-header">
              <div>Delivery Note</div>
              <div style="font-size: 12px; margin-top: 3px;">سند تسليم</div>
            </div>

            <div class="info-section">
              <div class="info-row">
                <span class="info-label">Date:</span>
                <span>${dateStr}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Order Ref:</span>
                <span>${orderId}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Delivered to:</span>
                <span>${shippingDetails.name || ''}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Address:</span>
                <span>${shippingDetails.address || ''}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Contact:</span>
                <span>${shippingDetails.contact || ''}</span>
              </div>
              ${orderDetail?.delivery_instructions ? `
              <div class="info-row">
                <span class="info-label">Instructions:</span>
                <span>${orderDetail.delivery_instructions}</span>
              </div>
              ` : ''}
              <div class="info-row" style="margin-top: 8px;">
                <span class="info-label" style="color: #6b7280; font-style: italic;">Payment due (not paid)</span>
              </div>
            </div>

            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 15%;">Item No.<br>رقم الصنف</th>
                  <th style="width: 15%;">Unit<br>الوحدة</th>
                  <th style="width: 45%;">DESCRIPTION<br>التفاصيل</th>
                  <th style="width: 25%;">Qty.<br>الكمية</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHTML}
              </tbody>
            </table>

            <div class="footer-section">
              <div class="footer-row">
                <div>Received the goods in good Condition</div>
                <div style="margin-top: 5px;">استلمت البضاعة اعلاه بحالة جيدة</div>
              </div>
              
              <div class="signature-section">
                <div class="signature-field">
                  <div>Salesman</div>
                </div>
                <div class="signature-field">
                  <div>Stamp</div>
                </div>
                <div class="signature-field">
                  <div>Received By</div>
                </div>
              </div>

              <div class="disclaimer">
                <div>The Factory is not Responsible for any Payment Paid to our Staff Without Receipt Voucher issued by us.</div>
                <div style="margin-top: 5px;">المصنع غير مسؤول عن أي دفعات مالية تسدد لمندوبنا بدون سند استلام نقدية صادر من قبلنا.</div>
                <div style="margin-top: 10px; font-size: 7px;">AGW-AC-FM-05A REV.01</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }, [cartItems, shippingDetails, orderId, orderDetail]);

  const generateReceiptHTML = useCallback(() => {
    const itemsHTML = cartItems.map(item => {
      if (!item || !item.name) {
        console.error('Invalid cart item in HTML generation:', item);
        return '';
      }
      // Calculate price breakdown
      const priceExVat = item.price;
      const vatAmount = priceExVat * 0.05;
      const itemVatTotal = (vatAmount * item.quantity).toFixed(2);
      const itemTotal = ((priceExVat + vatAmount) * item.quantity).toFixed(2);
      
      return `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 6px; text-align: left; font-size: 11px;">${item.name || 'Unknown Product'}</td>
          <td style="padding: 6px; text-align: center; font-size: 11px;">${item.quantity || 0}</td>
          <td style="padding: 6px; text-align: right; font-size: 11px;">${priceExVat.toFixed(2)}</td>
          <td style="padding: 6px; text-align: right; font-size: 11px;">${itemVatTotal}</td>
          <td style="padding: 6px; text-align: right; font-size: 11px; font-weight: bold;">${itemTotal}</td>
        </tr>
      `;
    }).filter(Boolean).join('');

    // Rent items are not shown in receipt
    const rentItemsHTML = '';

    const currentDate = new Date();
    const dateStr = currentDate.toISOString().split('T')[0];
    const timeStr = currentDate.toTimeString().split(' ')[0];

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Tax Invoice - Order ${orderId}</title>
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
              font-weight: bold;
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
                <span>${dateStr}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Time:</span>
                <span>${timeStr}</span>
              </div>
              <div class="info-row">
                <span class="info-label">User:</span>
                <span>Driver</span>
              </div>
              <div class="info-row">
                <span class="info-label">Invoice No:</span>
                <span>${invoiceDisplay}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Customer:</span>
                <span>${shippingDetails.name || 'N/A'}</span>
              </div>
            </div>

            <div class="info-section">
              <div class="info-row">
                <span class="info-label">Customer TRN:</span>
                <span></span>
              </div>
              <div class="info-row">
                <span class="info-label">Order No.:</span>
                <span>${orderId}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Payment Mode:</span>
                <span>${paymentMethodDisplay}</span>
            </div>
              <div class="info-row">
                <span class="info-label">Customer ID:</span>
                <span>${customerIdDisplay}</span>
              </div>
          </div>

            <table class="items-table">
            <thead>
              <tr>
                  <th style="text-align: left;">Product</th>
                  <th style="text-align: center;">Qty</th>
                  <th style="text-align: right;">Price (ex VAT)</th>
                  <th style="text-align: right;">VAT</th>
                  <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHTML}
              ${rentItemsHTML}
            </tbody>
          </table>

          <div class="total-section">
            <div class="total-row">
                <span>Subtotal (Excluding VAT):</span>
                <span>${subtotal}</span>
            </div>
            <div class="total-row">
                <span>VAT (5%):</span>
                <span>${vat}</span>
            </div>
            <div class="total-row final-total">
                <span>Total (Including VAT):</span>
                <span>${totalWithVat}</span>
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
  }, [cartItems, shippingDetails, selectedPaymentMethod, subtotal, vat, totalWithVat, orderId, invoiceDisplay, orderDetail]);

  const handleDownloadInvoice = useCallback(async () => {
    if (isDownloading) return; // Prevent multiple simultaneous downloads
    
    setIsDownloading(true);
    try {
      console.log('Starting document download...');
      const html = isDeliveryNote ? generateDeliveryNoteHTML() : generateReceiptHTML();
      const documentType = isDeliveryNote ? 'Delivery_Note' : 'Invoice';
      
      // Generate PDF
      const { uri } = await Print.printToFileAsync({ 
        html,
        base64: false,
        width: 300, // Thermal receipt width
        height: 400 // Estimated height
      });
      
      // Create a unique filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const newPath = `${FileSystem.documentDirectory}${documentType}_${orderId}_${timestamp}.pdf`;
      
      // Move file to permanent location
      await FileSystem.moveAsync({
        from: uri,
        to: newPath
      });

      console.log('PDF generated successfully:', newPath);

      // Check if sharing is available
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(newPath, {
          mimeType: 'application/pdf',
          dialogTitle: `Download ${documentType}`,
          UTI: 'com.adobe.pdf'
        });
        console.log(`${documentType} shared successfully`);
      } else {
        showSuccessAlert(
          `${documentType} Saved`, 
          `${documentType} has been saved to your device.\nLocation: ${newPath}`
        );
      }
    } catch (error) {
      console.error('Download error:', error);
      showErrorAlert(
        'Download Failed', 
        `Unable to download the ${isDeliveryNote ? 'delivery note' : 'invoice'}. Please check your device storage and try again.`
      );
    } finally {
      setIsDownloading(false);
    }
  }, [generateReceiptHTML, generateDeliveryNoteHTML, isDeliveryNote, orderId, isDownloading]);

  const handlePrintInvoice = useCallback(async () => {
    if (isPrinting) return; // Prevent multiple simultaneous print requests
    
    setIsPrinting(true);
    try {
      console.log('Starting document print...');
      const html = isDeliveryNote ? generateDeliveryNoteHTML() : generateReceiptHTML();
      
      // Try different approaches based on platform
      try {
        // First try: Direct HTML print (should open system print dialog)
        await Print.printAsync({ 
          html: html
        });
        console.log('System print dialog opened successfully');
      } catch (directPrintError) {
        console.log('Direct print failed, trying PDF approach:', directPrintError);
        
        // Second try: Generate PDF and print with URI
        const { uri } = await Print.printToFileAsync({ 
          html: html,
          base64: false
        });
        
        await Print.printAsync({ 
          uri: uri
        });
        console.log('PDF print dialog opened successfully');
      }
      
    } catch (error) {
      console.error('Print error:', error);
      showErrorAlert(
        'Print Failed', 
        'Unable to open print dialog. Please check your printer connection and try again.'
      );
    } finally {
      setIsPrinting(false);
    }
  }, [generateReceiptHTML, generateDeliveryNoteHTML, isDeliveryNote, isPrinting]);

  const handleBackToHome = useCallback(async () => {
    if (isNavigating) return; // Prevent multiple navigation attempts
    
    setIsNavigating(true);
    try {
      console.log('Navigating back to home...');
      
      // Clear any order-related state if needed
      // This ensures a clean state when returning to home
      
      // Navigate to home
      router.replace('/(root)/(tabs)/home');
      
      console.log('Navigation to home completed');
    } catch (error) {
      console.error('Navigation error:', error);
      // Fallback navigation method
    router.push('/(root)/(tabs)/home');
    } finally {
      setIsNavigating(false);
    }
  }, [router, isNavigating]);

  // If rent-items-only, show message and redirect
  useEffect(() => {
    if (isRentItemsOnly) {
      showSuccessAlert(
        'Delivery Confirmed',
        'This delivery contains only rent items. No receipt is available.',
        [{ text: 'OK', onPress: () => router.push('/(root)/(tabs)/home') }]
      );
    }
  }, [isRentItemsOnly, router]);

  if (isRentItemsOnly) {
    
    return (
      <View style={{ flex: 1, backgroundColor: '#F8F9FA', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Ionicons name="checkmark-circle" size={64} color="#28A745" />
        <Text style={{ color: '#212529', fontSize: 18, fontWeight: '600', marginTop: 16, textAlign: 'center' }}>
          Delivery Confirmed
        </Text>
        <Text style={{ color: '#6C757D', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
          This delivery contains only rent items.{'\n'}No receipt is available.
        </Text>
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
        borderBottomColor: '#E9ECEF'
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <TouchableOpacity onPress={handleBackToHome} style={{ padding: 8 }}>
            <Ionicons name="home" size={24} color="#495057" />
            </TouchableOpacity>
          <Text style={{ color: '#212529', fontSize: 18, fontWeight: '600' }}>
            {isDeliveryNote ? 'Delivery Note' : 'Payment Receipt'}
          </Text>
          <View style={{ width: 40 }} />
          </View>
    
        {orderDetail && (
          <View style={{ 
            backgroundColor: isDeliveryNote ? '#FFF8E6' : '#E8F5E8', 
            borderRadius: 8, 
            padding: 12,
            borderWidth: 1,
            borderColor: isDeliveryNote ? '#FFE082' : '#C8E6C9'
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Ionicons name={isDeliveryNote ? 'document-text' : 'checkmark-circle'} size={16} color={isDeliveryNote ? '#F57C00' : '#28A745'} />
              <Text style={{ color: isDeliveryNote ? '#E65100' : '#28A745', fontSize: 14, fontWeight: '600', marginLeft: 6 }}>
                Order #{orderDetail.order_number}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="time" size={14} color={isDeliveryNote ? '#F57C00' : '#28A745'} />
              <Text style={{ color: isDeliveryNote ? '#E65100' : '#28A745', fontSize: 12, marginLeft: 6 }}>
                {isDeliveryNote ? 'Items delivered – Payment due' : 'Payment completed successfully'}
              </Text>
            </View>
          </View>
        )}
              </View>
    
      {/* Content */}
      <ScrollView 
        contentContainerStyle={{ padding: 20, paddingBottom: 150 }} 
        showsVerticalScrollIndicator={false}
      >
        {/* Receipt Preview */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 8, 
          padding: 20, 
          marginBottom: 16,
          borderWidth: 1,
          borderColor: '#E9ECEF',
          shadowColor: '#1E40AF',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2
        }}>
              {/* Company Header */}
          <View style={{ alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E9ECEF', paddingBottom: 12 }}>
            <Text style={{ color: '#212529', fontSize: 16, fontWeight: '700', marginBottom: 2 }}>
              AL GHADEER DRINKING WATER
            </Text>
            <Text style={{ color: '#212529', fontSize: 16, fontWeight: '700', marginBottom: 2 }}>
             FACTORY L.L.C
            </Text>
            <Text style={{ color: '#6C757D', fontSize: 12, marginBottom: 8 }}>
              Al Ain, UAE
            </Text>
            <Text style={{ color: '#212529', fontSize: 14, fontWeight: '600' }}>
              {isDeliveryNote ? 'Delivery Note' : 'Tax Invoice'}
            </Text>
            {!isDeliveryNote && (
              <Text style={{ color: '#6C757D', fontSize: 10 }}>
                TRN: 100234134300003
              </Text>
            )}
          </View>
    
          {isDeliveryNote ? (
            /* Delivery Note: simple summary - items only, no invoice/amounts/payment */
            <>
              <View style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Date:</Text>
                  <Text style={{ color: '#212529', fontSize: 11 }}>{new Date().toISOString().split('T')[0]}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Order Ref:</Text>
                  <Text style={{ color: '#212529', fontSize: 11 }}>{orderId}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Delivered to:</Text>
                  <Text style={{ color: '#212529', fontSize: 11 }}>{shippingDetails.name || 'N/A'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Address:</Text>
                  <Text style={{ color: '#212529', fontSize: 11, flex: 1, textAlign: 'right' }}>{shippingDetails.address || 'N/A'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Contact:</Text>
                  <Text style={{ color: '#212529', fontSize: 11 }}>{shippingDetails.contact || '—'}</Text>
                </View>
                {orderDetail?.delivery_instructions ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Instructions:</Text>
                    <Text style={{ color: '#212529', fontSize: 11, flex: 1, textAlign: 'right' }}>{orderDetail.delivery_instructions}</Text>
                  </View>
                ) : null}
                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F3F4' }}>
                  <Text style={{ color: '#6b7280', fontSize: 11, fontStyle: 'italic' }}>
                    Payment due (not paid)
                  </Text>
                </View>
              </View>
              <View style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E9ECEF', paddingBottom: 6, marginBottom: 8 }}>
                  <Text style={{ flex: 1, color: '#6C757D', fontSize: 10, fontWeight: '600', textTransform: 'uppercase' }}>Item</Text>
                  <Text style={{ width: 50, color: '#6C757D', fontSize: 10, fontWeight: '600', textAlign: 'center', textTransform: 'uppercase' }}>Qty</Text>
                </View>
                {cartItems.map((item, index) => {
                  if (!item || !item.name) return null;
                  return (
                    <View key={item.id} style={{ flexDirection: 'row', marginBottom: 6 }}>
                      <Text style={{ flex: 1, color: '#212529', fontSize: 11 }}>{item.name}</Text>
                      <Text style={{ width: 50, color: '#212529', fontSize: 11, textAlign: 'center' }}>{item.quantity}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          ) : (
            /* Invoice: full receipt with amounts */
            <>
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Date:</Text>
              <Text style={{ color: '#212529', fontSize: 11 }}>{new Date().toISOString().split('T')[0]}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Time:</Text>
              <Text style={{ color: '#212529', fontSize: 11 }}>{new Date().toTimeString().split(' ')[0]}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Invoice No:</Text>
              <Text style={{ color: '#212529', fontSize: 11 }}>{invoiceDisplay}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Customer:</Text>
              <Text style={{ color: '#212529', fontSize: 11 }}>{shippingDetails.name || 'N/A'}</Text>
            </View>
          </View>
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Order No.:</Text>
              <Text style={{ color: '#212529', fontSize: 11 }}>{orderId}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Payment Mode:</Text>
              <Text style={{ color: '#212529', fontSize: 11 }}>{paymentMethodDisplay}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Customer ID:</Text>
              <Text style={{ color: '#212529', fontSize: 11 }}>{customerIdDisplay}</Text>
            </View>
          </View>
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E9ECEF', paddingBottom: 6, marginBottom: 8 }}>
              <Text style={{ flex: 1, color: '#6C757D', fontSize: 10, fontWeight: '600', textTransform: 'uppercase' }}>Product</Text>
              <Text style={{ width: 35, color: '#6C757D', fontSize: 10, fontWeight: '600', textAlign: 'center', textTransform: 'uppercase' }}>Qty</Text>
              <Text style={{ width: 65, color: '#6C757D', fontSize: 10, fontWeight: '600', textAlign: 'right', textTransform: 'uppercase' }}>Price (ex VAT)</Text>
              <Text style={{ width: 60, color: '#6C757D', fontSize: 10, fontWeight: '600', textAlign: 'right', textTransform: 'uppercase' }}>VAT</Text>
              <Text style={{ width: 65, color: '#6C757D', fontSize: 10, fontWeight: '600', textAlign: 'right', textTransform: 'uppercase' }}>Total</Text>
            </View>
            {cartItems.map((item, index) => {
              if (!item || !item.name) return null;
              const priceExVat = item.price;
              const vatAmount = priceExVat * 0.05;
              const itemVatTotal = vatAmount * item.quantity;
              const itemTotal = (priceExVat + vatAmount) * item.quantity;
              return (
                <View key={item.id} style={{ flexDirection: 'row', marginBottom: 6, borderBottomWidth: index !== cartItems.length - 1 ? 1 : 0, borderBottomColor: '#F1F3F4', paddingBottom: index !== cartItems.length - 1 ? 6 : 0 }}>
                  <Text style={{ flex: 1, color: '#212529', fontSize: 11 }}>{item.name}</Text>
                  <Text style={{ width: 35, color: '#212529', fontSize: 11, textAlign: 'center' }}>{item.quantity}</Text>
                  <Text style={{ width: 65, color: '#212529', fontSize: 11, textAlign: 'right' }}>AED {priceExVat.toFixed(2)}</Text>
                  <Text style={{ width: 60, color: '#212529', fontSize: 11, textAlign: 'right' }}>AED {itemVatTotal.toFixed(2)}</Text>
                  <Text style={{ width: 65, color: '#212529', fontSize: 11, fontWeight: '600', textAlign: 'right' }}>AED {itemTotal.toFixed(2)}</Text>
                </View>
              );
            })}
          </View>
          {/* Totals - Invoice only */}
          <View style={{ borderTopWidth: 1, borderTopColor: '#E9ECEF', paddingTop: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#6C757D', fontSize: 11 }}>Subtotal (Excluding VAT):</Text>
              <Text style={{ color: '#212529', fontSize: 11 }}>AED {subtotal}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#6C757D', fontSize: 11 }}>VAT (5%):</Text>
              <Text style={{ color: '#212529', fontSize: 11 }}>AED {vat}</Text>
            </View>
            <View style={{ 
              flexDirection: 'row', 
              justifyContent: 'space-between', 
              borderTopWidth: 1,
              borderTopColor: '#E9ECEF',
              paddingTop: 8,
              marginTop: 4
            }}>
              <Text style={{ color: '#212529', fontSize: 13, fontWeight: '700' }}>Total (Including VAT):</Text>
              <Text style={{ color: '#212529', fontSize: 13, fontWeight: '700' }}>AED {totalWithVat}</Text>
            </View>
          </View>

          {/* Contact Info - Invoice only */}
          <View style={{ marginTop: 20, borderTopWidth: 1, borderTopColor: '#E9ECEF', paddingTop: 12, alignItems: 'center' }}>
            <Text style={{ color: '#6C757D', fontSize: 10, marginBottom: 2 }}>Tel: +97137211353</Text>
            <Text style={{ color: '#6C757D', fontSize: 10, marginBottom: 2 }}>Website: www.alghadeerwater.com</Text>
            <Text style={{ color: '#6C757D', fontSize: 10 }}>Email: Info@alghadeerwater.com</Text>
          </View>
            </>
          )}
              </View>
    
        {/* Action Buttons */}
        <View style={{ gap: 12 }}>
              <TouchableOpacity
            style={{ 
              backgroundColor: isDownloading ? '#E9ECEF' : '#1976D2',
              paddingVertical: 16, 
              paddingHorizontal: 24, 
              borderRadius: 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: isDownloading ? '#E9ECEF' : '#1976D2',
              shadowColor: '#1E40AF',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isDownloading ? 0.05 : 0.1,
              shadowRadius: 8,
              elevation: isDownloading ? 2 : 4
            }}
                onPress={handleDownloadInvoice}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <>
                <ActivityIndicator color="#6C757D" size="small" />
                <Text style={{ color: '#6C757D', fontSize: 16, fontWeight: '600', marginLeft: 8 }}>
                  Downloading...
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="download" size={20} color="white" />
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '600', marginLeft: 8 }}>
                  {isDownloading ? 'Downloading...' : `Download ${isDeliveryNote ? 'Delivery Note' : 'Invoice'}`}
                </Text>
              </>
            )}
              </TouchableOpacity>
    
              <TouchableOpacity
            style={{ 
              paddingVertical: 16, 
              paddingHorizontal: 24, 
              borderRadius: 8,
              borderWidth: 1,
              borderColor: isPrinting ? '#E9ECEF' : '#E9ECEF',
              backgroundColor: isPrinting ? '#F8F9FA' : '#FFFFFF',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#1E40AF',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
              elevation: 2
            }}
                onPress={handlePrintInvoice}
            disabled={isPrinting}
          >
            {isPrinting ? (
              <>
                <ActivityIndicator color="#6C757D" size="small" />
                <Text style={{ color: '#6C757D', fontSize: 16, fontWeight: '600', marginLeft: 8 }}>
                  Printing...
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="print" size={20} color="#6C757D" />
                <Text style={{ color: '#6C757D', fontSize: 16, fontWeight: '600', marginLeft: 8 }}>
                  Print {isDeliveryNote ? 'Delivery Note' : 'Invoice'}
                </Text>
              </>
            )}
              </TouchableOpacity>
    
              <TouchableOpacity
            style={{ 
              paddingVertical: 16, 
              paddingHorizontal: 24, 
              borderRadius: 8,
              backgroundColor: isNavigating ? '#E9ECEF' : '#F8F9FA',
              borderWidth: 1,
              borderColor: '#E9ECEF',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center'
            }}
                onPress={handleBackToHome}
            disabled={isNavigating}
          >
            {isNavigating ? (
              <>
                <ActivityIndicator color="#6C757D" size="small" />
                <Text style={{ color: '#6C757D', fontSize: 16, fontWeight: '600', marginLeft: 8 }}>
                  Loading...
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="home" size={20} color="#6C757D" />
                <Text style={{ color: '#6C757D', fontSize: 16, fontWeight: '600', marginLeft: 8 }}>
                  Back to Home
                </Text>
              </>
            )}
              </TouchableOpacity>
            </View>
      </ScrollView>
        </View>
      );
    };

export default PaymentReceipt;
