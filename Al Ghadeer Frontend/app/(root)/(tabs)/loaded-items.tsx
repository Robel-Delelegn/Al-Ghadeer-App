import { useOrderStore } from '@/store/index';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState, useCallback } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View, ActivityIndicator, RefreshControl } from 'react-native';


const API_BASE_URL = process.env.EXPO_PUBLIC_IP_ADDRESS || process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api'; 

type OperationMode = 'load' | 'unload';

interface Item {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  condition?: 'full' | 'empty' | 'leaked' | 'damaged'; // For unload: empty, leaked, or damaged bottles
  confirmed?: boolean;
}

interface ItemsResponse {
  success: boolean;
  message: string;
  data: Item[];
  requested_at?: string;
}

interface ConfirmationResponse {
  success: boolean;
  message: string;
  agreement?: {
    status: 'agreed' | 'disagreed';
    notes?: string;
    final_items?: Item[];
  };
}

const LoadedItems = () => {
  const router = useRouter();
  const { currentDriver } = useOrderStore();
  
  // Operation mode: 'load' or 'unload'
  const [operationMode, setOperationMode] = useState<OperationMode>('load');
  
  // Items state
  const [items, setItems] = useState<Item[]>([]);
  
  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [hasRequestedItems, setHasRequestedItems] = useState(false);
  const [confirmationStep, setConfirmationStep] = useState<'request' | 'review' | 'agreement'>('request');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [agreementResponse, setAgreementResponse] = useState<ConfirmationResponse['agreement'] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!currentDriver) {
      Alert.alert('Error', 'Driver information not found.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    
    try {
      const endpoint = operationMode === 'load' 
        ? `${API_BASE_URL}/drivers/${currentDriver.id}/loaded-items/request`
        : `${API_BASE_URL}/drivers/${currentDriver.id}/unloaded-items/request`;

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      const data: ItemsResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || `Failed to fetch ${operationMode} items`);
      }

      setItems(Array.isArray(data.data) ? data.data : []);
      setHasRequestedItems(true);
      setConfirmationStep('review');
      return;

      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Dummy data - Different data for load vs unload
      const dummyItems: Item[] = operationMode === 'load' 
        ? [
            {
              id: 'water_5l_001',
              name: '5L Water Bottles',
              quantity: 50,
              unit: 'bottles',
              category: 'Water',
              condition: 'full'
            },
            {
              id: 'water_10l_001',
              name: '10L Water Bottles',
              quantity: 25,
              unit: 'bottles',
              category: 'Water',
              condition: 'full'
            },
            {
              id: 'water_300ml_001',
              name: '300ml Water Bottles',
              quantity: 100,
              unit: 'bottles',
              category: 'Water',
              condition: 'full'
            },
            {
              id: 'dispenser_001',
              name: 'Water Dispensers',
              quantity: 5,
              unit: 'units',
              category: 'Equipment',
              condition: 'full'
            },
            {
              id: 'water_1l_001',
              name: '1L Water Bottles',
              quantity: 75,
              unit: 'bottles',
              category: 'Water',
              condition: 'full'
            }
          ]
        : [
            // Full bottles being returned
            {
              id: 'water_5l_001',
              name: '5L Water Bottles (Full)',
              quantity: 20,
              unit: 'bottles',
              category: 'Water',
              condition: 'full'
            },
            {
              id: 'water_10l_001',
              name: '10L Water Bottles (Full)',
              quantity: 10,
              unit: 'bottles',
              category: 'Water',
              condition: 'full'
            },
            {
              id: 'water_300ml_001',
              name: '300ml Water Bottles (Full)',
              quantity: 40,
              unit: 'bottles',
              category: 'Water',
              condition: 'full'
            },
            // Empty bottles being returned
            {
              id: 'water_5l_empty_001',
              name: '5L Water Bottles (Empty)',
              quantity: 30,
              unit: 'bottles',
              category: 'Water',
              condition: 'empty'
            },
            {
              id: 'water_10l_empty_001',
              name: '10L Water Bottles (Empty)',
              quantity: 15,
              unit: 'bottles',
              category: 'Water',
              condition: 'empty'
            },
            {
              id: 'water_300ml_empty_001',
              name: '300ml Water Bottles (Empty)',
              quantity: 60,
              unit: 'bottles',
              category: 'Water',
              condition: 'empty'
            },
            {
              id: 'water_1l_empty_001',
              name: '1L Water Bottles (Empty)',
              quantity: 35,
              unit: 'bottles',
              category: 'Water',
              condition: 'empty'
            },
            // Leaked bottles being returned
            {
              id: 'water_5l_leaked_001',
              name: '5L Water Bottles (Leaked)',
              quantity: 5,
              unit: 'bottles',
              category: 'Water',
              condition: 'leaked'
            },
            {
              id: 'water_10l_leaked_001',
              name: '10L Water Bottles (Leaked)',
              quantity: 3,
              unit: 'bottles',
              category: 'Water',
              condition: 'leaked'
            },
            {
              id: 'water_300ml_leaked_001',
              name: '300ml Water Bottles (Leaked)',
              quantity: 8,
              unit: 'bottles',
              category: 'Water',
              condition: 'leaked'
            },
            // Damaged bottles being returned
            {
              id: 'water_5l_damaged_001',
              name: '5L Water Bottles (Damaged)',
              quantity: 2,
              unit: 'bottles',
              category: 'Water',
              condition: 'damaged'
            },
            {
              id: 'water_10l_damaged_001',
              name: '10L Water Bottles (Damaged)',
              quantity: 1,
              unit: 'bottles',
              category: 'Water',
              condition: 'damaged'
            },
            {
              id: 'water_300ml_damaged_001',
              name: '300ml Water Bottles (Damaged)',
              quantity: 4,
              unit: 'bottles',
              category: 'Water',
              condition: 'damaged'
            },
            // Equipment
            {
              id: 'dispenser_001',
              name: 'Water Dispensers',
              quantity: 2,
              unit: 'units',
              category: 'Equipment',
              condition: 'full'
            }
          ];

      // Simulate empty response case
      const shouldReturnEmpty = Math.random() < 0.2; 
      
      if (shouldReturnEmpty) {
        setItems([]);
        setHasRequestedItems(true);
        setConfirmationStep('request');
        Alert.alert(
          'No Items Available',
          operationMode === 'load' 
            ? 'Items have not arrived yet or no items are scheduled for loading today.'
            : 'No items are available for unloading or all items have already been unloaded.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      setItems(dummyItems);
      setHasRequestedItems(true);
      setConfirmationStep('review');
      setIsCorrect(null);
      setAgreementResponse(null);
      
      console.log(`${operationMode === 'load' ? 'Loaded' : 'Unloaded'} items received (dummy data):`, dummyItems);
    } catch (error) {
      console.error(`Error fetching ${operationMode} items:`, error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to fetch items. Please try again.';
      setErrorMessage(errorMsg);
      Alert.alert('Error', errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [currentDriver, operationMode]);

  const handleConfirmItems = useCallback(async () => {
    if (!currentDriver) {
      Alert.alert('Error', 'Driver information not found.');
      return;
    }

    if (items.length === 0) {
      Alert.alert('Error', 'No items to confirm.');
      return;
    }

    if (isCorrect === null) {
      Alert.alert('Error', 'Please confirm if the items are correct or not.');
      return;
    }

    setIsConfirming(true);
    setErrorMessage(null);
    
    try {
      // Determine API endpoint based on operation mode
      const endpoint = operationMode === 'load'
        ? `${API_BASE_URL}/drivers/${currentDriver.id}/loaded-items/confirm`
        : `${API_BASE_URL}/drivers/${currentDriver.id}/unloaded-items/confirm`;

      const confirmationData = {
        driver_id: currentDriver.id,
        items: items.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          condition: item.condition
        })),
        is_correct: isCorrect,
        confirmed_at: new Date().toISOString()
      };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirmationData)
      });

      const data: ConfirmationResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || `Failed to confirm ${operationMode} items`);
      }

      setAgreementResponse(data.agreement || null);
      setConfirmationStep('agreement');

      const statusAgreed = data.agreement?.status === 'agreed';

      Alert.alert(
        statusAgreed ? 'Agreement Confirmed' : 'Disagreement Noted',
        data.message || (statusAgreed
          ? `${operationMode === 'load' ? 'Items have been loaded and agreed upon successfully' : 'Items have been unloaded and agreed upon successfully'}`
          : 'Disagreement noted, please contact management'),
        [
          { text: 'OK', onPress: () => resetProcess() }
        ]
      );
      return;
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log(`Sending ${operationMode} confirmation (dummy):`, confirmationData);
      
      // Simulate server response based on isCorrect
      const dummyResponse: ConfirmationResponse = {
        success: true,
        message: isCorrect 
          ? `${operationMode === 'load' ? 'Items have been loaded and agreed upon successfully' : 'Items have been unloaded and agreed upon successfully'}`
          : 'Disagreement noted, please contact management',
        agreement: {
          status: isCorrect ? 'agreed' : 'disagreed',
          notes: isCorrect 
            ? `All items confirmed by management. ${operationMode === 'load' ? 'Items are now in your vehicle.' : 'Items have been returned to warehouse.'}`
            : 'Quantity mismatch detected. Please verify with store manager.',
          final_items: isCorrect ? items : [
            {
              id: 'water_5l_001',
              name: '5L Water Bottles',
              quantity: operationMode === 'load' ? 45 : 28, 
              unit: 'bottles',
              category: 'Water'
            }
          ]
        }
      };
      
      setAgreementResponse(dummyResponse.agreement);
      setConfirmationStep('agreement');
      
      if (dummyResponse.agreement?.status === 'agreed') {
        Alert.alert(
          'Agreement Confirmed',
          dummyResponse.message,
          [
            {
              text: 'OK',
              onPress: () => {
                resetProcess();
              }
            }
          ]
        );
      } else {
        Alert.alert(
          'Disagreement Noted',
          dummyResponse.message,
          [
            {
              text: 'OK',
              onPress: () => {
                resetProcess();
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error(`Error confirming ${operationMode} items:`, error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to confirm items. Please try again.';
      setErrorMessage(errorMsg);
      Alert.alert('Error', errorMsg);
    } finally {
      setIsConfirming(false);
    }
  }, [currentDriver, items, isCorrect, operationMode]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchItems();
    setIsRefreshing(false);
  }, [fetchItems]);

  const resetProcess = useCallback(() => {
    setItems([]);
    setHasRequestedItems(false);
    setConfirmationStep('request');
    setIsCorrect(null);
    setAgreementResponse(null);
    setErrorMessage(null);
  }, []);

  const switchMode = useCallback((mode: OperationMode) => {
    if (mode === operationMode) return;

    resetProcess();
    setOperationMode(mode);
  }, [operationMode, resetProcess]);

  const modeLabel = operationMode === 'load' ? 'Load' : 'Unload';
  const modeColor = operationMode === 'load' ? '#1976D2' : '#F59E0B';
  const modeIcon = operationMode === 'load' ? 'cube' : 'cube-outline';

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      {/* Header */}
      <View style={{ 
        backgroundColor: '#FFFFFF', 
        paddingTop: 60, 
        paddingBottom: 20, 
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#E9ECEF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity 
            onPress={() => router.back()}
            style={{ 
              width: 40, 
              height: 40, 
              borderRadius: 20, 
              backgroundColor: '#F8F9FA', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#212529" />
          </TouchableOpacity>
          
          <Text style={{ color: '#212529', fontSize: 18, fontWeight: '600' }}>
            Items {modeLabel} Confirmation
          </Text>
          
          <View style={{ width: 40 }} />
        </View>

        {/* Mode Selector */}
        <View style={{ 
          flexDirection: 'row', 
          marginTop: 16, 
          backgroundColor: '#F8F9FA', 
          borderRadius: 8, 
          padding: 4 
        }}>
          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 6,
              backgroundColor: operationMode === 'load' ? '#FFFFFF' : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: operationMode === 'load' ? '#000' : 'transparent',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: operationMode === 'load' ? 0.1 : 0,
              shadowRadius: 2,
              elevation: operationMode === 'load' ? 2 : 0
            }}
            onPress={() => switchMode('load')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons 
                name="cube" 
                size={18} 
                color={operationMode === 'load' ? '#1976D2' : '#6C757D'} 
                style={{ marginRight: 6 }}
              />
              <Text style={{ 
                color: operationMode === 'load' ? '#1976D2' : '#6C757D', 
                fontSize: 14, 
                fontWeight: operationMode === 'load' ? '600' : '400' 
              }}>
                Load Items
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 6,
              backgroundColor: operationMode === 'unload' ? '#FFFFFF' : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: operationMode === 'unload' ? '#000' : 'transparent',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: operationMode === 'unload' ? 0.1 : 0,
              shadowRadius: 2,
              elevation: operationMode === 'unload' ? 2 : 0
            }}
            onPress={() => switchMode('unload')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons 
                name="cube-outline" 
                size={18} 
                color={operationMode === 'unload' ? '#F59E0B' : '#6C757D'} 
                style={{ marginRight: 6 }}
              />
              <Text style={{ 
                color: operationMode === 'unload' ? '#F59E0B' : '#6C757D', 
                fontSize: 14, 
                fontWeight: operationMode === 'unload' ? '600' : '400' 
              }}>
                Unload Items
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 200 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Error Message */}
        {errorMessage && (
          <View style={{ 
            backgroundColor: '#FFF3CD', 
            borderRadius: 8, 
            padding: 12, 
            marginBottom: 16,
            borderWidth: 1,
            borderColor: '#FFC107'
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="alert-circle" size={20} color="#F59E0B" style={{ marginRight: 8 }} />
              <Text style={{ color: '#856404', fontSize: 14, flex: 1 }}>
                {errorMessage}
              </Text>
            </View>
          </View>
        )}

        {/* Status Card */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 12, 
          padding: 20, 
          marginBottom: 20,
          borderWidth: 1,
          borderColor: '#E9ECEF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ 
              width: 40, 
              height: 40, 
              backgroundColor: operationMode === 'load' ? '#E3F2FD' : '#FFF3E0', 
              borderRadius: 20, 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginRight: 12 
            }}>
              <Ionicons name={modeIcon} size={20} color={modeColor} />
            </View>
            <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
              {operationMode === 'load' ? "Today's Items to Load" : "Today's Items to Unload"}
            </Text>
          </View>
          
          {confirmationStep === 'request' ? (
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              <Text style={{ color: '#6C757D', fontSize: 14, textAlign: 'center', marginBottom: 16 }}>
                {operationMode === 'load' 
                  ? 'Request today\'s items to load from the server. Items may not have arrived yet.'
                  : 'Request today\'s items to unload from the server. Items may not be ready for unloading yet.'}
              </Text>
              <TouchableOpacity
                style={{ 
                  backgroundColor: modeColor, 
                  paddingHorizontal: 24, 
                  paddingVertical: 12, 
                  borderRadius: 8,
                  flexDirection: 'row',
                  alignItems: 'center'
                }}
                onPress={fetchItems}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="white" style={{ marginRight: 8 }} />
                ) : (
                  <Ionicons 
                    name={operationMode === 'load' ? 'download' : 'arrow-up'} 
                    size={16} 
                    color="white" 
                    style={{ marginRight: 8 }} 
                  />
                )}
                <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>
                  {isLoading ? 'Requesting...' : `Request ${modeLabel} Items`}
                </Text>
              </TouchableOpacity>
            </View>
          ) : confirmationStep === 'review' ? (
            <View>
              <Text style={{ color: '#6C757D', fontSize: 14, marginBottom: 12 }}>
                Review the items below and confirm if they are correct:
              </Text>
              
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <TouchableOpacity
                  style={{ 
                    backgroundColor: isCorrect === true ? '#28A745' : '#E9ECEF', 
                    paddingHorizontal: 16, 
                    paddingVertical: 8, 
                    borderRadius: 6,
                    flex: 1
                  }}
                  onPress={() => setIsCorrect(true)}
                >
                  <Text style={{ 
                    color: isCorrect === true ? 'white' : '#6C757D', 
                    fontSize: 12, 
                    fontWeight: '600', 
                    textAlign: 'center' 
                  }}>
                    ✓ Correct
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={{ 
                    backgroundColor: isCorrect === false ? '#DC3545' : '#E9ECEF', 
                    paddingHorizontal: 16, 
                    paddingVertical: 8, 
                    borderRadius: 6,
                    flex: 1
                  }}
                  onPress={() => setIsCorrect(false)}
                >
                  <Text style={{ 
                    color: isCorrect === false ? 'white' : '#6C757D', 
                    fontSize: 12, 
                    fontWeight: '600', 
                    textAlign: 'center' 
                  }}>
                    ✗ Not Correct
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View>
              <Text style={{ color: '#6C757D', fontSize: 14, marginBottom: 12 }}>
                Agreement Status: {agreementResponse?.status === 'agreed' ? '✅ Agreed' : '❌ Disagreed'}
              </Text>
              {agreementResponse?.notes && (
                <Text style={{ color: '#6C757D', fontSize: 12, fontStyle: 'italic' }}>
                  {agreementResponse.notes}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Items Table */}
        {items.length > 0 && (
          <View style={{ 
            backgroundColor: '#FFFFFF', 
            borderRadius: 12, 
            padding: 16, 
            marginBottom: 20,
            borderWidth: 1,
            borderColor: '#E9ECEF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ 
                width: 40, 
                height: 40, 
                backgroundColor: operationMode === 'load' ? '#FFF3E0' : '#E3F2FD', 
                borderRadius: 20, 
                alignItems: 'center', 
                justifyContent: 'center', 
                marginRight: 12 
              }}>
                <Ionicons name="list" size={20} color={modeColor} />
              </View>
              <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
                {confirmationStep === 'review' 
                  ? `Items to ${modeLabel} & Review` 
                  : `${operationMode === 'load' ? 'Loaded' : 'Unloaded'} Items`}
              </Text>
            </View>

            {/* Table Header */}
            <View style={{ 
              flexDirection: 'row', 
              backgroundColor: '#F8F9FA',
              paddingVertical: 12,
              paddingHorizontal: 8,
              borderRadius: 8,
              marginBottom: 8,
              borderBottomWidth: 2,
              borderBottomColor: modeColor
            }}>
              <View style={{ flex: 3, paddingHorizontal: 4 }}>
                <Text style={{ color: '#495057', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
                  Item Name
                </Text>
              </View>
              <View style={{ flex: 1.2, paddingHorizontal: 4, alignItems: 'center' }}>
                <Text style={{ color: '#495057', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
                  Qty
                </Text>
              </View>
              {operationMode === 'unload' && (
                <View style={{ flex: 1.5, paddingHorizontal: 4, alignItems: 'center' }}>
                  <Text style={{ color: '#495057', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
                    Condition
                  </Text>
                </View>
              )}
            </View>

            {/* Table Rows */}
            <View style={{ gap: 4 }}>
              {items.map((item, index) => {
                // Condition color logic: full=green, empty=yellow, leaked=orange, damaged=red
                const conditionColor = item.condition === 'empty' ? '#FFC107' : 
                                      item.condition === 'leaked' ? '#FD7E14' :
                                      item.condition === 'damaged' ? '#DC3545' : '#28A745';
                const conditionBg = item.condition === 'empty' ? '#FFF3CD' : 
                                   item.condition === 'leaked' ? '#FFE5CC' :
                                   item.condition === 'damaged' ? '#F8D7DA' : '#D4EDDA';
                
                return (
                  <View
                    key={item.id}
                    style={{ 
                      flexDirection: 'row', 
                      alignItems: 'center', 
                      paddingVertical: 12,
                      paddingHorizontal: 8,
                      backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#F8F9FA',
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: '#E9ECEF',
                      minHeight: 50
                    }}
                  >
                    {/* Item Name */}
                    <View style={{ flex: 3, paddingHorizontal: 4 }}>
                      <Text style={{ 
                        color: '#212529', 
                        fontSize: 13, 
                        fontWeight: '600',
                        marginBottom: 2
                      }}>
                        {item.name}
                      </Text>
                      <Text style={{ color: '#6C757D', fontSize: 11 }}>
                        {item.category}
                      </Text>
                    </View>

                    {/* Quantity */}
                    <View style={{ flex: 1.2, paddingHorizontal: 4, alignItems: 'center' }}>
                      <Text style={{ color: '#212529', fontSize: 13, fontWeight: '600' }}>
                        {item.quantity}
                      </Text>
                      <Text style={{ color: '#6C757D', fontSize: 10 }}>
                        {item.unit}
                      </Text>
                    </View>

                    {/* Condition (only for unload) */}
                    {operationMode === 'unload' && (
                      <View style={{ flex: 1.5, paddingHorizontal: 4, alignItems: 'center' }}>
                        <View style={{
                          backgroundColor: conditionBg,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 4,
                          borderWidth: 1,
                          borderColor: conditionColor
                        }}>
                          <Text style={{ 
                            color: conditionColor, 
                            fontSize: 10, 
                            fontWeight: '600',
                            textTransform: 'capitalize'
                          }}>
                            {item.condition || 'full'}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Table Footer - Summary */}
            <View style={{ 
              marginTop: 12,
              paddingTop: 12,
              borderTopWidth: 2,
              borderTopColor: '#E9ECEF'
            }}>
              <Text style={{ color: '#6C757D', fontSize: 12 }}>
                Total Items: <Text style={{ fontWeight: '700', color: '#212529' }}>{items.length}</Text>
              </Text>
              <Text style={{ color: '#6C757D', fontSize: 12, marginTop: 4 }}>
                Total Quantity: <Text style={{ fontWeight: '700', color: '#212529' }}>
                  {items.reduce((sum, item) => sum + item.quantity, 0)} units
                </Text>
              </Text>
            </View>
          </View>
        )}

        {/* Empty State */}
        {hasRequestedItems && items.length === 0 && (
          <View style={{ 
            backgroundColor: '#FFFFFF', 
            borderRadius: 12, 
            padding: 40, 
            alignItems: 'center',
            borderWidth: 1,
            borderColor: '#E9ECEF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2
          }}>
            <Ionicons name="cube-outline" size={48} color="#6C757D" style={{ marginBottom: 16 }} />
            <Text style={{ color: '#6C757D', fontSize: 16, fontWeight: '500', textAlign: 'center' }}>
              {operationMode === 'load' 
                ? 'No items to load today' 
                : 'No items to unload today'}
            </Text>
            <Text style={{ color: '#6C757D', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
              {operationMode === 'load'
                ? 'Items have not arrived yet or all items have been confirmed.'
                : 'No items are available for unloading or all items have already been unloaded.'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Action Buttons */}
      {confirmationStep === 'review' && items.length > 0 && (
        <View style={{ 
          position: 'absolute', 
          bottom: 90, 
          left: 0, 
          right: 0, 
          backgroundColor: '#FFFFFF', 
          padding: 20, 
          borderTopWidth: 1, 
          borderTopColor: '#E9ECEF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 4
        }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              style={{ 
                backgroundColor: '#6C757D', 
                flex: 1, 
                paddingVertical: 16, 
                borderRadius: 12, 
                flexDirection: 'row', 
                justifyContent: 'center', 
                alignItems: 'center'
              }}
              onPress={resetProcess}
              disabled={isConfirming}
            >
              <Ionicons name="refresh" size={22} color="white" />
              <Text style={{ color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 8 }}>
                Reset
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={{ 
                backgroundColor: isCorrect !== null && !isConfirming ? modeColor : '#94A3B8', 
                flex: 1, 
                paddingVertical: 16, 
                borderRadius: 12, 
                flexDirection: 'row', 
                justifyContent: 'center', 
                alignItems: 'center',
                shadowColor: isCorrect !== null && !isConfirming ? modeColor : 'transparent',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: isCorrect !== null && !isConfirming ? 0.3 : 0,
                shadowRadius: 8,
                elevation: isCorrect !== null && !isConfirming ? 6 : 0
              }}
              onPress={handleConfirmItems}
              disabled={isCorrect === null || isConfirming}
            >
              {isConfirming ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="white" style={{ marginRight: 8 }} />
                  <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                    Sending...
                  </Text>
                </View>
              ) : (
                <>
                  <Ionicons name="send" size={22} color="white" />
                  <Text style={{ color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 8 }}>
                    Send {modeLabel} Confirmation
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

export default LoadedItems;
