import { InputFieldProps } from '@/types/type';
import { useState } from 'react';
import {
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    View,
} from 'react-native';

const InputField = ({
  label,
  labelStyle,
  icon,
  secureTextEntry = false,
  containerStyle,
  inputStyle,
  iconStyle,
  className,
  ...props
}: InputFieldProps) => {
  const [focused, setFocused] = useState(false);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="my-2 w-full">
          <Text className={`text-sm font-JakartaMedium mb-2 text-gray-600 ${labelStyle}`}>
            {label}
          </Text>
          <View
            className={`flex-row items-center bg-white rounded-2xl border ${focused ? 'border-[#0286FF]' : 'border-gray-200'} ${containerStyle}`}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              shadowColor: '#0F172A',
              shadowOpacity: focused ? 0.12 : 0.06,
              shadowRadius: focused ? 16 : 12,
              shadowOffset: { width: 0, height: 8 },
              elevation: focused ? 6 : 3,
            }}
          >
            {icon && (
              <Image source={icon} className={`w-5 h-5 mr-3 ${iconStyle}`} />
            )}
            <TextInput
              className={`font-JakartaMedium text-[15px] flex-1 ${inputStyle} text-left`}
              secureTextEntry={secureTextEntry}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholderTextColor="#94A3B8"
              {...props}
            />
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

export default InputField;
