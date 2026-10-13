import { create } from "zustand";
import { buildGenerator, type BuildFn } from "../build/worker-client";
import { findGenerator } from "../generators";
import { validateParams } from "../core/params";
import { errorMessage } from "../core/protocol";
import type { GeneratorResult, ValidationIssue } from "../core/types";
import { useParams } from "./params-store";

export type BuildState = {
  issues: ValidationIssue[];
  /** Identity of the current params; a result may be exported only when `resultKey` matches. */
  currentKey: string;
  result: GeneratorResult | null;
  resultKey: string | null;
  error: string | null;
  busy: boolean;
};

const initialState: BuildState = {
  issues: [],
  currentKey: "",
  result: null,
  resultKey: null,
  error: null,
  busy: false,
};

export const useBuild = create<BuildState>(() => initialState);

export function canExport(s: BuildState): boolean {
  return s.issues.length === 0 && !s.busy && s.result !== null && s.resultKey === s.currentKey;
}

/**
 * Validates on every params change and schedules a debounced build for valid params. Only the
 * newest scheduled build may start, and only its result or error is written; older responses
 * are dropped. Invalid params keep the previous geometry visible (export is blocked by the key
 * check). Returns a stop function. Call once from main.tsx after persistence restored the params.
 */
export function startBuildSync(build: BuildFn = buildGenerator, debounceMs = 150): () => void {
  let changes = 0;
  let latestBuild = 0;
  let outstanding = 0;
  let stopped = false;

  const sync = () => {
    const { generatorId, values } = useParams.getState();
    const def = findGenerator(generatorId);
    const issues = def
      ? validateParams(def, values)
      : [{ key: null, message: `Unknown generator "${generatorId}"` }];
    const currentKey = JSON.stringify([generatorId, values]);
    useBuild.setState({ issues, currentKey, error: null });
    const change = ++changes;
    if (issues.length > 0) return;

    setTimeout(() => {
      // Any later change (valid or not) supersedes this one before it reaches the worker.
      if (stopped || change !== changes) return;
      const id = ++latestBuild;
      outstanding++;
      useBuild.setState({ busy: true });
      build(generatorId, values)
        .then(
          (result) => {
            if (id === latestBuild) useBuild.setState({ result, resultKey: currentKey, error: null });
          },
          (error: unknown) => {
            if (id === latestBuild) useBuild.setState({ error: errorMessage(error) });
          },
        )
        .finally(() => {
          outstanding--;
          useBuild.setState({ busy: outstanding > 0 });
        });
    }, debounceMs);
  };

  sync();
  const unsubscribe = useParams.subscribe(sync);
  return () => {
    stopped = true;
    unsubscribe();
  };
}
