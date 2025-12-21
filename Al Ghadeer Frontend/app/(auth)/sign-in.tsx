import { Text, View, ScrollView, Image, ActivityIndicator, Modal, TextInput, TouchableOpacity } from 'react-native';
import { showErrorAlert, showSuccessAlert, showWarningAlert } from '@/utils/alert';
import { icons, images } from '@/constants';
import InputField from '@/components/InputField';
import { useState } from 'react';
import CustomButton from '@/components/CustomButton';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { Ionicons } from '@expo/vector-icons';

const SignIn = () => {
  const router = useRouter();
  const { requestOtp, verifyOtp, resendOtp, isLoading } = useAuthStore();
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isResendingOtp, setIsResendingOtp] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [tempToken, setTempToken] = useState<string | null>(null);

  const validatePhone = () => {
    if (!phone.trim()) {
      setErrors({ phone: 'Phone number is required' });
      return false;
    }
    if (!/^\+?[1-9]\d{1,14}$/.test(phone.replace(/\s/g, ''))) {
      setErrors({ phone: 'Please enter a valid phone number' });
      return false;
    }
    setErrors({});
    return true;
  };

  const onPhoneSubmit = async () => {
    if (!validatePhone()) {
      return;
    }

    console.log('onPhoneSubmit called with phone:', phone);
    
    // Request OTP - server sends SMS and returns temporary token
    const result = await requestOtp(phone);
    
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
      showErrorAlert('Error', result.message || 'Failed to send OTP. Please try again.');
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

    const result = await verifyOtp(phone, otp, tempToken);

    if (result.success) {
      setShowOtpModal(false);
      setOtp('');
      setTempToken(null);
      
      const user = useAuthStore.getState().user;
      
      if (user?.status === 'pending') {
        showWarningAlert(
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
      } else if (user?.status === 'approved') {
        router.replace('/(root)/(tabs)/home');
      } else {
        showErrorAlert('Account Rejected', 'Your account has been rejected. Please contact the administrator.');
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
    const result = await resendOtp(phone, tempToken);

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
      showSuccessAlert('OTP Resent', 'A new OTP has been sent to your phone number.');
    } else {
      showErrorAlert('Error', result.message || 'Failed to resend OTP. Please try again.');
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
          <InputField
            label="Phone Number"
            placeholder="Enter your phone number"
            icon={icons.person}
            value={phone}
            onChangeText={(value: any) => {
              setPhone(value);
              if (errors.phone) setErrors({ ...errors, phone: '' });
            }}
            keyboardType="phone-pad"
          />
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
              {phone}
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
