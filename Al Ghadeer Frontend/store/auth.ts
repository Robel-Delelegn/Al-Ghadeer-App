import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface User {
  id: string;
  phone: string;
  name: string; // alias of driver_name
  driver_name?: string;
  helper_name?: string;
  vehicle_number?: string;
  vehicle_type?: string;
  zone?: string;
  status?: 'pending' | 'approved' | 'rejected';
}

interface AuthStore {
  // Auth state
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;

  // Auth actions
  requestOtp: (phone: string) => Promise<{ success: boolean; message?: string; tempToken?: string; requiresOtp?: boolean }>;
  verifyOtp: (phone: string, otp: string, tempToken: string) => Promise<{ success: boolean; message?: string }>;
  resendOtp: (phone: string, tempToken: string) => Promise<{ success: boolean; message?: string }>;
  signOut: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
  updateUser: (user: User) => void;
  clearAuth: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

// API Base URL - Update with your actual server URL
// Note: Should include /api at the end (e.g., http://192.168.100.249:3000/api)
const API_BASE_URL = process.env.EXPO_PUBLIC_IP_ADDRESS || process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      isAuthenticated: false,
      isLoading: false,
      user: null,

      /**
       * Request OTP - First time login: Request OTP via SMS
       * POST /api/auth/request-otp
       */
      requestOtp: async (phone: string) => {
        set({ isLoading: true });
        try {
          console.log('Requesting OTP for phone:', phone);
          // Ensure API_BASE_URL ends with /api, then append /auth/request-otp
          const baseUrl = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
          const url = `${baseUrl}/auth/request-otp`;
          console.log('API URL:', url);

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              phone,
            }),
          });

          console.log('Response status:', response.status);
          console.log('Response ok:', response.ok);
          
          // Check if response has content
          const contentType = response.headers.get('content-type');
          console.log('Content-Type:', contentType);
          
          let data: any;
          try {
            const text = await response.text();
            console.log('Response text (raw):', text);
            
            if (text) {
              data = JSON.parse(text);
              console.log('Response data (parsed):', data);
            } else {
              console.error('Empty response body');
              throw new Error('Empty response from server');
            }
          } catch (parseError) {
            console.error('Failed to parse response:', parseError);
            throw new Error('Invalid response from server');
          }

          if (!response.ok) {
            console.error('Response not OK:', response.status, data);
            throw new Error(data?.message || `Server error: ${response.status}`);
          }

          console.log('Checking response data:', {
            success: data.success,
            temp_token: data.temp_token,
            requires_otp: data.requires_otp
          });

          if (data.success && data.temp_token) {
            console.log('✅ OTP request successful, returning result');
            set({ isLoading: false });
            return {
              success: true,
              message: data.message || 'OTP sent to your phone number',
              tempToken: data.temp_token,
              requiresOtp: data.requires_otp || true,
            };
          }

          console.error('Response missing required fields:', data);
          throw new Error(data?.message || 'Failed to send OTP');
        } catch (error) {
          console.error('OTP request error caught:', error);
          set({ isLoading: false });
          let errorMessage = 'Failed to send OTP. Please try again.';
          
          if (error instanceof Error) {
            console.error('Error details:', {
              name: error.name,
              message: error.message,
              stack: error.stack
            });
            
            if (error.message.includes('Network request failed') || 
                error.message.includes('fetch') ||
                error.message.includes('Failed to connect') ||
                error.message.includes('NetworkError')) {
              errorMessage = 'Cannot connect to server. Please ensure the server is running.';
            } else {
              errorMessage = error.message;
            }
          }
          
          console.error('Returning error result:', { success: false, message: errorMessage });
          return {
            success: false,
            message: errorMessage,
          };
        }
      },

      verifyOtp: async (phone: string, otp: string, tempToken: string) => {
        set({ isLoading: true });
        try {
          const baseUrl = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
          const response = await fetch(`${baseUrl}/auth/verify-otp`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${tempToken}`,
            },
            body: JSON.stringify({
              phone,
              otp,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message || 'OTP verification failed');
          }

          if (data.success && data.token) {
            // Store permanent token securely
            await SecureStore.setItemAsync('auth_token', data.token);
            if (data.refresh_token) {
              await SecureStore.setItemAsync('refresh_token', data.refresh_token);
            }

            set({
              isAuthenticated: true,
              isLoading: false,
              user: data.user || null,
            });

            return {
              success: true,
              message: data.message || 'Phone number verified successfully',
            };
          }

          throw new Error(data.message || 'OTP verification failed');
        } catch (error) {
          set({ isLoading: false });
          const errorMessage = error instanceof Error ? error.message : 'Invalid OTP. Please try again.';
          return {
            success: false,
            message: errorMessage,
          };
        }
      },

      /**
       * Resend OTP - Resend OTP code to phone number using temp token
       * POST /api/auth/resend-otp
       */
      resendOtp: async (phone: string, tempToken: string) => {
        set({ isLoading: true });
        try {
          const baseUrl = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
          const response = await fetch(`${baseUrl}/auth/resend-otp`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${tempToken}`,
            },
            body: JSON.stringify({
              phone,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message || 'Failed to resend OTP');
          }

          set({ isLoading: false });
          return {
            success: data.success || false,
            message: data.message || 'OTP resent to your phone number',
          };
        } catch (error) {
          set({ isLoading: false });
          const errorMessage = error instanceof Error ? error.message : 'Failed to resend OTP. Please try again.';
          return {
            success: false,
            message: errorMessage,
          };
        }
      },


      /**
       * Sign Out - Clear authentication
       */
      signOut: async () => {
        try {
          const token = await SecureStore.getItemAsync('auth_token');
          
          // Call logout endpoint if token exists
          if (token) {
            try {
              const baseUrl = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
              await fetch(`${baseUrl}/auth/logout`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              });
            } catch (error) {
              console.error('Logout API call failed:', error);
            }
          }

          // Clear secure storage
          await SecureStore.deleteItemAsync('auth_token');
          await SecureStore.deleteItemAsync('refresh_token');

          // Clear state
          set({
            isAuthenticated: false,
            user: null,
          });
        } catch (error) {
          console.error('Sign out error:', error);
          // Still clear state even if API call fails
          set({
            isAuthenticated: false,
            user: null,
          });
        }
      },

      /**
       * Check Authentication - Verify token and get user info
       * GET /api/auth/me
       */
      checkAuth: async () => {
        try {
          const token = await SecureStore.getItemAsync('auth_token');
          
          if (!token) {
            set({
              isAuthenticated: false,
              user: null,
            });
            return false;
          }

          // Verify token with backend
          const baseUrl = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
          const response = await fetch(`${baseUrl}/auth/me`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            // Token invalid, clear auth
            await SecureStore.deleteItemAsync('auth_token');
            await SecureStore.deleteItemAsync('refresh_token');
            set({
              isAuthenticated: false,
              user: null,
            });
            return false;
          }

          const data = await response.json();

          if (data.success && data.user) {
            // Check if user is approved
            if (data.user.status !== 'approved') {
              // User not approved, sign them out
              await SecureStore.deleteItemAsync('auth_token');
              await SecureStore.deleteItemAsync('refresh_token');
              set({
                isAuthenticated: false,
                user: null,
              });
              return false;
            }

            set({
              isAuthenticated: true,
              user: data.user,
            });
            return true;
          }

          return false;
        } catch (error) {
          console.error('Auth check error:', error);
          set({
            isAuthenticated: false,
            user: null,
          });
          return false;
        }
      },

      /**
       * Get Token - Retrieve auth token from secure storage
       */
      getToken: async () => {
        return await SecureStore.getItemAsync('auth_token');
      },

      /**
       * Update User - Update user information in store
       */
      updateUser: (user: User) => {
        set({ user });
      },

      /**
       * Clear Auth - Clear all authentication data
       */
      clearAuth: async () => {
        await SecureStore.deleteItemAsync('auth_token');
        await SecureStore.deleteItemAsync('refresh_token');
        set({
          isAuthenticated: false,
          user: null,
        });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        // Tokens are stored separately in SecureStore
      }),
    }
  )
);

// Helper function to get auth token for API calls
export const getAuthToken = async (): Promise<string | null> => {
  return await SecureStore.getItemAsync('auth_token');
};

// Helper function to make authenticated API calls
export const authenticatedFetch = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const token = await getAuthToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  return fetch(url, {
    ...options,
    headers,
  });
};


