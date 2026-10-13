import { create } from "zustand";

/** Session-only view state. `fitToken` bumps to ask the preview to re-frame the model. */
type ViewState = {
  fitToken: number;
  requestFit: () => void;
};

export const useView = create<ViewState>((set) => ({
  fitToken: 0,
  requestFit: () => set((s) => ({ fitToken: s.fitToken + 1 })),
}));
