import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// In Vitest, `?url` asset imports resolve to root-relative paths like "/src/fonts/files/x.ttf",
// which Node's fetch cannot load. Serve those from disk; pass everything else through.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("/src/")) return new Response(await readFile(resolve(`.${url}`)));
  return realFetch(input, init);
};
