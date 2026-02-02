import { Text, View } from 'react-native';

interface ApiErrorTextProps {
  error?: string | null;
  className?: string;
}

/** Small inline error text for 4xx API responses - no alert, just subtle display */
export default function ApiErrorText({ error, className = '' }: ApiErrorTextProps) {
  if (!error) return null;
  return (
    <View className={`py-2 px-3 ${className}`}>
      <Text className="text-xs text-amber-600" numberOfLines={2}>
        {error}
      </Text>
    </View>
  );
}
