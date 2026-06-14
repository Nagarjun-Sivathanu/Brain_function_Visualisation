import { create } from "zustand";

interface UiState {
  leftView: "office" | "terminal";
  setLeftView: (v: "office" | "terminal") => void;
}

export const useUiStore = create<UiState>((set) => ({
  leftView: "office",
  setLeftView: (leftView) => set({ leftView }),
}));
