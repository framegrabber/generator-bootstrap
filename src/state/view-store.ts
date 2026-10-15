import { create } from "zustand";

/** Assembled: parts that set `assembled`, in place. Print: every part in its print pose. */
export type ViewLayout = "assembled" | "print";

/**
 * Session-only view state. `fitPending` asks the preview to frame the next result built for the
 * current params; it starts true so the first geometry is framed. A result that was built for
 * older params (still on screen after a generator switch or settings load) never takes it.
 * `layout` and `showCuts` apply only when the result has assembled parts and cut planes.
 */
type ViewState = {
  fitPending: boolean;
  layout: ViewLayout;
  showCuts: boolean;
  fitOnNextResult: () => void;
  clearFitPending: () => void;
  /** Switches layout and reframes, since the two layouts occupy different space. */
  setLayout: (layout: ViewLayout) => void;
  toggleCuts: () => void;
};

export const useView = create<ViewState>((set) => ({
  fitPending: true,
  layout: "assembled",
  showCuts: true,
  fitOnNextResult: () => set({ fitPending: true }),
  clearFitPending: () => set({ fitPending: false }),
  setLayout: (layout) => set({ layout, fitPending: true }),
  toggleCuts: () => set((s) => ({ showCuts: !s.showCuts })),
}));
