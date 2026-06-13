import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";

export default function Index() {
  const { isAuthenticated, checkAuth, isLoading } = useAuthStore();
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    const verifyAuth = async () => {
      await checkAuth();
      setHasChecked(true);
    };
    verifyAuth();
  }, [checkAuth]);

  // Show loading while checking auth status
  if (isLoading || !hasChecked) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
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
