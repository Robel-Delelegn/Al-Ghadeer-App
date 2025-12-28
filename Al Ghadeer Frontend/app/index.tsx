import { Redirect } from 'expo-router';
import { View, ActivityIndicator, Text } from 'react-native';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import * as SecureStore from 'expo-secure-store';

export default function Index() {
  const { isAuthenticated, checkAuth, isLoading } = useAuthStore();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
     checkAuth()},
       [checkAuth]);

  // Show loading while checking auth status
  if (isLoading) {
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
