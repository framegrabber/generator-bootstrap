import { useState } from "react";
import { APP } from "../app-config";
import { findGenerator } from "../generators";
import { errorMessage } from "../core/protocol";
import { useBuild, canExport } from "../state/build-store";
import { useParams } from "../state/params-store";
import { snapshotUrl } from "../state/persistence";
import { buildZipFilename } from "../exporters/filename";
import { downloadBlob, pickFile } from "../exporters/download";
import { exportEntries } from "../exporters/export";
import { bundleZip } from "../exporters/zip";
import { parseSettingsFile, settingsJson } from "../exporters/settings";

export function ExportButtons() {
  const generatorId = useParams((s) => s.generatorId);
  const values = useParams((s) => s.values);
  const replace = useParams((s) => s.replace);
  const result = useBuild((s) => s.result);
  const exportable = useBuild(canExport);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setWorking(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  async function downloadZip() {
    const def = findGenerator(generatorId);
    if (!result || !def) return;
    const entries = await exportEntries({
      def,
      values,
      result,
      reproduceUrl: snapshotUrl({ generator: generatorId, values }),
    });
    const label = def.exportLabel?.(values) ?? def.id;
    downloadBlob(await bundleZip(entries), buildZipFilename(APP.slug, label, new Date()));
  }

  async function saveSettings() {
    downloadBlob(
      new Blob([settingsJson({ generator: generatorId, values })], { type: "application/json" }),
      `${APP.slug}-settings.json`,
    );
  }

  async function loadSettings() {
    const file = await pickFile(".json,application/json");
    if (file) replace(parseSettingsFile(await file.text()));
  }

  return (
    <section className="actions">
      <button
        type="button"
        className="primary"
        disabled={!exportable || working}
        onClick={() => void run(downloadZip)}
      >
        Download ZIP (3MF + STL)
      </button>
      <div className="row">
        <button type="button" disabled={working} onClick={() => void run(saveSettings)}>
          Save settings
        </button>
        <button type="button" disabled={working} onClick={() => void run(loadSettings)}>
          Load settings
        </button>
      </div>
      {message && (
        <div className="field-error" role="alert">
          {message}
        </div>
      )}
    </section>
  );
}
