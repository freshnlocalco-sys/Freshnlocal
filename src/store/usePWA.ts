import { create } from 'zustand';

interface PWAState {
  deferredPrompt: any;
  setDeferredPrompt: (prompt: any) => void;
  showInstallPrompt: () => void;
}

export const usePWA = create<PWAState>((set, get) => ({
  deferredPrompt: null,
  setDeferredPrompt: (prompt) => set({ deferredPrompt: prompt }),
  showInstallPrompt: async () => {
    const { deferredPrompt } = get();
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      set({ deferredPrompt: null });
    }
  },
}));
