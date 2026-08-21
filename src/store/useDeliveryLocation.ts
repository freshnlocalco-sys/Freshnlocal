import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DeliveryZone, getZoneByPincode } from '../lib/deliveryZones';

export interface SelectedLocation {
  pincode: string;
  areaName: string;
  mainArea: string;
  formattedDisplay: string;
}

interface DeliveryLocationStore {
  selectedLocation: SelectedLocation | null;
  isLocationModalOpen: boolean;
  hasPromptedLocation: boolean;
  
  openLocationModal: () => void;
  closeLocationModal: () => void;
  setLocation: (pincode: string, areaName: string) => void;
  clearLocation: () => void;
  setHasPromptedLocation: (prompted: boolean) => void;
}

export const useDeliveryLocation = create<DeliveryLocationStore>()(
  persist(
    (set, get) => ({
      selectedLocation: null,
      isLocationModalOpen: false,
      hasPromptedLocation: false,

      openLocationModal: () => set({ isLocationModalOpen: true }),
      closeLocationModal: () => set({ isLocationModalOpen: false }),

      setLocation: (pincode: string, areaName: string) => {
        const zone = getZoneByPincode(pincode);
        const mainArea = zone?.mainArea || areaName;
        const formattedDisplay = `${areaName}, ${pincode}`;
        set({
          selectedLocation: {
            pincode,
            areaName,
            mainArea,
            formattedDisplay,
          },
          isLocationModalOpen: false,
          hasPromptedLocation: true,
        });
      },

      clearLocation: () => set({ selectedLocation: null }),
      setHasPromptedLocation: (prompted: boolean) => set({ hasPromptedLocation: prompted }),
    }),
    {
      name: 'fnl-delivery-location-v1',
      partialize: (state) => ({
        selectedLocation: state.selectedLocation,
        hasPromptedLocation: state.hasPromptedLocation,
      }),
    }
  )
);
