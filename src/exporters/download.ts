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

/** Opens a file picker and resolves with the chosen file's text, or null if the user cancels. */
export function pickTextFile(accept: string): Promise<string | null> {
  const { promise, resolve, reject } = Promise.withResolvers<string | null>();
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  // Without this, a cancelled dialog leaves the promise (and the caller's busy state) pending.
  input.addEventListener("cancel", () => resolve(null));
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) file.text().then(resolve, reject);
    else resolve(null);
  };
  input.click();
  return promise;
}
