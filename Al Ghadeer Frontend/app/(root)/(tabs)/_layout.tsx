import { icons } from '@/constants';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Image, ImageSourcePropType, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TabIcon = ({
  source,
  focused,
}: {
  source: ImageSourcePropType;
  focused: boolean;
}) => (
  <View className={`flex flex-row justify-center items-center rounded-full ${focused ? '' : ''}`}>
    <View className={`rounded-2xl w-12 h-12 items-center justify-center ${focused ? 'bg-[#0286FF]' : 'bg-[#0F172A]'} `}
      style={{ shadowColor: '#0F172A', shadowOpacity: focused ? 0.2 : 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4 }}>
      <Image
        source={source}
        tintColor="white"
        resizeMode="contain"
        className="w-6 h-6"
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
        tabBarActiveTintColor: 'white',
        tabBarInactiveTintColor: 'white',
        tabBarShowLabel: false,
        tabBarBackground: () => (
          <BlurView tint="light" intensity={30} style={{ flex: 1 }} />
        ),
        tabBarStyle: {
          backgroundColor: 'rgba(255,255,255,0.6)',
          borderRadius: 28,
          paddingBottom: 6,
          overflow: 'hidden',
          marginHorizontal: 16,
          height: 70,
          justifyContent: 'space-between',
          alignItems: 'center',
          flexDirection: 'row',
          position: 'absolute',
          bottom: insets.bottom + 10,
          borderTopWidth: 0,
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
        name="unsuccessful-report"
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
    </Tabs>
  );
}
