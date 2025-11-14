import { ButtonProps } from '@/types/type';
import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import { Text, TouchableOpacity } from 'react-native';

const getBgVariantStyle = (variant: ButtonProps['bgVariant']) => {
  switch (variant) {
    case 'secondary':
      return 'bg-gray-500';
    case 'danger':
      return 'bg-red-500';
    case 'success':
      return 'bg-green-500';
    case 'outline':
      return 'bg-transparent border-neutral-300 border-[0.5px]';
    default:
      return 'bg-[#0286ff]';
  }
};
const getTextVariantStyle = (variant: ButtonProps['textVariant']) => {
  switch (variant) {
    case 'primary':
      return 'text-black';
    case 'secondary':
      return 'text-gray-100';
    case 'danger':
      return 'bg-red-100';
    case 'success':
      return 'text-green-100';

    default:
      return 'text-white';
  }
};

const CustomButton = ({
  onPress,
  title,
  bgVariant = 'primary',
  textVariant = 'default',
  IconLeft,
  IconRight,
  className,
  ...props
}: ButtonProps) => {
  const handlePress = useCallback(async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    onPress?.();
  }, [onPress]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.9}
      className={`w-full rounded-2xl px-5 py-3 flex flex-row justify-center items-center ${getBgVariantStyle(bgVariant)} ${className}`}
      style={{
        shadowColor: '#0F172A',
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 6,
      }}
      {...props}
    >
      {IconLeft && <IconLeft />}
      <Text className={`text-lg font-JakartaSemiBold ${getTextVariantStyle(textVariant)}`}>
        {title}
      </Text>
      {IconRight && <IconRight />}
    </TouchableOpacity>
  );
};

export default CustomButton;
