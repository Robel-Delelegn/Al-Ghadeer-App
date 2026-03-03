import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { parseApiResponse } from '@/utils/api';

interface User {
  id: string;
  phone: string;
  name: string; 
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

const API_BASE_URL = process.env.EXPO_PUBLIC_IP_ADDRESS;

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
          console.log('[requestOtp] Input:', { phone, API_BASE_URL });
          const baseUrl = API_BASE_URL?.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
          const url = `${baseUrl}/auth/request-otp`;
          console.log('[requestOtp] Request:', { method: 'POST', url, body: { phone } });

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              phone,
            }),
          });

          console.log('[requestOtp] Response metadata:', {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
          });
          const responseBody = await response.clone().json();
          console.log('[requestOtp] Response body:', responseBody);

          const data = await parseApiResponse<{
            message?: string;
            tempToken?: string;
            temp_token?: string;
            requiresOtp?: boolean;
            requires_otp?: boolean;
          }>(response);
          console.log('[requestOtp] Parsed data:', data);
          set({ isLoading: false });
          const token = data.tempToken ?? data.temp_token;
          if (!token) {
            throw new Error('Invalid response: missing temp token');
          }
          const requiresOtp = data.requiresOtp ?? data.requires_otp ?? true;
          const result = {
            success: true,
            message: data.message || 'OTP sent to your phone number',
            tempToken: token,
            requiresOtp,
          };
          console.log('[requestOtp] Return:', result);
          return result;
        } catch (error) {
          console.error('[requestOtp] Error caught:', error);
          set({ isLoading: false });
          let errorMessage = 'Failed to send OTP. Please try again.';
          
          if (error instanceof Error) {
            console.error('[requestOtp] Error details:', {
              name: error.name,
              message: error.message,
              stack: error.stack,
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
          
          const result = { success: false, message: errorMessage };
          console.error('[requestOtp] Return (error):', result);
          return result;
        }
      },

      verifyOtp: async (phone: string, otp: string, tempToken: string) => {
        set({ isLoading: true });
        try {
          const baseUrl = API_BASE_URL?.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
          const url = `${baseUrl}/auth/verify-otp`;
          console.log(`🌐 API Request: POST ${url}`);
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${tempToken}`,
            },
            body: JSON.stringify({
              phone:phone,
              otp: otp,
            }),
          });

          const data = await parseApiResponse<{ token: string; refresh_token?: string; user?: User; message?: string }>(response);
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
          const baseUrl = API_BASE_URL?.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
          const url = `${baseUrl}/auth/resend-otp`;
          console.log(`🌐 API Request: POST ${url}`);
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${tempToken}`,
            },
            body: JSON.stringify({
              phone,
            }),
          });

          const data = await parseApiResponse<{ message?: string }>(response);
          set({ isLoading: false });
          return {
            success: true,
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
              const baseUrl = API_BASE_URL?.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
              const url = `${baseUrl}/auth/logout`;
              console.log(`🌐 API Request: POST ${url}`);
              await fetch(url, {
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
        set({ isLoading: true });
        try {
          const token = await SecureStore.getItemAsync('auth_token');
          console.log("Checking Authentication using token:", token ? 'exists' : 'null');
          console.log("API Base URL:", API_BASE_URL);
          
          if (!token) {
            set({
              isAuthenticated: false,
              user: null,
              isLoading: false,
            });
            return false;
          }

          // Verify token with backend API
          const baseUrl = API_BASE_URL?.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
          const url = `${baseUrl}/auth/me`;
          console.log(`🌐 API Request: GET ${url}`);
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });

          // Only clear token on explicit auth rejection (401/403)
          if (response.status === 401 || response.status === 403) {
            console.log('Token rejected by server (401/403), clearing auth');
            await SecureStore.deleteItemAsync('auth_token');
            await SecureStore.deleteItemAsync('refresh_token');
            set({ isAuthenticated: false, user: null, isLoading: false });
            return false;
          }

          if (!response.ok) {
            // Server error (5xx) or other error - keep token, stay authenticated if we have persisted user
            console.log('Server error during auth check, keeping token');
            const currentState = get();
            if (currentState.user) {
              set({ isAuthenticated: true, isLoading: false });
              return true;
            }
            set({ isAuthenticated: false, user: null, isLoading: false });
            return false;
          }

          const data = await parseApiResponse<{ user: User }>(response);
          if (data.user) {
            if (data.user.status !== 'approved') {
              // User not approved, sign them out
              console.log('User not approved, clearing auth');
              await SecureStore.deleteItemAsync('auth_token');
              await SecureStore.deleteItemAsync('refresh_token');
              set({
                isAuthenticated: false,
                user: null,
                isLoading: false,
              });
              return false;
            }

            // Token is valid and user is approved
            set({
              isAuthenticated: true,
              user: data.user,
              isLoading: false,
            });
            return true;
          }

          // Invalid response format - keep existing state if we have user
          const currentState = get();
          if (currentState.user) {
            set({ isAuthenticated: true, isLoading: false });
            return true;
          }
          set({
            isAuthenticated: false,
            user: null,
            isLoading: false,
          });
          return false;
        } catch (error) {
          console.error('Auth check error (network issue?):', error);
          // On network error, keep the user logged in if we have persisted user data
          // This allows the app to work when server is temporarily unreachable
          const token = await SecureStore.getItemAsync('auth_token');
          const currentState = get();
          
          if (token && currentState.user) {
            console.log('Network error but token and user exist, staying authenticated');
            set({ isAuthenticated: true, isLoading: false });
            return true;
          }
          
          set({
            isAuthenticated: false,
            user: null,
            isLoading: false,
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
  // Console log the API URL before making the request
  console.log(`🌐 API Request: ${options.method || 'GET'} ${url}`);
  
  const token = await getAuthToken();
  
  // Merge headers properly - user headers take precedence
  const userHeaders = options.headers as Record<string, string> || {};
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...userHeaders,
  };

  return fetch(url, {
    ...options,
    headers,
  });
};


