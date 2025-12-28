import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { Ionicons } from '@expo/vector-icons';
import { showErrorAlert, showSuccessAlert, showWarningAlert } from '@/store/utils/alert';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');

const SignIn = () => {
  const router = useRouter();
  const { requestOtp, verifyOtp, resendOtp, isLoading } = useAuthStore();
  const [phone, setPhone] = useState('+971');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isResendingOtp, setIsResendingOtp] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  
  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const phoneInputRef = useRef<TextInput>(null);
  const otpRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    if (showOtpModal) {
      // Focus first OTP input when modal opens
      setTimeout(() => {
        otpRefs.current[0]?.focus();
      }, 300);
    }
  }, [showOtpModal]);

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
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
      return;
    }

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    const result = await requestOtp(phone);

    if (result.success && result.requiresOtp && result.tempToken) {
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
      showErrorAlert('Error', result.message || 'Failed to send OTP. Please try again.');
    }
  };

  const handleOtpChange = (value: string, index: number) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    
    // Clear error immediately when user types
    setOtpError('');
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are entered
    // Use the newOtp value directly to avoid state update timing issues
    const otpString = newOtp.join('');
    if (otpString.length === 6 && newOtp.every(digit => digit !== '')) {
      // Wait for state to update and error to clear before auto-verifying
      setTimeout(() => {
        // Use the latest OTP value directly instead of relying on state
        verifyOtpWithValue(otpString);
      }, 400);
    }
  };

  const verifyOtpWithValue = async (otpString: string) => {
    if (otpString.length !== 6) {
      setOtpError('Please enter a valid 6-digit OTP');
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
      return;
    }

    if (!tempToken) {
      setOtpError('Session expired. Please try again.');
      return;
    }

    setIsVerifyingOtp(true);
    setOtpError('');

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    const result = await verifyOtp(phone, otpString, tempToken);

    if (result.success) {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}

      // Clear error state immediately before closing modal to prevent red flash
      setOtpError('');
      setOtp(['', '', '', '', '', '']);
      setIsVerifyingOtp(false);
      
      // Small delay to ensure UI updates before closing modal
      setTimeout(() => {
        setShowOtpModal(false);
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
          useAuthStore.getState().signOut();
        }
      }, 100);
      
      return;
    } else {
      setOtpError(result.message || 'Invalid OTP. Please try again.');
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
      setIsVerifyingOtp(false);
    }

    setIsVerifyingOtp(false);
  };

  const handleOtpKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const onVerifyOtp = async () => {
    const otpString = otp.join('');
    await verifyOtpWithValue(otpString);
  };

  const onResendOtp = async () => {
    if (countdown > 0 || !tempToken) return;

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

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
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } else {
      showErrorAlert('Error', result.message || 'Failed to resend OTP. Please try again.');
    }

    setIsResendingOtp(false);
  };

  const closeOtpModal = () => {
    setShowOtpModal(false);
    setOtp(['', '', '', '', '', '']);
    setOtpError('');
    setTempToken(null);
    setCountdown(0);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={[
              styles.content,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {/* Header Section */}
            <View style={styles.header}>
              <View style={styles.logoContainer}>
                <View style={styles.logoCircle}>
                  <Ionicons name="water" size={32} color="#0286FF" />
                </View>
              </View>
              <Text style={styles.welcomeText}>Welcome Back</Text>
              <Text style={styles.subtitleText}>
                Sign in to continue your journey
              </Text>
            </View>

            {/* Form Section */}
            <View style={styles.formContainer}>
              {/* Phone Input */}
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <View
                  style={[
                    styles.inputContainer,
                    errors.phone && styles.inputContainerError,
                    focusedIndex === -1 && styles.inputContainerFocused,
                  ]}
                >
                  <View style={styles.inputIconContainer}>
                    <Ionicons
                      name="call-outline"
                      size={20}
                      color={errors.phone ? '#EF4444' : focusedIndex === -1 ? '#0286FF' : '#94A3B8'}
                    />
                  </View>
                  <TextInput
                    ref={phoneInputRef}
                    style={styles.input}
                    placeholder="+971 XX XXX XXXX"
                    placeholderTextColor="#CBD5E1"
                    value={phone}
                    onChangeText={(value) => {
                      setPhone(value);
                      if (errors.phone) setErrors({ ...errors, phone: '' });
                    }}
                    onFocus={() => setFocusedIndex(-1)}
                    onBlur={() => setFocusedIndex(null)}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    textContentType="telephoneNumber"
                  />
                </View>
                {errors.phone && (
                  <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle" size={14} color="#EF4444" />
                    <Text style={styles.errorText}>{errors.phone}</Text>
                  </View>
                )}
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                onPress={onPhoneSubmit}
                disabled={isLoading}
                style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                activeOpacity={0.9}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.submitButtonText}>Continue</Text>
                    <Ionicons name="arrow-forward" size={20} color="#FFFFFF" style={styles.submitIcon} />
                  </>
                )}
                <View style={styles.submitButtonGlow} />
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>Secure Authentication</Text>
                <View style={styles.dividerLine} />
              </View>
              <View style={styles.securityInfo}>
                <Ionicons name="shield-checkmark" size={16} color="#10B981" />
                <Text style={styles.securityText}>
                  Your data is protected with end-to-end encryption
                </Text>
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Premium OTP Modal */}
      <Modal
        visible={showOtpModal}
        transparent={true}
        animationType="fade"
        onRequestClose={closeOtpModal}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={closeOtpModal}
          />
          <Animated.View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalIconContainer}>
                <View style={styles.modalIconCircle}>
                  <Ionicons name="lock-closed" size={24} color="#0286FF" />
                </View>
              </View>
              <TouchableOpacity
                onPress={closeOtpModal}
                style={styles.modalCloseButton}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalTitle}>Verify Your Phone</Text>
            <Text style={styles.modalSubtitle}>
              We've sent a 6-digit code to
            </Text>
            <Text style={styles.modalPhone}>{phone}</Text>

            {/* OTP Input Grid */}
            <View style={styles.otpContainer}>
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => {
                    otpRefs.current[index] = ref;
                  }}
                  style={[
                    styles.otpInput,
                    digit && styles.otpInputFilled,
                    focusedIndex === index && styles.otpInputFocused,
                    otpError && styles.otpInputError,
                  ]}
                  value={digit}
                  onChangeText={(value) => handleOtpChange(value, index)}
                  onKeyPress={(e) => handleOtpKeyPress(e, index)}
                  onFocus={() => setFocusedIndex(index)}
                  onBlur={() => setFocusedIndex(null)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                />
              ))}
            </View>

            {otpError && (
              <View style={styles.otpErrorContainer}>
                <Ionicons name="alert-circle" size={14} color="#EF4444" />
                <Text style={styles.otpErrorText}>{otpError}</Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={onResendOtp}
                disabled={countdown > 0 || isResendingOtp}
                style={[
                  styles.resendButton,
                  (countdown > 0 || isResendingOtp) && styles.resendButtonDisabled,
                ]}
                activeOpacity={0.7}
              >
                {isResendingOtp ? (
                  <ActivityIndicator size="small" color="#0286FF" />
                ) : (
                  <>
                    <Ionicons
                      name="refresh"
                      size={16}
                      color={countdown > 0 ? '#94A3B8' : '#0286FF'}
                    />
                    <Text
                      style={[
                        styles.resendButtonText,
                        countdown > 0 && styles.resendButtonTextDisabled,
                      ]}
                    >
                      {countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onVerifyOtp}
                disabled={otp.join('').length !== 6 || isVerifyingOtp}
                style={[
                  styles.verifyButton,
                  (otp.join('').length !== 6 || isVerifyingOtp) && styles.verifyButtonDisabled,
                ]}
                activeOpacity={0.9}
              >
                {isVerifyingOtp ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.verifyButtonText}>Verify</Text>
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                  </>
                )}
                <View style={styles.verifyButtonGlow} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
  },
  header: {
    alignItems: 'center',
    marginTop: Platform.OS === 'ios' ? 60 : 40,
    marginBottom: 48,
  },
  logoContainer: {
    marginBottom: 24,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#DBEAFE',
    shadowColor: '#0286FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  welcomeText: {
    fontSize: 36,
    fontFamily: 'Jakarta-ExtraBold',
    color: '#0F172A',
    marginBottom: 12,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitleText: {
    fontSize: 16,
    fontFamily: 'Jakarta-Regular',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 24,
    letterSpacing: 0.2,
  },
  formContainer: {
    marginTop: 8,
  },
  inputWrapper: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: 'Jakarta-SemiBold',
    color: '#475569',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  inputContainerFocused: {
    borderColor: '#0286FF',
    shadowColor: '#0286FF',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  inputContainerError: {
    borderColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOpacity: 0.1,
  },
  inputIconContainer: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Jakarta-SemiBold',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'Jakarta-Medium',
    color: '#EF4444',
  },
  submitButton: {
    width: '100%',
    height: 60,
    borderRadius: 16,
    backgroundColor: '#0286FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    overflow: 'hidden',
    shadowColor: '#0286FF',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 17,
    fontFamily: 'Jakarta-SemiBold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginRight: 8,
  },
  submitIcon: {
    marginLeft: 4,
  },
  submitButtonGlow: {
    position: 'absolute',
    top: -20,
    left: -20,
    right: -20,
    bottom: -20,
    backgroundColor: '#0286FF',
    opacity: 0.2,
    borderRadius: 40,
  },
  footer: {
    marginTop: 48,
    alignItems: 'center',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    fontSize: 12,
    fontFamily: 'Jakarta-Medium',
    color: '#94A3B8',
    marginHorizontal: 16,
    letterSpacing: 0.5,
  },
  securityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  securityText: {
    fontSize: 13,
    fontFamily: 'Jakarta-Regular',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 40,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#DBEAFE',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 28,
    fontFamily: 'Jakarta-ExtraBold',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 15,
    fontFamily: 'Jakarta-Regular',
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalPhone: {
    fontSize: 16,
    fontFamily: 'Jakarta-SemiBold',
    color: '#0286FF',
    textAlign: 'center',
    marginBottom: 32,
    letterSpacing: 0.3,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 12,
  },
  otpInput: {
    flex: 1,
    height: 64,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    textAlign: 'center',
    fontSize: 24,
    fontFamily: 'Jakarta-Bold',
    color: '#0F172A',
    letterSpacing: 2,
  },
  otpInputFilled: {
    borderColor: '#0286FF',
    backgroundColor: '#EFF6FF',
  },
  otpInputFocused: {
    borderColor: '#0286FF',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0286FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  otpInputError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  otpErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 20,
  },
  otpErrorText: {
    fontSize: 13,
    fontFamily: 'Jakarta-Medium',
    color: '#EF4444',
  },
  modalActions: {
    gap: 12,
  },
  resendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  resendButtonDisabled: {
    opacity: 0.5,
  },
  resendButtonText: {
    fontSize: 15,
    fontFamily: 'Jakarta-SemiBold',
    color: '#0286FF',
  },
  resendButtonTextDisabled: {
    color: '#94A3B8',
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: '#0286FF',
    gap: 8,
    overflow: 'hidden',
    shadowColor: '#0286FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  verifyButtonDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
    elevation: 0,
  },
  verifyButtonText: {
    fontSize: 16,
    fontFamily: 'Jakarta-SemiBold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  verifyButtonGlow: {
    position: 'absolute',
    top: -15,
    left: -15,
    right: -15,
    bottom: -15,
    backgroundColor: '#0286FF',
    opacity: 0.15,
    borderRadius: 30,
  },
});

export default SignIn;
