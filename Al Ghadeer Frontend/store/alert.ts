import { create } from 'zustand';
import { AlertConfig, AlertType } from '@/components/CustomAlert';

interface AlertStore {
  visible: boolean;
  config: AlertConfig | null;
  showAlert: (config: AlertConfig) => void;
  hideAlert: () => void;
  // Convenience methods
  showSuccess: (title: string, message?: string, buttons?: AlertConfig['buttons']) => void;
  showError: (title: string, message?: string, buttons?: AlertConfig['buttons']) => void;
  showWarning: (title: string, message?: string, buttons?: AlertConfig['buttons']) => void;
  showInfo: (title: string, message?: string, buttons?: AlertConfig['buttons']) => void;
}

export const useAlertStore = create<AlertStore>((set) => ({
  visible: false,
  config: null,
  
  showAlert: (config: AlertConfig) => {
    set({ config, visible: true });
  },
  
  hideAlert: () => {
    set({ visible: false });
  },
  
  showSuccess: (title: string, message?: string, buttons?: AlertConfig['buttons']) => {
    set({
      config: { title, message, type: 'success', buttons },
      visible: true,
    });
  },
  
  showError: (title: string, message?: string, buttons?: AlertConfig['buttons']) => {
    set({
      config: { title, message, type: 'error', buttons },
      visible: true,
    });
  },
  
  showWarning: (title: string, message?: string, buttons?: AlertConfig['buttons']) => {
    set({
      config: { title, message, type: 'warning', buttons },
      visible: true,
    });
  },
  
  showInfo: (title: string, message?: string, buttons?: AlertConfig['buttons']) => {
    set({
      config: { title, message, type: 'info', buttons },
      visible: true,
    });
  },
}));
