import { Text, View, ScrollView, Image, Alert, ActivityIndicator, Modal, TextInput, TouchableOpacity } from 'react-native';
import { icons, images } from '@/constants';
import InputField from '@/components/InputField';
import { useState, useEffect } from 'react';
import CustomButton from '@/components/CustomButton';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { Ionicons } from '@expo/vector-icons';

const SignIn = () => {
  const router = useRouter();
  const { requestOtp, verifyOtp, resendOtp, isLoading, clearAuth } = useAuthStore();
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isResendingOtp, setIsResendingOtp] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [tempToken, setTempToken] = useState<string | null>(null);

  // Clear any existing auth when component mounts (starting fresh sign-in)
  useEffect(() => {
    clearAuth();
  }, []);

  const validatePhone = () => {
    if (!phone.trim()) {
      setErrors({ phone: 'Phone number is required' });
      return false;
    }
    // Validate phone number (should be 9 digits for UAE after +971)
    if (!/^\d{9}$/.test(phone.replace(/\s/g, ''))) {
      setErrors({ phone: 'Please enter a valid 9-digit phone number' });
      return false;
    }
    setErrors({});
    return true;
  };

  const onPhoneSubmit = async () => {
    if (!validatePhone()) {
      return;
    }

    // Clear any existing auth before starting new sign-in
    await clearAuth();

    // Prepend +971 prefix to phone number
    const fullPhone = `+971${phone.replace(/\s/g, '')}`;
    console.log('onPhoneSubmit called with phone:', fullPhone);
    
    // Request OTP - server sends SMS and returns temporary token
    const result = await requestOtp(fullPhone);
    
    console.log('requestOtp result:', result);
    console.log('Result check:', {
      success: result.success,
      requiresOtp: result.requiresOtp,
      tempToken: result.tempToken,
      hasTempToken: !!result.tempToken
    });

    if (result.success && result.requiresOtp && result.tempToken) {
      console.log('✅ Conditions met, showing OTP modal');
      // Show OTP modal
      setTempToken(result.tempToken);
      setShowOtpModal(true);
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      console.error('❌ Conditions not met for OTP modal:', result);
      Alert.alert('Error', result.message || 'Failed to send OTP. Please try again.');
    }
  };

  const onVerifyOtp = async () => {
    if (!otp.trim() || otp.length !== 6) {
      setOtpError('Please enter a valid 6-digit OTP');
      return;
    }

    if (!tempToken) {
      setOtpError('Session expired. Please try again.');
      return;
    }

    setIsVerifyingOtp(true);
    setOtpError('');

    // Use full phone number with +971 prefix
    const fullPhone = `+971${phone.replace(/\s/g, '')}`;
    const result = await verifyOtp(fullPhone, otp, tempToken);

    if (result.success) {
      setShowOtpModal(false);
      setOtp('');
      setTempToken(null);
      
      // Wait a moment for state to be fully set
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const user = useAuthStore.getState().user;
      const isAuth = useAuthStore.getState().isAuthenticated;
      
      if (user?.status === 'pending') {
        Alert.alert(
          'Account Pending Approval',
          'Your phone number has been verified. Please wait for approval from the administrator.',
          [
            {
              text: 'OK',
              onPress: async () => {
                await useAuthStore.getState().signOut();
              },
            },
          ]
        );
      } else if (user?.status === 'approved' && isAuth) {
        // Navigate to home page
        router.replace('/(root)/(tabs)/home');
      } else {
        Alert.alert('Account Rejected', 'Your account has been rejected. Please contact the administrator.');
        await useAuthStore.getState().signOut();
      }
    } else {
      setOtpError(result.message || 'Invalid OTP. Please try again.');
    }

    setIsVerifyingOtp(false);
  };

  const onResendOtp = async () => {
    if (countdown > 0 || !tempToken) return;

    setIsResendingOtp(true);
    // Use full phone number with +971 prefix
    const fullPhone = `+971${phone.replace(/\s/g, '')}`;
    const result = await resendOtp(fullPhone, tempToken);

    if (result.success) {
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      Alert.alert('OTP Resent', 'A new OTP has been sent to your phone number.');
    } else {
      Alert.alert('Error', result.message || 'Failed to resend OTP. Please try again.');
    }

    setIsResendingOtp(false);
  };

  return (
    <ScrollView className="flex-1 bg-white">
      <View className="flex-1 bg-white">
        <View className="relative w-full h-[250px]">
          <Image source={images.signUpCar} className="z-0 w-full h-[250px]" />
          <Text className="text-2xl text-black font-JakartaSemiBold absolute bottom-5 left-5">
            Welcome
          </Text>
        </View>
        <View className="p-5">
          <View className="my-2 w-full">
            <Text className="text-sm font-JakartaMedium mb-2 text-gray-600">
              Phone Number
            </Text>
            <View
              className="flex-row items-center bg-white rounded-2xl border border-gray-200"
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                shadowColor: '#0F172A',
                shadowOpacity: 0.06,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 8 },
                elevation: 3,
              }}
            >
              <Image source={icons.person} className="w-5 h-5 mr-3" />
              <View className="flex-row items-center">
                <Text className="font-JakartaMedium text-[15px] text-gray-700 mr-2">
                  +971
                </Text>
                <TextInput
                  className="font-JakartaMedium text-[15px] flex-1 text-left"
                  placeholder="501234567"
                  placeholderTextColor="#94A3B8"
                  value={phone}
                  onChangeText={(value: any) => {
                    // Only allow digits and limit to 9 digits
                    const numericValue = value.replace(/[^0-9]/g, '').slice(0, 9);
                    setPhone(numericValue);
                    if (errors.phone) setErrors({ ...errors, phone: '' });
                  }}
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          </View>
          {errors.phone && (
            <Text className="text-red-500 text-sm mt-1 ml-2">{errors.phone}</Text>
          )}

          <CustomButton
            title={isLoading ? 'Sending OTP...' : 'Continue'}
            onPress={onPhoneSubmit}
            className="mt-6"
            disabled={isLoading}
          />
          {isLoading && (
            <View className="items-center mt-4">
              <ActivityIndicator size="small" color="#0286FF" />
            </View>
          )}
        </View>
      </View>

      {/* OTP Verification Modal */}
      <Modal
        visible={showOtpModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowOtpModal(false);
          setOtp('');
          setOtpError('');
          setTempToken(null);
        }}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}>
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 24,
            width: '100%',
            maxWidth: 400,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#212529' }}>
                Verify Phone Number
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowOtpModal(false);
                  setOtp('');
                  setOtpError('');
                  setTempToken(null);
                }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: '#F8F9FA',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="close" size={20} color="#6C757D" />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 14, color: '#6C757D', marginBottom: 8 }}>
              Enter the 6-digit code sent to
            </Text>
            <Text style={{ fontSize: 14, color: '#212529', fontWeight: '600', marginBottom: 24 }}>
              +971{phone.replace(/\s/g, '')}
            </Text>

            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#212529', marginBottom: 8 }}>
                OTP Code
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: otpError ? '#DC3545' : '#E9ECEF',
                  borderRadius: 8,
                  padding: 16,
                  fontSize: 18,
                  fontWeight: '600',
                  textAlign: 'center',
                  letterSpacing: 8,
                  backgroundColor: '#F8F9FA',
                }}
                value={otp}
                onChangeText={(value) => {
                  const numericValue = value.replace(/[^0-9]/g, '').slice(0, 6);
                  setOtp(numericValue);
                  if (otpError) setOtpError('');
                }}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="000000"
                placeholderTextColor="#9CA3AF"
                autoFocus
              />
              {otpError && (
                <Text style={{ color: '#DC3545', fontSize: 12, marginTop: 8 }}>
                  {otpError}
                </Text>
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              <TouchableOpacity
                onPress={onResendOtp}
                disabled={countdown > 0 || isResendingOtp}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: countdown > 0 ? '#E9ECEF' : '#F8F9FA',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#E9ECEF',
                }}
              >
                {isResendingOtp ? (
                  <ActivityIndicator size="small" color="#0286FF" />
                ) : (
                  <Text style={{
                    color: countdown > 0 ? '#6C757D' : '#0286FF',
                    fontSize: 14,
                    fontWeight: '600',
                  }}>
                    {countdown > 0 ? `Resend in ${countdown}s` : 'Resend OTP'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onVerifyOtp}
                disabled={otp.length !== 6 || isVerifyingOtp}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: otp.length === 6 && !isVerifyingOtp ? '#0286FF' : '#94A3B8',
                  alignItems: 'center',
                }}
              >
                {isVerifyingOtp ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>
                    Verify
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

export default SignIn;
