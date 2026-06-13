import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { parseApiResponse, parseApiResponseWithSoftError } from "@/utils/api";
import type { Profile } from "@/utils/profile";

interface User {
  id: string;
  phone: string;
  name: string;
  helper_name?: string;
  vehicle_number?: string;
  vehicle_type?: string;
  zone?: string;
  status?: string;
}

interface AuthStore {
  // Auth state
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;

  // Auth actions
  requestOtp: (phone: string) => Promise<{
    success: boolean;
    message?: string;
    tempToken?: string;
    requiresOtp?: boolean;
  }>;
  verifyOtp: (
    otp: string,
    tempToken: string,
  ) => Promise<{ success: boolean; message?: string }>;
  resendOtp: (tempToken: string) => Promise<{
    success: boolean;
    message?: string;
    tempToken?: string;
    requiresOtp?: boolean;
  }>;
  signOut: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
  updateUser: (user: User) => void;
  clearAuth: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_IP_ADDRESS || "http://localhost:3000"
)
  .trim()
  .replace(/\/+$/, "");

type AccountStatus = "pending" | "approved" | "rejected" | "unknown";

const normalizeAccountStatus = (status?: string): AccountStatus => {
  const normalized = (status || "").trim().toLowerCase();
  if (normalized === "pending") return "pending";
  if (normalized === "approved") return "approved";
  if (normalized === "rejected") return "rejected";
  return "unknown";
};

const buildUserFromProfile = (
  profile: Profile,
  currentUser?: User | null,
): User => {
  const primaryPhone =
    profile.phones.find((phone) => phone.isPrimary)?.number ||
    profile.phones[0]?.number ||
    currentUser?.phone ||
    "";
  const fullName =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() ||
    currentUser?.name ||
    "Driver";

  return {
    id: profile.id,
    phone: primaryPhone,
    name: fullName,
    helper_name: currentUser?.helper_name,
    vehicle_number: currentUser?.vehicle_number,
    vehicle_type: currentUser?.vehicle_type,
    zone: currentUser?.zone,
    status: currentUser?.status,
  };
};

const fetchAuthenticatedProfileUser = async (
  token: string,
  currentUser?: User | null,
): Promise<User | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/profile`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await parseApiResponseWithSoftError<Profile>(response);

    if (!result.ok) {
      return null;
    }

    return buildUserFromProfile(result.data, currentUser);
  } catch (error) {
    console.error("Failed to bootstrap authenticated profile:", error);
    return null;
  }
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      isAuthenticated: false,
      isLoading: false,
      user: null,

      /**
       * Request OTP - First time login: Request OTP via SMS
       * POST /auth/login
       */
      requestOtp: async (phone: string) => {
        set({ isLoading: true });
        try {
          console.log("[requestOtp] Input:", { phone, API_BASE_URL });
          const url = `${API_BASE_URL}/auth/login`;
          console.log("[requestOtp] Request:", {
            method: "POST",
            url,
            body: { phone },
          });

          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              phone,
            }),
          });

          console.log("[requestOtp] Response metadata:", {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
          });
          const responseBody = await response.clone().json();
          console.log("[requestOtp] Response body:", responseBody);

          const data = await parseApiResponse<{
            message?: string;
            tempToken?: string;
            temp_token?: string;
            requiresOtp?: boolean;
            requires_otp?: boolean;
          }>(response);
          console.log("[requestOtp] Parsed data:", data);
          set({ isLoading: false });
          const token = data.tempToken ?? data.temp_token;
          if (!token) {
            throw new Error("Invalid response: missing temp token");
          }
          const requiresOtp = data.requiresOtp ?? data.requires_otp ?? true;
          const result = {
            success: true,
            message: data.message || "OTP sent to your phone number",
            tempToken: token,
            requiresOtp,
          };
          console.log("[requestOtp] Return:", result);
          return result;
        } catch (error) {
          console.error("[requestOtp] Error caught:", error);
          set({ isLoading: false });
          let errorMessage = "Failed to send OTP. Please try again.";

          if (error instanceof Error) {
            console.error("[requestOtp] Error details:", {
              name: error.name,
              message: error.message,
              stack: error.stack,
            });

            if (
              error.message.includes("Network request failed") ||
              error.message.includes("fetch") ||
              error.message.includes("Failed to connect") ||
              error.message.includes("NetworkError")
            ) {
              errorMessage =
                "Cannot connect to server. Please ensure the server is running.";
            } else {
              errorMessage = error.message;
            }
          }

          const result = { success: false, message: errorMessage };
          console.error("[requestOtp] Return (error):", result);
          return result;
        }
      },

      verifyOtp: async (otp: string, tempToken: string) => {
        set({ isLoading: true });
        try {
          const url = `${API_BASE_URL}/auth/verify-otp`;
          console.log(`🌐 API Request: POST ${url}`);
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${tempToken}`,
            },
            body: JSON.stringify({
              otp: otp,
            }),
          });

          const data = await parseApiResponse<{
            token: string;
            user?: User;
            message?: string;
          }>(response);
          await SecureStore.setItemAsync("auth_token", data.token);
          const hydratedUser = data.user?.id
            ? data.user
            : await fetchAuthenticatedProfileUser(
                data.token,
                data.user || null,
              );
          set({
            isAuthenticated: true,
            isLoading: false,
            user: hydratedUser || data.user || null,
          });
          return {
            success: true,
            message: data.message || "Phone number verified successfully",
          };
        } catch (error) {
          set({ isLoading: false });
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Invalid OTP. Please try again.";
          return {
            success: false,
            message: errorMessage,
          };
        }
      },

      /**
       * Resend OTP - Resend OTP code to phone number using temp token
       * POST /auth/resend-otp
       */
      resendOtp: async (tempToken: string) => {
        set({ isLoading: true });
        try {
          const url = `${API_BASE_URL}/auth/resend-otp`;
          console.log(`🌐 API Request: POST ${url}`);
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${tempToken}`,
            },
          });

          const data = await parseApiResponse<{
            message?: string;
            tempToken?: string;
            temp_token?: string;
            requiresOtp?: boolean;
            requires_otp?: boolean;
          }>(response);
          const latestTempToken = data.tempToken ?? data.temp_token;
          const requiresOtp = data.requiresOtp ?? data.requires_otp ?? true;
          set({ isLoading: false });
          return {
            success: true,
            message: data.message || "OTP resent to your phone number",
            tempToken: latestTempToken,
            requiresOtp,
          };
        } catch (error) {
          set({ isLoading: false });
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to resend OTP. Please try again.";
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
          const token = await SecureStore.getItemAsync("auth_token");

          // Call logout endpoint if token exists
          if (token) {
            try {
              const url = `${API_BASE_URL}/auth/logout`;
              console.log(`🌐 API Request: POST ${url}`);
              await fetch(url, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              });
            } catch (error) {
              console.error("Logout API call failed:", error);
            }
          }

          // Clear secure storage
          await SecureStore.deleteItemAsync("auth_token");
          await SecureStore.deleteItemAsync("refresh_token");

          // Clear state
          set({
            isAuthenticated: false,
            user: null,
          });
        } catch (error) {
          console.error("Sign out error:", error);
          // Still clear state even if API call fails
          set({
            isAuthenticated: false,
            user: null,
          });
        }
      },

      /**
       * Check Authentication - Server is stateless, so token presence is source of truth.
       */
      checkAuth: async () => {
        set({ isLoading: true });
        try {
          const token = await SecureStore.getItemAsync("auth_token");
          console.log(
            "Checking authentication token:",
            token ? "exists" : "null",
          );

          if (!token) {
            set({
              isAuthenticated: false,
              user: null,
              isLoading: false,
            });
            return false;
          }

          const currentState = get();
          const accountStatus = normalizeAccountStatus(
            currentState.user?.status,
          );
          if (accountStatus === "rejected" || accountStatus === "pending") {
            await SecureStore.deleteItemAsync("auth_token");
            await SecureStore.deleteItemAsync("refresh_token");
            set({
              isAuthenticated: false,
              user: null,
              isLoading: false,
            });
            return false;
          }

          const hydratedUser = currentState.user?.id
            ? currentState.user
            : await fetchAuthenticatedProfileUser(token, currentState.user);

          set({
            isAuthenticated: true,
            user: hydratedUser || currentState.user,
            isLoading: false,
          });
          return true;
        } catch (error) {
          console.error("Auth check error:", error);
          const token = await SecureStore.getItemAsync("auth_token");
          const currentState = get();

          if (token) {
            if (currentState.user) {
              const accountStatus = normalizeAccountStatus(
                currentState.user.status,
              );
              if (accountStatus === "rejected" || accountStatus === "pending") {
                await SecureStore.deleteItemAsync("auth_token");
                await SecureStore.deleteItemAsync("refresh_token");
                set({ isAuthenticated: false, user: null, isLoading: false });
                return false;
              }
            }
            const hydratedUser = currentState.user?.id
              ? currentState.user
              : await fetchAuthenticatedProfileUser(token, currentState.user);
            set({
              isAuthenticated: true,
              user: hydratedUser || currentState.user,
              isLoading: false,
            });
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
        return await SecureStore.getItemAsync("auth_token");
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
        await SecureStore.deleteItemAsync("auth_token");
        await SecureStore.deleteItemAsync("refresh_token");
        set({
          isAuthenticated: false,
          user: null,
        });
      },
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        // Tokens are stored separately in SecureStore
      }),
    },
  ),
);

// Helper function to get auth token for API calls
export const getAuthToken = async (): Promise<string | null> => {
  return await SecureStore.getItemAsync("auth_token");
};

// Helper function to make authenticated API calls
export const authenticatedFetch = async (
  url: string,
  options: RequestInit = {},
): Promise<Response> => {
  // Console log the API URL before making the request
  console.log(`🌐 API Request: ${options.method || "GET"} ${url}`);

  const token = await getAuthToken();
  const method = (options.method || "GET").toUpperCase();

  // Merge headers properly - user headers take precedence
  const userHeaders = (options.headers as Record<string, string>) || {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(method === "GET" && {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    }),
    ...(token && { Authorization: `Bearer ${token}` }),
    ...userHeaders,
  };

  return fetch(url, {
    ...options,
    headers,
  });
};
