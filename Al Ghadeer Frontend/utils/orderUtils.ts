import { Order } from '@/types/order';

// Product in order (new format)
export interface OrderProduct {
  id: string;
  name: string;
  quantity: number;
  type?: string;
  category?: string;
}

/**
 * Normalize products from API response to a consistent format
 * Handles both array format (new) and Record format (legacy)
 */
export function normalizeOrderProducts(
  products: Order['products']
): { productsArray: OrderProduct[]; productsRecord: Record<string, number> } {
  if (!products) {
    return { productsArray: [], productsRecord: {} };
  }

  // If it's already an array (new format)
  if (Array.isArray(products)) {
    const productsRecord: Record<string, number> = {};
    products.forEach((product) => {
      productsRecord[product.name] = product.quantity;
    });
    return { productsArray: products, productsRecord };
  }

  // If it's a Record (legacy format)
  if (typeof products === 'object') {
    const productsArray: OrderProduct[] = Object.entries(products).map(([name, quantity]) => ({
      id: `legacy_${name}`, // Generate ID for legacy format
      name,
      quantity: typeof quantity === 'number' ? quantity : 0,
    }));
    return { productsArray, productsRecord: products as Record<string, number> };
  }

  return { productsArray: [], productsRecord: {} };
}

/**
 * Get product quantity by name from order (works with both formats)
 */
export function getProductQuantity(order: Order, productName: string): number {
  if (!order.products) return 0;

  // If products is an array (new format)
  if (Array.isArray(order.products)) {
    const product = order.products.find((p) => p.name === productName);
    return product?.quantity || 0;
  }

  // If products is a Record (legacy format)
  if (typeof order.products === 'object') {
    return order.products[productName] || 0;
  }

  return 0;
}

/**
 * Get product category by name from order (works with both formats)
 */
export function getProductCategory(order: Order, productName: string): string | undefined {
  if (!order.products) return undefined;

  // If products is an array (new format)
  if (Array.isArray(order.products)) {
    const product = order.products.find((p) => p.name === productName);
    return product?.category;
  }

  // Legacy format doesn't have category
  return undefined;
}

/**
 * Get total items count from order products (works with both formats)
 */
export function getTotalItemsCount(order: Order): number {
  if (!order.products) return 0;

  // If products is an array (new format)
  if (Array.isArray(order.products)) {
    return order.products.reduce((total, product) => total + (product.quantity || 0), 0);
  }

  // If products is a Record (legacy format)
  if (typeof order.products === 'object') {
    return Object.values(order.products).reduce(
      (total, qty) => total + (typeof qty === 'number' ? qty : 0),
      0
    );
  }

  return 0;
}

/**
 * Check if order has products (works with both formats)
 */
export function hasProducts(order: Order): boolean {
  if (!order.products) return false;

  if (Array.isArray(order.products)) {
    return order.products.length > 0;
  }

  if (typeof order.products === 'object') {
    return Object.keys(order.products).length > 0;
  }

  return false;
}

