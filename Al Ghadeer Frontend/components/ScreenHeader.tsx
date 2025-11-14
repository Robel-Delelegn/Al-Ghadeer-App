import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

interface ScreenHeaderProps {
  title: string;
  showBack?: boolean;
  right?: React.ReactNode;
}

const ScreenHeader: React.FC<ScreenHeaderProps> = ({ title, showBack = true, right }) => {
  const router = useRouter();
  return (
    <BlurView intensity={30} tint="light" className="px-4 py-3 flex-row items-center justify-between">
      <View className="w-8">
        {showBack && (
          <TouchableOpacity onPress={() => router.back()} className="pt-10 -ml-2">
            <Ionicons name="arrow-back" size={24} color="#0F172A" />
          </TouchableOpacity>
        )}
      </View>
      <Text className="text-[#0F172A] text-xl font-JakartaSemiBold pt-10">{title}</Text>
      <View className="w-8">{right}</View>
    </BlurView>
  );
};

export default ScreenHeader;


