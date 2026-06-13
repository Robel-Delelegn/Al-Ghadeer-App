import { icons } from "@/constants";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Image, ImageSourcePropType, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TabIcon = ({
  source,
  focused,
}: {
  source: ImageSourcePropType;
  focused: boolean;
}) => (
  <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
    <View
      className={`rounded-2xl w-12 h-12 items-center justify-center ${focused ? "bg-[#0286FF]" : "bg-[#0F172A]"}`}
      style={{
        shadowColor: focused ? "#0286FF" : "#0F172A",
        shadowOpacity: focused ? 0.25 : 0.12,
        shadowRadius: focused ? 12 : 8,
        shadowOffset: { width: 0, height: focused ? 4 : 2 },
        elevation: focused ? 6 : 3,
        transform: [{ scale: focused ? 1.05 : 1 }],
      }}
    >
      <Image
        source={source}
        tintColor="white"
        resizeMode="contain"
        className="w-6 h-6"
        style={{
          opacity: focused ? 1 : 0.7,
        }}
      />
    </View>
  </View>
);

export default function Layout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        tabBarActiveTintColor: "white",
        tabBarInactiveTintColor: "white",
        tabBarShowLabel: false,
        tabBarBackground: () => (
          <BlurView tint="light" intensity={80} style={{ flex: 1 }} />
        ),
        tabBarStyle: {
          backgroundColor: "rgba(255, 255, 255, 0.95)",
          borderRadius: 28,
          paddingBottom: 8,
          paddingTop: 12,
          paddingHorizontal: 8,
          overflow: "hidden",
          marginHorizontal: 20,
          marginBottom: Math.max(insets.bottom, 12) + 8, // Float above bottom with extra spacing
          height: 72,
          justifyContent: "space-between",
          alignItems: "center",
          flexDirection: "row",
          position: "absolute",
          bottom: 0,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: "rgba(226, 232, 240, 0.8)",
          // Professional shadow
          shadowColor: "#000",
          shadowOffset: {
            width: 0,
            height: -4,
          },
          shadowOpacity: 0.12,
          shadowRadius: 20,
          elevation: 16,
        },
        tabBarItemStyle: {
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} source={icons.home} />
          ),
        }}
      />
      <Tabs.Screen
        name="delivery-history"
        options={{
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} source={icons.list} />
          ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} source={icons.dollar} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} source={icons.profile} />
          ),
        }}
      />
      <Tabs.Screen
        name="loaded-items"
        options={{
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} source={icons.checkmark} />
          ),
        }}
      />
      {/* Hidden screens not shown in tab bar */}
      <Tabs.Screen
        name="add-products"
        options={{
          headerShown: false,
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="bottles-assets"
        options={{
          headerShown: false,
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="organization-signature"
        options={{
          headerShown: false,
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="checkout"
        options={{
          headerShown: false,
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="order-details"
        options={{
          headerShown: false,
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="payment-confirmation"
        options={{
          headerShown: false,
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="payment-receipt"
        options={{
          headerShown: false,
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="failed-deliveries"
        options={{
          headerShown: false,
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="direct-sales"
        options={{
          headerShown: false,
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="direct-sale-bottles-assets"
        options={{
          headerShown: false,
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="direct-sale-confirmation"
        options={{
          headerShown: false,
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="assignments"
        options={{
          headerShown: false,
          href: null, // Hide from tab bar
        }}
      />
    </Tabs>
  );
}
