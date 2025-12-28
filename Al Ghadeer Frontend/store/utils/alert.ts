import { useAlertStore } from '@/store/alert';
import { AlertButton } from '@/components/CustomAlert';

/**
 * Custom alert utility to replace React Native's Alert.alert
 * This provides a modern, premium alert design that matches the app
 */

// Re-export the store hook for convenience
export { useAlertStore };

/**
 * Show a success alert
 */
export const showSuccessAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[]
) => {
  const { showSuccess } = useAlertStore.getState();
  showSuccess(title, message, buttons);
};

/**
 * Show an error alert
 */
export const showErrorAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[]
) => {
  const { showError } = useAlertStore.getState();
  showError(title, message, buttons);
};

/**
 * Show a warning alert
 */
export const showWarningAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[]
) => {
  const { showWarning } = useAlertStore.getState();
  showWarning(title, message, buttons);
};

/**
 * Show an info alert
 */
export const showInfoAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[]
) => {
  const { showInfo } = useAlertStore.getState();
  showInfo(title, message, buttons);
};

/**
 * Show a custom alert with full configuration
 */
export const showAlert = (config: {
  title: string;
  message?: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  buttons?: AlertButton[];
  onDismiss?: () => void;
}) => {
  const { showAlert } = useAlertStore.getState();
  showAlert(config);
};

/**
 * Replacement for Alert.alert with automatic type detection
 * Attempts to infer alert type from title/message
 */
export const alert = (
  title: string,
  message?: string,
  buttons?: AlertButton[]
) => {
  // Auto-detect type from title
  const titleLower = title.toLowerCase();
  
  if (titleLower.includes('error') || titleLower.includes('failed') || titleLower.includes('fail')) {
    showErrorAlert(title, message, buttons);
  } else if (titleLower.includes('success') || titleLower.includes('successful')) {
    showSuccessAlert(title, message, buttons);
  } else if (titleLower.includes('warning') || titleLower.includes('required') || titleLower.includes('missing')) {
    showWarningAlert(title, message, buttons);
  } else {
    showInfoAlert(title, message, buttons);
  }
};
