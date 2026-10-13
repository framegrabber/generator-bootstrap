import { useEffect, useMemo, useRef, useState } from "react";
import { findGenerator } from "../generators";
import { buildGenerator } from "../build/worker-client";
import { validateParams } from "../core/params";
import { errorMessage } from "../core/protocol";
import type { GeneratorResult, ValidationIssue } from "../core/types";
import { useParams } from "../state/params-store";

const DEBOUNCE_MS = 150;

type Settled = {
  result: GeneratorResult | null;
  /** The params key that produced `result`; export is allowed only when it matches. */
  resultKey: string | null;
  error: string | null;
};

export type BuildState = Settled & {
  busy: boolean;
  issues: ValidationIssue[];
  currentKey: string;
  canExport: boolean;
};

export function useBuild(): BuildState {
  const generatorId = useParams((s) => s.generatorId);
  const values = useParams((s) => s.values);

  const issues = useMemo(() => {
    const def = findGenerator(generatorId);
    return def
      ? validateParams(def, values)
      : [{ key: null, message: `Unknown generator "${generatorId}"` }];
  }, [generatorId, values]);

  const currentKey = useMemo(() => JSON.stringify([generatorId, values]), [generatorId, values]);

  const [settled, setSettled] = useState<Settled>({ result: null, resultKey: null, error: null });
  const [pendingCount, setPendingCount] = useState(0);
  // Only the newest scheduled build may write results; older responses are dropped.
  const latest = useRef(0);

  useEffect(() => {
    // Invalid params: keep the previous result visible, but canExport goes false via the key check.
    if (issues.length > 0) return;
    const id = ++latest.current;
    const timer = window.setTimeout(() => {
      setPendingCount((c) => c + 1);
      buildGenerator(generatorId, values)
        .then(
          (result) => {
            if (id === latest.current) setSettled({ result, resultKey: currentKey, error: null });
          },
          (error: unknown) => {
            if (id === latest.current) {
              setSettled((s) => ({ ...s, error: errorMessage(error) }));
            }
          },
        )
        .finally(() => setPendingCount((c) => c - 1));
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [generatorId, values, currentKey, issues.length]);

  const busy = pendingCount > 0;
  return {
    ...settled,
    busy,
    issues,
    currentKey,
    canExport:
      issues.length === 0 && !busy && settled.result !== null && settled.resultKey === currentKey,
  };
}
