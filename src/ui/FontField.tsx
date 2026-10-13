import { useEffect, useId, useState } from "react";
import { errorMessage } from "../core/protocol";
import { pickFile } from "../exporters/download";
import { BUNDLED_FONTS, DEFAULT_FONT, parseFontRef } from "../fonts/bundled";
import {
  addUploadedFont,
  listUploadedFonts,
  removeUploadedFont,
  type UploadedFont,
} from "../fonts/library";

type Props = {
  label: string;
  value: string;
  help?: string;
  error?: string;
  onChange: (value: string) => void;
};

/**
 * Picks a bundled or uploaded font. Uploads live in this browser's IndexedDB, so a shared link
 * may name an upload that is missing here; it then shows as "missing" until uploaded again.
 */
export function FontField({ label, value, help, error, onChange }: Props) {
  const id = useId();
  const [uploads, setUploads] = useState<UploadedFont[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    listUploadedFonts().then(setUploads, (e: unknown) => setMessage(errorMessage(e)));
  }, []);

  const ref = parseFontRef(value);
  const selectedUpload = ref?.kind === "upload" ? ref.sha256 : null;
  const missing = selectedUpload !== null && !uploads.some((f) => f.sha256 === selectedUpload);

  async function upload() {
    setMessage(null);
    try {
      const file = await pickFile(".ttf,.otf,.woff,font/ttf,font/otf,font/woff");
      if (!file) return;
      const entry = await addUploadedFont(file.name, await file.arrayBuffer());
      setUploads(await listUploadedFonts());
      onChange(`upload:${entry.sha256}`);
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }

  async function remove(sha256: string) {
    setMessage(null);
    try {
      await removeUploadedFont(sha256);
      setUploads(await listUploadedFonts());
      onChange(DEFAULT_FONT);
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(BUNDLED_FONTS).map(([fontId, font]) => (
          <option key={fontId} value={`bundled:${fontId}`}>
            {font.label}
          </option>
        ))}
        {uploads.map((font) => (
          <option key={font.sha256} value={`upload:${font.sha256}`}>
            {font.name}
          </option>
        ))}
        {missing && <option value={value}>Uploaded font (missing in this browser)</option>}
      </select>
      <div className="row">
        <button type="button" onClick={() => void upload()}>
          Upload font
        </button>
        {selectedUpload && !missing && (
          <button type="button" onClick={() => void remove(selectedUpload)}>
            Remove font
          </button>
        )}
      </div>
      {help && <span className="field-help">{help}</span>}
      {missing && (
        <span className="field-error">
          This link uses a font uploaded in another browser. Upload the same file again.
        </span>
      )}
      {message && <span className="field-error">{message}</span>}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
