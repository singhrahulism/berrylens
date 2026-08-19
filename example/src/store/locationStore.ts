import { create } from "zustand";

export interface LocationState {
  lat: number;
  lng: number;
  jitter: () => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  lat: 37.7749,
  lng: -122.4194,
  jitter: () =>
    set((state) => ({
      lat: state.lat + (Math.random() - 0.5) * 0.01,
      lng: state.lng + (Math.random() - 0.5) * 0.01,
    })),
}));
