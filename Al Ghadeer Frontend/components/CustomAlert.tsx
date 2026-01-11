import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface AlertConfig {
  title: string;
  message?: string;
  type?: AlertType;
  buttons?: AlertButton[];
  onDismiss?: () => void;
}

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface CustomAlertProps {
  visible: boolean;
  config: AlertConfig | null;
  onClose: () => void;
}

const CustomAlert: React.FC<CustomAlertProps> = ({ visible, config, onClose }) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!config) return null;

  const type = config.type || 'info';
  const buttons = config.buttons || [{ text: 'OK', onPress: onClose }];

  const getTypeConfig = () => {
    switch (type) {
      case 'success':
        return {
          icon: 'checkmark-circle' as const,
          iconColor: '#10B981',
          backgroundColor: '#ECFDF5',
          borderColor: '#10B981',
          titleColor: '#065F46',
        };
      case 'error':
        return {
          icon: 'close-circle' as const,
          iconColor: '#EF4444',
          backgroundColor: '#FEF2F2',
          borderColor: '#EF4444',
          titleColor: '#991B1B',
        };
      case 'warning':
        return {
          icon: 'warning' as const,
          iconColor: '#F59E0B',
          backgroundColor: '#FFFBEB',
          borderColor: '#F59E0B',
          titleColor: '#92400E',
        };
      default:
        return {
          icon: 'information-circle' as const,
          iconColor: '#0286FF',
          backgroundColor: '#EFF6FF',
          borderColor: '#0286FF',
          titleColor: '#1E40AF',
        };
    }
  };

  const typeConfig = getTypeConfig();

  const handleButtonPress = (button: AlertButton) => {
    if (button.onPress) {
      button.onPress();
    }
    onClose();
    if (config.onDismiss) {
      config.onDismiss();
    }
  };

  const getButtonStyle = (button: AlertButton, index: number) => {
    if (button.style === 'destructive') {
      return styles.destructiveButton;
    }
    if (button.style === 'cancel') {
      return styles.cancelButton;
    }
    if (buttons.length === 1) {
      return [styles.primaryButton, { backgroundColor: typeConfig.iconColor }];
    }
    if (index === buttons.length - 1) {
      return [styles.primaryButton, { backgroundColor: typeConfig.iconColor }];
    }
    return styles.secondaryButton;
  };

  const getButtonTextStyle = (button: AlertButton) => {
    if (button.style === 'destructive') {
      return styles.destructiveButtonText;
    }
    if (button.style === 'cancel') {
      return styles.cancelButtonText;
    }
    if (buttons.length === 1 || button === buttons[buttons.length - 1]) {
      return styles.primaryButtonText;
    }
    return styles.secondaryButtonText;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <Animated.View
          style={[
            styles.container,
            {
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          <View
            style={[
              styles.alertContainer,
              {
                backgroundColor: typeConfig.backgroundColor,
                borderColor: typeConfig.borderColor,
              },
            ]}
          >
            {/* Icon */}
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: typeConfig.iconColor + '15' },
              ]}
            >
              <Ionicons
                name={typeConfig.icon}
                size={48}
                color={typeConfig.iconColor}
              />
            </View>

            {/* Title */}
            <Text
              style={[
                styles.title,
                { color: typeConfig.titleColor },
              ]}
            >
              {config.title}
            </Text>

            {/* Message */}
            {config.message && (
              <Text style={styles.message}>{config.message}</Text>
            )}

            {/* Buttons */}
            <View
              style={[
                styles.buttonContainer,
                buttons.length > 2 && styles.buttonContainerColumn,
              ]}
            >
              {buttons.map((button, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.button,
                    getButtonStyle(button, index),
                    buttons.length === 1 && styles.singleButton,
                    buttons.length > 2 && styles.columnButton,
                  ]}
                  onPress={() => handleButtonPress(button)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      getButtonTextStyle(button),
                    ]}
                  >
                    {button.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: width - 48,
    maxWidth: 400,
  },
  alertContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    borderWidth: 2,
    shadowColor: '#1E40AF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    fontFamily: 'JakartaSemiBold',
    letterSpacing: 0.3,
  },
  message: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
    fontFamily: 'JakartaRegular',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  buttonContainerColumn: {
    flexDirection: 'column',
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  singleButton: {
    flex: 1,
  },
  columnButton: {
    flex: 0,
    width: '100%',
  },
  primaryButton: {
    backgroundColor: '#0286FF',
    shadowColor: '#0286FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  secondaryButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelButton: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  destructiveButton: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'JakartaSemiBold',
  },
  primaryButtonText: {
    color: '#FFFFFF',
  },
  secondaryButtonText: {
    color: '#374151',
  },
  cancelButtonText: {
    color: '#6B7280',
  },
  destructiveButtonText: {
    color: '#DC2626',
  },
});

export default CustomAlert;
