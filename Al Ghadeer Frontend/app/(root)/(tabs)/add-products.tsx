import CustomButton from '@/components/CustomButton';
import { useOrderStore } from '@/store/index';
import { Product } from '@/types/order';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { Alert, Image, ScrollView, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';

const IP_ADDRESS = "192.168.0.194:3000/api";

interface ServerProduct {
  customer_site_id?: string;
  customer_id?: string;
  id: string; // Changed from number to string based on API response
  name: string;
  description: string;
  price: number;
  unit: string;
  available_stock: string | number; // Can be "N/A" or number
  category: string;
  image_url: string;
  is_active: boolean;
}

// API Response interface
interface ProductsApiResponse {
  success: boolean;
  data: ServerProduct[];
  count: number;
}

const ProductItem: React.FC<{
  product: ServerProduct;
  quantity: number;
  onChangeQuantity: (newQuantity: number) => void;
  initialQuantity?: number;
}> = ({ product, quantity, onChangeQuantity, initialQuantity = 0 }) => {
  const isMaxStock = product.available_stock !== "N/A" && quantity >= Number(product.available_stock);
  const isMinStock = quantity === 0;
  
  return (
    <View style={{ 
      backgroundColor: '#FFFFFF', 
      borderRadius: 8, 
      padding: 16, 
      marginBottom: 12, 
      borderWidth: 1,
      borderColor: quantity > 0 ? '#1976D2' : '#E9ECEF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Product Image */}
        <View style={{ 
          width: 50, 
          height: 50, 
          borderRadius: 8, 
          overflow: 'hidden', 
          backgroundColor: '#F8F9FA',
          borderWidth: 1,
          borderColor: '#E9ECEF'
        }}>
          <Image 
            source={{uri: product.image_url || 'https://via.placeholder.com/150'}} 
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover" 
          />
        </View>

        {/* Product Info */}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: '#212529', fontSize: 14, fontWeight: '600', marginBottom: 2 }}>
            {product.name}
          </Text>
          <Text style={{ color: '#1976D2', fontSize: 16, fontWeight: '700', marginBottom: 4 }}>
            AED {product.price}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: '#6C757D', fontSize: 12 }}>
              {product.unit}
            </Text>
            <Text style={{ color: '#6C757D', fontSize: 12, marginLeft: 8 }}>
              • Stock: {product.available_stock === "N/A" ? "Available" : product.available_stock}
            </Text>
          </View>
          {initialQuantity > 0 && (
            <View style={{ 
              backgroundColor: '#E3F2FD', 
              paddingHorizontal: 6, 
              paddingVertical: 2, 
              borderRadius: 4, 
              marginTop: 4,
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center'
            }}>
              <Ionicons name="checkmark-circle" size={10} color="#1976D2" />
              <Text style={{ color: '#1976D2', fontSize: 10, fontWeight: '600', marginLeft: 4 }}>
                Ordered: {initialQuantity}
              </Text>
            </View>
          )}
        </View>

        {/* Quantity Controls */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', borderRadius: 6, padding: 2 }}>
          <TouchableOpacity
            style={{ 
              width: 28, 
              height: 28, 
              borderRadius: 4, 
              backgroundColor: isMinStock ? '#E9ECEF' : '#1976D2',
              alignItems: 'center', 
              justifyContent: 'center',
              marginRight: 6
            }}
            onPress={() => onChangeQuantity(Math.max(0, quantity - 1))}
            disabled={isMinStock}
          >
            <Ionicons name="remove" size={14} color={isMinStock ? '#6C757D' : 'white'} />
          </TouchableOpacity>

          <View style={{ 
            minWidth: 36, 
            height: 28, 
            backgroundColor: 'white', 
            borderRadius: 4, 
            alignItems: 'center', 
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: '#E9ECEF'
          }}>
            <Text style={{ color: '#212529', fontSize: 14, fontWeight: '600' }}>
              {quantity}
            </Text>
          </View>

          <TouchableOpacity
            style={{ 
              width: 28, 
              height: 28, 
              borderRadius: 4, 
              backgroundColor: isMaxStock ? '#E9ECEF' : '#1976D2',
              alignItems: 'center', 
              justifyContent: 'center',
              marginLeft: 6
            }}
            onPress={() => onChangeQuantity(quantity + 1)}
            disabled={isMaxStock}
          >
            <Ionicons name="add" size={14} color={isMaxStock ? '#6C757D' : 'white'} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const ProductList: React.FC = () => {
  const router = useRouter();
  const { addToCart, clearCart, selectedOrder, assignedOrders } = useOrderStore();
  
  const [products, setProducts] = useState<ServerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch products from server
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        // Use the driver/products endpoint
        let url = `http://${IP_ADDRESS}/driver/products`;
        url += "?driver_id=b97f3fc1-0708-4b97-bf5d-deb424b2cd93";
        
        // Get customer_site_id from the selected order
        const currentOrder = assignedOrders.find(order => order.id === selectedOrder);
        const customerSiteId = currentOrder?.customer_site_id || currentOrder?.customer?.site_id;
        
        if (customerSiteId) {
          url += `&customer_site_id=${customerSiteId}`;
        }
        
        console.log('Fetching products from:', url);
        console.log('Customer site ID:', customerSiteId);
        console.log('Current order:', currentOrder ? {
          id: currentOrder.id,
          customer_name: currentOrder.customer_name,
          customer_site_id: currentOrder.customer_site_id,
          customer_id: currentOrder.customer_id
        } : 'No order selected');
        
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const apiResponse: ProductsApiResponse = await response.json();
        console.log('Products API Response:', apiResponse);
        
        if (!apiResponse.success || !apiResponse.data) {
          throw new Error('Invalid API response format');
        }
        
        const data = apiResponse.data;
        console.log('Products fetched:', data.length, 'out of', apiResponse.count);
        console.log('Sample product with customer_site_id:', data[0] ? {
          id: data[0].id,
          name: data[0].name,
          customer_site_id: data[0].customer_site_id,
          customer_id: data[0].customer_id,
          price: data[0].price,
          available_stock: data[0].available_stock
        } : 'No products');
        setProducts(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching products:', err);
        setError('Failed to load products. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [selectedOrder, assignedOrders]);

  const categories = useMemo(() => {
    const uniqueCategories = [...new Set(products.map(p => p.category))];
    return uniqueCategories;
  }, [products]);

  const initialQuantities = useMemo(() => {
    const record: Record<string, number> = {};
    const currentOrder = assignedOrders.find(order => order.id === selectedOrder);
    
    console.log('=== INITIALIZING PRODUCT QUANTITIES ===');
    console.log('Current Order:', currentOrder ? {
      id: currentOrder.id,
      order_number: currentOrder.order_number,
      customer_name: currentOrder.customer_name,
      products: currentOrder.products
    } : 'No order found');
    
    products.forEach((p) => {
      let initialQty = 0;
      
      if (currentOrder?.products) {
        console.log(`Checking product: ${p.name} (ID: ${p.id})`);
        console.log('Order products:', currentOrder.products);
        
        // Try multiple ways to match the product
        // 1. Direct name match
        let orderProductQty = currentOrder.products[p.name];
        
        // 2. Try case-insensitive match
        if (!orderProductQty) {
          const productNameLower = p.name.toLowerCase();
          const orderProductNames = Object.keys(currentOrder.products);
          const matchingKey = orderProductNames.find(key => 
            key.toLowerCase() === productNameLower
          );
          if (matchingKey) {
            orderProductQty = currentOrder.products[matchingKey];
            console.log(`Found case-insensitive match: ${matchingKey} -> ${orderProductQty}`);
          }
        }
        
        // 3. Try partial match (in case names are slightly different)
        if (!orderProductQty) {
          const productNameLower = p.name.toLowerCase();
          const orderProductNames = Object.keys(currentOrder.products);
          const matchingKey = orderProductNames.find(key => 
            key.toLowerCase().includes(productNameLower) || 
            productNameLower.includes(key.toLowerCase())
          );
          if (matchingKey) {
            orderProductQty = currentOrder.products[matchingKey];
            console.log(`Found partial match: ${matchingKey} -> ${orderProductQty}`);
          }
        }
        
        if (orderProductQty && typeof orderProductQty === 'number') {
          initialQty = orderProductQty;
          console.log(`✅ Matched ${p.name}: ${initialQty}`);
        } else {
          console.log(`❌ No match found for ${p.name}`);
        }
      }
      
      record[p.id] = initialQty;
    });
    
    console.log('Final initial quantities:', record);
    console.log('=== END INITIALIZATION ===');
    return record;
  }, [products, selectedOrder, assignedOrders]);

  const [quantities, setQuantities] = useState<Record<string, number>>(initialQuantities);

  // Reset quantities when initialQuantities change (when order changes)
  useEffect(() => {
    setQuantities(initialQuantities);
  }, [initialQuantities]);

  const handleChangeQuantity = useCallback((productId: string, newQuantity: number) => {
    setQuantities((prev) => ({ ...prev, [productId]: newQuantity }));
  }, []);

  const handleCheckout = useCallback(() => {
    // Collect selected items
    const selected = products.filter((p) => (quantities[p.id] || 0) > 0);
    if (selected.length === 0) {
      Alert.alert('No items selected', 'Please select at least one product to continue.');
      return;
    }

    // Convert server products to frontend Product format for cart
    const cartProducts: Product[] = selected.map(serverProduct => {
      // Map server unit to Product type
      let productType: "5L" | "10L" | "300ml" | "1L" | "20L" | "dispenser" = "5L";
      if (serverProduct.unit.includes("10L")) productType = "10L";
      else if (serverProduct.unit.includes("300ml")) productType = "300ml";
      else if (serverProduct.unit.includes("1L")) productType = "1L";
      else if (serverProduct.unit.includes("20L")) productType = "20L";
      else if (serverProduct.unit.includes("dispenser")) productType = "dispenser";

      return {
        id: serverProduct.id, // Already a string
        name: serverProduct.name,
        type: productType,
        description: serverProduct.description,
        image_url: serverProduct.image_url || 'https://via.placeholder.com/150',
        pricing: {
          cost_price: serverProduct.price * 0.7, // Estimate cost price
          selling_price: serverProduct.price,
          driver_commission: serverProduct.price * 0.1, // 10% commission
          profit_margin: 0.3
        },
        inventory: {
          current_stock: serverProduct.available_stock === "N/A" ? 999 : Number(serverProduct.available_stock),
          reserved_stock: 0,
          available_stock: serverProduct.available_stock === "N/A" ? 999 : Number(serverProduct.available_stock),
          minimum_stock: 5,
          maximum_stock: 100,
          warehouse_location: 'Main Warehouse'
        },
        details: {
          weight: 1.0,
          dimensions: { length: 10, width: 10, height: 20 },
          material: 'Plastic',
          brand: 'Al Ghadeer'
        }
      };
    });

    // Reset cart to reflect current selection, then add all
    clearCart();
    console.log('Cart products before adding:', cartProducts);
    console.log('Quantities object:', quantities);
    
    let itemsAdded = 0;
    cartProducts.forEach((p) => {
      const quantity = quantities[p.id] || 0;
      console.log('Adding to cart:', p.name, 'Quantity:', quantity);
      if (quantity > 0) {
        addToCart(p, quantity);
        itemsAdded++;
      } else {
        console.warn('Skipping product with zero quantity:', p.name);
      }
    });
    
    if (itemsAdded === 0) {
      Alert.alert('No Items Selected', 'Please select at least one product to continue.');
      return;
    }
    
    console.log(`Added ${itemsAdded} items to cart, navigating to checkout`);
    router.push('/(root)/(tabs)/checkout');
  }, [products, quantities, addToCart, clearCart, router]);



  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8F9FA', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 8, 
          padding: 32, 
          alignItems: 'center',
          borderWidth: 1,
          borderColor: '#E9ECEF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2
        }}>
          <ActivityIndicator size="large" color="#1976D2" />
          <Text style={{ color: '#6C757D', fontSize: 16, marginTop: 16, fontWeight: '500' }}>
            Loading products...
          </Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8F9FA', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 8, 
          padding: 32, 
          alignItems: 'center',
          borderWidth: 1,
          borderColor: '#E9ECEF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2
        }}>
          <Ionicons name="alert-circle" size={40} color="#DC3545" />
          <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600', marginTop: 16, textAlign: 'center' }}>
            {error}
          </Text>
          <TouchableOpacity 
            style={{ 
              backgroundColor: '#1976D2', 
              paddingHorizontal: 20, 
              paddingVertical: 10, 
              borderRadius: 6, 
              marginTop: 16,
              borderWidth: 1,
              borderColor: '#1976D2'
            }}
            onPress={() => window.location.reload()}
          >
            <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const currentOrder = assignedOrders.find(order => order.id === selectedOrder);
  const totalSelectedItems = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);

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
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Ionicons name="arrow-back" size={24} color="#495057" />
          </TouchableOpacity>
          <Text style={{ color: '#212529', fontSize: 18, fontWeight: '600' }}>Add Delivered Products</Text>
          <View style={{ width: 40 }} />
        </View>
        
        {currentOrder && (
          <View style={{ 
            backgroundColor: '#E3F2FD', 
            borderRadius: 8, 
            padding: 12,
            borderWidth: 1,
            borderColor: '#BBDEFB'
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Ionicons name="receipt" size={16} color="#1976D2" />
              <Text style={{ color: '#1976D2', fontSize: 14, fontWeight: '600', marginLeft: 6 }}>
                Order #{currentOrder.order_number}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="person" size={14} color="#1976D2" />
              <Text style={{ color: '#1976D2', fontSize: 12, marginLeft: 6 }}>
                {currentOrder.customer?.name || currentOrder.customer_name || 'Customer'}
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
        {/* Summary Card */}
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
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600', marginBottom: 2 }}>
                Selected Items
              </Text>
              <Text style={{ color: '#6C757D', fontSize: 14 }}>
                {totalSelectedItems} products selected
              </Text>
            </View>
            <View style={{ 
              backgroundColor: '#1976D2', 
              borderRadius: 6, 
              paddingHorizontal: 12, 
              paddingVertical: 6 
            }}>
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '700' }}>
                {totalSelectedItems}
              </Text>
            </View>
          </View>
          
          {/* Order Initialization Status */}
          {currentOrder?.products && Object.keys(currentOrder.products).length > 0 && (
            <View style={{ 
              backgroundColor: '#E8F5E8', 
              borderRadius: 6, 
              padding: 12, 
              borderWidth: 1, 
              borderColor: '#C8E6C9' 
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Ionicons name="checkmark-circle" size={16} color="#28A745" />
                <Text style={{ color: '#28A745', fontSize: 14, fontWeight: '600', marginLeft: 6 }}>
                  Order Quantities Initialized
                </Text>
              </View>
              <Text style={{ color: '#155724', fontSize: 12, lineHeight: 16 }}>
                Product quantities have been pre-filled based on the original order. You can adjust them as needed.
              </Text>
            </View>
          )}
        </View>

        {/* Categories */}
        {categories.map((category) => {
          const productsInCategory = products.filter((p) => p.category === category);

          return (
            <View key={category} style={{ marginBottom: 16 }}>
              <View style={{ 
                backgroundColor: '#FFFFFF', 
                borderRadius: 8, 
                padding: 20,
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
                    backgroundColor: '#F3E8FF', 
                    borderRadius: 20, 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    marginRight: 12 
                  }}>
                    <Ionicons name="grid" size={20} color="#8B5CF6" />
                  </View>
                  <Text style={{ color: '#212529', fontSize: 16, fontWeight: '600' }}>
                    {category}
                  </Text>
                </View>
                
                {productsInCategory.map((product) => {
                  const initialQty = currentOrder?.products?.[product.name] || 0;
                  return (
                    <ProductItem
                      key={product.id}
                      product={product}
                      quantity={quantities[product.id] || 0}
                      onChangeQuantity={(q) => handleChangeQuantity(product.id, q)}
                      initialQuantity={initialQty}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}

        {/* Checkout Button */}
        <TouchableOpacity
          style={{ 
            backgroundColor: totalSelectedItems > 0 ? '#1976D2' : '#E9ECEF',
            paddingVertical: 16, 
            paddingHorizontal: 24, 
            borderRadius: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 16,
            borderWidth: 1,
            borderColor: totalSelectedItems > 0 ? '#1976D2' : '#E9ECEF',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: totalSelectedItems > 0 ? 0.1 : 0.05,
            shadowRadius: 8,
            elevation: totalSelectedItems > 0 ? 4 : 2
          }}
          onPress={handleCheckout}
          disabled={totalSelectedItems === 0}
        >
          <Ionicons 
            name="cart" 
            size={20} 
            color={totalSelectedItems > 0 ? 'white' : '#6C757D'} 
          />
          <Text style={{ 
            color: totalSelectedItems > 0 ? 'white' : '#6C757D', 
            fontSize: 16, 
            fontWeight: '600', 
            marginLeft: 8 
          }}>
            Proceed to Checkout ({totalSelectedItems})
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

export default ProductList;
