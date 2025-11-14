import { useOrderStore } from '@/store/index';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState, useCallback, useEffect } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View, ActivityIndicator, RefreshControl } from 'react-native';

interface LoadedItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  confirmed?: boolean;
}

interface LoadedItemsResponse {
  success: boolean;
  message: string;
  data: LoadedItem[];
}

interface ConfirmationResponse {
  success: boolean;
  message: string;
  agreement?: {
    status: 'agreed' | 'disagreed';
    notes?: string;
    final_items?: LoadedItem[];
  };
}

const LoadedItems = () => {
  const router = useRouter();
  const { currentDriver } = useOrderStore();
  const [loadedItems, setLoadedItems] = useState<LoadedItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasRequestedItems, setHasRequestedItems] = useState(false);
  const [confirmationStep, setConfirmationStep] = useState<'request' | 'review' | 'agreement'>('request');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [agreementResponse, setAgreementResponse] = useState<any>(null);

  const fetchLoadedItems = useCallback(async () => {
    if (!currentDriver) {
      Alert.alert('Error', 'Driver information not found.');
      return;
    }

    setIsLoading(true);
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Dummy data for loaded items
      const dummyItems: LoadedItem[] = [
        {
          id: 'water_5l_001',
          name: '5L Water Bottles',
          quantity: 50,
          unit: 'bottles',
          category: 'Water'
        },
        {
          id: 'water_10l_001',
          name: '10L Water Bottles',
          quantity: 25,
          unit: 'bottles',
          category: 'Water'
        },
        {
          id: 'water_300ml_001',
          name: '300ml Water Bottles',
          quantity: 100,
          unit: 'bottles',
          category: 'Water'
        },
        {
          id: 'dispenser_001',
          name: 'Water Dispensers',
          quantity: 5,
          unit: 'units',
          category: 'Equipment'
        },
        {
          id: 'water_1l_001',
          name: '1L Water Bottles',
          quantity: 75,
          unit: 'bottles',
          category: 'Water'
        }
      ];
      
      setLoadedItems(dummyItems);
      setHasRequestedItems(true);
      setConfirmationStep('review');
      setIsCorrect(null);
      setAgreementResponse(null);
      console.log('Loaded items received (dummy data):', dummyItems);
    } catch (error) {
      console.error('Error fetching loaded items:', error);
      Alert.alert('Error', 'Failed to fetch loaded items. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [currentDriver]);

  const handleConfirmItems = useCallback(async () => {
    if (!currentDriver) {
      Alert.alert('Error', 'Driver information not found.');
      return;
    }

    if (loadedItems.length === 0) {
      Alert.alert('Error', 'No items to confirm.');
      return;
    }

    if (isCorrect === null) {
      Alert.alert('Error', 'Please confirm if the items are correct or not.');
      return;
    }

    setIsConfirming(true);
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Dummy confirmation data
      const confirmationData = {
        driver_id: currentDriver.id,
        items: loadedItems.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category
        })),
        is_correct: isCorrect,
        confirmed_at: new Date().toISOString()
      };

      console.log('Sending confirmation (dummy):', confirmationData);
      
      // Simulate server response based on isCorrect
      const dummyResponse: ConfirmationResponse = {
        success: true,
        message: isCorrect 
          ? 'Items have been agreed upon successfully' 
          : 'Disagreement noted, please contact management',
        agreement: {
          status: isCorrect ? 'agreed' : 'disagreed',
          notes: isCorrect 
            ? 'All items confirmed by management' 
            : 'Quantity mismatch detected. Please verify with store manager.',
          final_items: isCorrect ? loadedItems : [
            {
              id: 'water_5l_001',
              name: '5L Water Bottles',
              quantity: 45, // Corrected quantity
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
                // Reset everything after successful agreement
                setLoadedItems([]);
                setHasRequestedItems(false);
                setConfirmationStep('request');
                setIsCorrect(null);
                setAgreementResponse(null);
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
                // Reset everything after disagreement
                setLoadedItems([]);
                setHasRequestedItems(false);
                setConfirmationStep('request');
                setIsCorrect(null);
                setAgreementResponse(null);
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error('Error confirming loaded items:', error);
      Alert.alert('Error', 'Failed to confirm items. Please try again.');
    } finally {
      setIsConfirming(false);
    }
  }, [currentDriver, loadedItems, isCorrect]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchLoadedItems();
    setIsRefreshing(false);
  }, [fetchLoadedItems]);

  const resetProcess = useCallback(() => {
    setLoadedItems([]);
    setHasRequestedItems(false);
    setConfirmationStep('request');
    setIsCorrect(null);
    setAgreementResponse(null);
  }, []);

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
            Loaded Items Confirmation
          </Text>
          
          <View style={{ width: 40 }} />
        </View>
      </View>

      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 200 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      >
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
              backgroundColor: '#E3F2FD', 
              borderRadius: 20, 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginRight: 12 
            }}>
              <Ionicons name="cube" size={20} color="#1976D2" />
            </View>
            <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
              Today's Loaded Items
            </Text>
          </View>
          
          {confirmationStep === 'request' ? (
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              <Text style={{ color: '#6C757D', fontSize: 14, textAlign: 'center', marginBottom: 16 }}>
                Request today's loaded items from the server to begin confirmation process.
              </Text>
              <TouchableOpacity
                style={{ 
                  backgroundColor: '#1976D2', 
                  paddingHorizontal: 24, 
                  paddingVertical: 12, 
                  borderRadius: 8,
                  flexDirection: 'row',
                  alignItems: 'center'
                }}
                onPress={fetchLoadedItems}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="white" style={{ marginRight: 8 }} />
                ) : (
                  <Ionicons name="download" size={16} color="white" style={{ marginRight: 8 }} />
                )}
                <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>
                  {isLoading ? 'Requesting...' : 'Request Items'}
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

        {/* Items List */}
        {loadedItems.length > 0 && (
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
                backgroundColor: '#FFF3E0', 
                borderRadius: 20, 
                alignItems: 'center', 
                justifyContent: 'center', 
                marginRight: 12 
              }}>
                <Ionicons name="list" size={20} color="#F59E0B" />
              </View>
              <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
                {confirmationStep === 'review' ? 'Items to Review' : 'Loaded Items'}
              </Text>
            </View>
            
            <View style={{ gap: 12 }}>
              {loadedItems.map((item) => (
                <View
                  key={item.id}
                  style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    padding: 16, 
                    backgroundColor: '#F8F9FA',
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: '#E9ECEF'
                  }}
                >
                  <View style={{ 
                    width: 40, 
                    height: 40, 
                    backgroundColor: '#E3F2FD', 
                    borderRadius: 20, 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    marginRight: 12 
                  }}>
                    <Ionicons name="cube" size={20} color="#1976D2" />
                  </View>
                  
                  <View style={{ flex: 1 }}>
                    <Text style={{ 
                      color: '#212529', 
                      fontSize: 16, 
                      fontWeight: '600',
                      marginBottom: 4
                    }}>
                      {item.name}
                    </Text>
                    <Text style={{ color: '#6C757D', fontSize: 14 }}>
                      {item.quantity} {item.unit} • {item.category}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Empty State */}
        {hasRequestedItems && loadedItems.length === 0 && (
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
              No items loaded today
            </Text>
            <Text style={{ color: '#6C757D', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
              All items have been confirmed or no items were loaded for today.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Action Buttons */}
      {confirmationStep === 'review' && loadedItems.length > 0 && (
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
                backgroundColor: isCorrect !== null && !isConfirming ? '#1976D2' : '#94A3B8', 
                flex: 1, 
                paddingVertical: 16, 
                borderRadius: 12, 
                flexDirection: 'row', 
                justifyContent: 'center', 
                alignItems: 'center',
                shadowColor: isCorrect !== null && !isConfirming ? '#1976D2' : 'transparent',
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
                    Send Confirmation
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
