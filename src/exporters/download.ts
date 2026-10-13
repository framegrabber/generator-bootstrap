export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking synchronously can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Opens a file picker and resolves with the chosen file, or null if the user cancels. */
export function pickFile(accept: string): Promise<File | null> {
  const { promise, resolve } = Promise.withResolvers<File | null>();
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  // Without this, a cancelled dialog leaves the promise (and the caller's busy state) pending.
  input.addEventListener("cancel", () => resolve(null));
  input.onchange = () => resolve(input.files?.[0] ?? null);
  input.click();
  return promise;
}
