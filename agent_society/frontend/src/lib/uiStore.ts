import { create } from "zustand";

interface UiState {
  leftView: "office" | "terminal";
  setLeftView: (v: "office" | "terminal") => void;
  // Deepest region level shown in the office + used for the next meeting.
  maxLevel: number;
  setMaxLevel: (n: number) => void;
}

export const useUiStore = create<UiState>((set) => ({
  leftView: "office",
  setLeftView: (leftView) => set({ leftView }),
  maxLevel: 3,
  setMaxLevel: (maxLevel) => set({ maxLevel }),
}));
