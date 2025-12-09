import { Redirect } from 'expo-router';
import { View, ActivityIndicator, Text } from 'react-native';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import * as SecureStore from 'expo-secure-store';

export default function Index() {
  const { isAuthenticated, checkAuth, verifyToken, isLoading } = useAuthStore();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const verifyAuth = async () => {
      try {
        // First, do a fast check (no network call)
        const isAuth = await checkAuth();
        
        // If not authenticated but token exists, verify token with backend
        if (!isAuth) {
          const token = await SecureStore.getItemAsync('auth_token');
          if (token) {
            // Token exists but state is not authenticated, verify with backend
            const isValid = await verifyToken();
            // If token verification fails, it will be cleared by verifyToken()
            // User will be redirected to welcome page
          }
        }
      } catch (error) {
        console.error('Auth verification error:', error);
        // On any error, ensure we're signed out
        const { clearAuth } = useAuthStore.getState();
        await clearAuth();
      } finally {
        setIsChecking(false);
      }
    };
    verifyAuth();
  }, [checkAuth, verifyToken]);

  // Show loading while checking auth status
  if (isChecking || isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Redirect based on auth status
  if (isAuthenticated) {
    return <Redirect href="/(root)/(tabs)/home" />;
  }

  return <Redirect href="/(auth)/welcome" />;
}
