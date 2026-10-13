import type { GeneratorResult, Params } from "./types";

/** Main thread -> worker. `requestId` lets the client ignore superseded responses. */
export type BuildRequest = {
  requestId: number;
  generatorId: string;
  params: Params;
};

/** Worker -> main thread. Failures carry a message, never a thrown error object. */
export type BuildResponse =
  | { requestId: number; ok: true; result: GeneratorResult }
  | { requestId: number; ok: false; error: string };

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
