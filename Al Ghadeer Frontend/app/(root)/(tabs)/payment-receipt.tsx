import { useOrderStore } from '@/store/index';
import { Order } from '@/types/order';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useState } from 'react';
import { Alert, ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';

const PaymentReceipt: React.FC = () => {
  const router = useRouter();
  const { selectedOrder, assignedOrders, cartItems } = useOrderStore();
  const orderDetail = assignedOrders.find(item => selectedOrder === item.id) as Order | undefined;
  
  // Loading states for buttons
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  // Calculate data from current state with safe property access
  const shippingDetails = orderDetail ? {
    name: orderDetail.customer?.name || orderDetail.customer_name || 'N/A',
    address: orderDetail.customer?.address || orderDetail.customer_address || 'N/A',
    contact: orderDetail.customer?.phone || orderDetail.customer_phone || 'N/A'
  } : { name: 'N/A', address: 'N/A', contact: 'N/A' };
  const selectedPaymentMethod = 'Cash';
  // Debug logging
  console.log('Payment Receipt - orderDetail:', orderDetail);
  console.log('Payment Receipt - cartItems:', cartItems);
  console.log('Payment Receipt - shippingDetails:', shippingDetails);
  
  // Calculate totals with safety checks
  const subtotal = cartItems.reduce((sum, item) => {
    if (!item || typeof item.price !== 'number' || typeof item.quantity !== 'number') {
      console.error('Invalid cart item for calculation in receipt:', item);
      return sum;
    }
    return sum + item.price * item.quantity;
  }, 0).toFixed(2);
  const vat = (Number(subtotal) * 0.15).toFixed(2);
  const totalWithVat = (Number(subtotal) + Number(vat)).toFixed(2);
  const orderId = orderDetail?.order_number || 'N/A';
  const paymentDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const generateReceiptHTML = useCallback(() => {
    const itemsHTML = cartItems.map(item => {
      if (!item || !item.name) {
        console.error('Invalid cart item in HTML generation:', item);
        return '';
      }
      const itemTotal = (item.price * item.quantity).toFixed(2);
      return `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px; text-align: left; font-size: 12px;">${item.name || 'Unknown Product'}</td>
          <td style="padding: 8px; text-align: center; font-size: 12px;">${item.quantity || 0}</td>
          <td style="padding: 8px; text-align: right; font-size: 12px;">${item.price || 0}</td>
          <td style="padding: 8px; text-align: right; font-size: 12px; font-weight: bold;">${itemTotal}</td>
        </tr>
      `;
    }).filter(Boolean).join('');

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
              <div class="company-name">Al Ghadeer Water Drinking</div>
              <div class="company-name">Factory</div>
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
                <span>${orderId}</span>
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
                <span>${selectedPaymentMethod}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Customer ID:</span>
                <span>DB-${orderId}</span>
              </div>
            </div>

            <table class="items-table">
              <thead>
                <tr>
                  <th style="text-align: left;">Product</th>
                  <th style="text-align: center;">Qty</th>
                  <th style="text-align: right;">Unit Price</th>
                  <th style="text-align: right;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHTML}
              </tbody>
            </table>

            <div class="total-section">
              <div class="total-row">
                <span>Total Amount:</span>
                <span>${subtotal}</span>
              </div>
              <div class="total-row">
                <span>Vat (15%):</span>
                <span>${vat}</span>
              </div>
              <div class="total-row final-total">
                <span>Net Total (Incl. Vat):</span>
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
  }, [cartItems, shippingDetails, selectedPaymentMethod, subtotal, vat, totalWithVat, orderId]);

  const handleDownloadInvoice = useCallback(async () => {
    if (isDownloading) return; // Prevent multiple simultaneous downloads
    
    setIsDownloading(true);
    try {
      console.log('Starting invoice download...');
      const html = generateReceiptHTML();
      
      // Generate PDF
      const { uri } = await Print.printToFileAsync({ 
        html,
        base64: false,
        width: 300, // Thermal receipt width
        height: 400 // Estimated height
      });
      
      // Create a unique filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const newPath = `${FileSystem.documentDirectory}Invoice_${orderId}_${timestamp}.pdf`;
      
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
          dialogTitle: 'Download Invoice',
          UTI: 'com.adobe.pdf'
        });
        console.log('Invoice shared successfully');
      } else {
        Alert.alert(
          'Invoice Saved', 
          `Invoice has been saved to your device.\nLocation: ${newPath}`,
          [{ text: 'OK', style: 'default' }]
        );
      }
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert(
        'Download Failed', 
        'Unable to download the invoice. Please check your device storage and try again.',
        [{ text: 'OK', style: 'default' }]
      );
    } finally {
      setIsDownloading(false);
    }
  }, [generateReceiptHTML, orderId, isDownloading]);

  const handlePrintInvoice = useCallback(async () => {
    if (isPrinting) return; // Prevent multiple simultaneous print requests
    
    setIsPrinting(true);
    try {
      console.log('Starting invoice print...');
      const html = generateReceiptHTML();
      
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
      Alert.alert(
        'Print Failed', 
        'Unable to open print dialog. Please check your printer connection and try again.',
        [{ text: 'OK', style: 'default' }]
      );
    } finally {
      setIsPrinting(false);
    }
  }, [generateReceiptHTML, isPrinting]);

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
          <Text style={{ color: '#212529', fontSize: 18, fontWeight: '600' }}>Payment Receipt</Text>
          <View style={{ width: 40 }} />
        </View>
        
        {orderDetail && (
          <View style={{ 
            backgroundColor: '#E8F5E8', 
            borderRadius: 8, 
            padding: 12,
            borderWidth: 1,
            borderColor: '#C8E6C9'
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Ionicons name="checkmark-circle" size={16} color="#28A745" />
              <Text style={{ color: '#28A745', fontSize: 14, fontWeight: '600', marginLeft: 6 }}>
                Order #{orderDetail.order_number}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="time" size={14} color="#28A745" />
              <Text style={{ color: '#28A745', fontSize: 12, marginLeft: 6 }}>
                Payment completed successfully
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Content */}
      <ScrollView 
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }} 
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
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2
        }}>
          {/* Company Header */}
          <View style={{ alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E9ECEF', paddingBottom: 12 }}>
            <Text style={{ color: '#212529', fontSize: 16, fontWeight: '700', marginBottom: 2 }}>
              Al Ghadeer Water Drinking
            </Text>
            <Text style={{ color: '#212529', fontSize: 16, fontWeight: '700', marginBottom: 2 }}>
              Factory
            </Text>
            <Text style={{ color: '#6C757D', fontSize: 12, marginBottom: 8 }}>
              Al Ain, UAE
            </Text>
            <Text style={{ color: '#212529', fontSize: 14, fontWeight: '600' }}>
              Tax Invoice
            </Text>
            <Text style={{ color: '#6C757D', fontSize: 10 }}>
              TRN: 100234134300003
            </Text>
          </View>

          {/* Transaction Details */}
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
              <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>User:</Text>
              <Text style={{ color: '#212529', fontSize: 11 }}>Driver</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Invoice No:</Text>
              <Text style={{ color: '#212529', fontSize: 11 }}>{orderId}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Customer:</Text>
              <Text style={{ color: '#212529', fontSize: 11 }}>{shippingDetails.name || 'N/A'}</Text>
            </View>
          </View>

          {/* Order Details */}
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Customer TRN:</Text>
              <Text style={{ color: '#212529', fontSize: 11 }}></Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Order No.:</Text>
              <Text style={{ color: '#212529', fontSize: 11 }}>{orderId}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Payment Mode:</Text>
              <Text style={{ color: '#212529', fontSize: 11 }}>{selectedPaymentMethod}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Customer ID:</Text>
              <Text style={{ color: '#212529', fontSize: 11 }}>DB-{orderId}</Text>
            </View>
          </View>

          {/* Items Table */}
          <View style={{ marginBottom: 16 }}>
            <View style={{ 
              flexDirection: 'row', 
              borderBottomWidth: 1, 
              borderBottomColor: '#E9ECEF', 
              paddingBottom: 4, 
              marginBottom: 8 
            }}>
              <Text style={{ flex: 1, color: '#6C757D', fontSize: 11, fontWeight: '600' }}>Product</Text>
              <Text style={{ width: 40, color: '#6C757D', fontSize: 11, fontWeight: '600', textAlign: 'center' }}>Qty</Text>
              <Text style={{ width: 60, color: '#6C757D', fontSize: 11, fontWeight: '600', textAlign: 'right' }}>Unit Price</Text>
              <Text style={{ width: 60, color: '#6C757D', fontSize: 11, fontWeight: '600', textAlign: 'right' }}>Price</Text>
            </View>
            
            {cartItems.map((item, index) => {
              if (!item || !item.name) return null;
              const itemTotal = (item.price * item.quantity).toFixed(2);
              return (
                <View key={item.id} style={{ 
                  flexDirection: 'row', 
                  marginBottom: 4,
                  borderBottomWidth: index !== cartItems.length - 1 ? 1 : 0,
                  borderBottomColor: '#F1F3F4',
                  paddingBottom: index !== cartItems.length - 1 ? 4 : 0
                }}>
                  <Text style={{ flex: 1, color: '#212529', fontSize: 11 }}>{item.name}</Text>
                  <Text style={{ width: 40, color: '#212529', fontSize: 11, textAlign: 'center' }}>{item.quantity}</Text>
                  <Text style={{ width: 60, color: '#212529', fontSize: 11, textAlign: 'right' }}>{item.price}</Text>
                  <Text style={{ width: 60, color: '#212529', fontSize: 11, fontWeight: '600', textAlign: 'right' }}>{itemTotal}</Text>
                </View>
              );
            })}
          </View>

          {/* Totals */}
          <View style={{ borderTopWidth: 1, borderTopColor: '#E9ECEF', paddingTop: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#6C757D', fontSize: 11 }}>Total Amount:</Text>
              <Text style={{ color: '#212529', fontSize: 11 }}>{subtotal}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#6C757D', fontSize: 11 }}>Vat (15%):</Text>
              <Text style={{ color: '#212529', fontSize: 11 }}>{vat}</Text>
            </View>
            <View style={{ 
              flexDirection: 'row', 
              justifyContent: 'space-between', 
              borderTopWidth: 1, 
              borderTopColor: '#E9ECEF', 
              paddingTop: 8, 
              marginTop: 8 
            }}>
              <Text style={{ color: '#212529', fontSize: 12, fontWeight: '700' }}>Net Total (Incl. Vat):</Text>
              <Text style={{ color: '#212529', fontSize: 12, fontWeight: '700' }}>{totalWithVat}</Text>
            </View>
          </View>

          {/* Contact Info */}
          <View style={{ 
            marginTop: 20, 
            borderTopWidth: 1, 
            borderTopColor: '#E9ECEF', 
            paddingTop: 12, 
            alignItems: 'center' 
          }}>
            <Text style={{ color: '#6C757D', fontSize: 10, marginBottom: 2 }}>Tel: +97137211353</Text>
            <Text style={{ color: '#6C757D', fontSize: 10, marginBottom: 2 }}>Website: www.alghadeerwater.com</Text>
            <Text style={{ color: '#6C757D', fontSize: 10 }}>Email: Info@alghadeerwater.com</Text>
          </View>
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
              shadowColor: '#000',
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
                  Download Invoice
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
              shadowColor: '#000',
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
                  Print Invoice
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
