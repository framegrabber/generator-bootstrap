import { create } from "zustand";
import { findGenerator } from "../generators";
import { defaultParams } from "../core/params";
import type { ParamValue, Params } from "../core/types";
import { defaultSnapshot, type Snapshot } from "./snapshot";
import { useView } from "./view-store";

export type ParamsState = {
  generatorId: string;
  values: Params;
  setValue: (key: string, value: ParamValue) => void;
  selectGenerator: (id: string) => void;
  replace: (snapshot: Snapshot) => void;
};

const initial = defaultSnapshot();

export const useParams = create<ParamsState>((set) => ({
  generatorId: initial.generator,
  values: initial.values,
  setValue: (key, value) => set((s) => ({ values: { ...s.values, [key]: value } })),
  selectGenerator: (id) => {
    const def = findGenerator(id);
    if (!def) return;
    set({ generatorId: def.id, values: defaultParams(def.params) });
    useView.getState().fitOnNextResult();
  },
  replace: (snapshot) => {
    set({ generatorId: snapshot.generator, values: snapshot.values });
    useView.getState().fitOnNextResult();
  },
}));
