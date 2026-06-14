import { create } from "zustand";

interface UiState {
  leftView: "office" | "terminal";
  setLeftView: (v: "office" | "terminal") => void;
  // Deepest region level shown in the office + used for the next meeting.
  maxLevel: number;
  setMaxLevel: (n: number) => void;
  // Whether to draw the connectome interaction edges (off by default — they get
  // busy with many regions).
  showLinks: boolean;
  setShowLinks: (v: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  leftView: "office",
  setLeftView: (leftView) => set({ leftView }),
  maxLevel: 3,
  setMaxLevel: (maxLevel) => set({ maxLevel }),
  showLinks: false,
  setShowLinks: (showLinks) => set({ showLinks }),
}));
