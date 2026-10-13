import { create } from "zustand";

/**
 * Session-only view state. `fitPending` asks the preview to frame the next result built for the
 * current params; it starts true so the first geometry is framed. A result that was built for
 * older params (still on screen after a generator switch or settings load) never takes it.
 */
type ViewState = {
  fitPending: boolean;
  fitOnNextResult: () => void;
  clearFitPending: () => void;
};

export const useView = create<ViewState>((set) => ({
  fitPending: true,
  fitOnNextResult: () => set({ fitPending: true }),
  clearFitPending: () => set({ fitPending: false }),
}));
