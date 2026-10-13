import { useState } from "react";
import { APP } from "../app-config";
import { findGenerator } from "../generators";
import { errorMessage } from "../core/protocol";
import { meshToBinaryStl } from "../core/stl";
import { useParams } from "../state/params-store";
import { snapshotUrl } from "../state/persistence";
import type { Snapshot } from "../state/snapshot";
import { buildZipFilename, sanitizeSegment } from "../exporters/filename";
import { downloadBlob, pickTextFile } from "../exporters/download";
import { buildReadme } from "../exporters/readme";
import { bundleZip, type ZipEntry } from "../exporters/zip";
import { parseSettingsFile, settingsJson } from "../exporters/settings";
import type { BuildState } from "./useBuild";

export function ExportButtons({ build }: { build: BuildState }) {
  const generatorId = useParams((s) => s.generatorId);
  const values = useParams((s) => s.values);
  const replace = useParams((s) => s.replace);
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
    const { result } = build;
    const def = findGenerator(generatorId);
    if (!result || !def) return;

    const entries: ZipEntry[] = result.parts.map((part, index) => ({
      path: `stl/${String(index + 1).padStart(2, "0")}_${sanitizeSegment(part.name)}.stl`,
      data: meshToBinaryStl(part.mesh, `${APP.name} ${part.name}`),
    }));
    for (const file of result.extraFiles ?? []) {
      entries.push({ path: file.path, data: file.content });
    }
    entries.push({
      path: "README.txt",
      data: buildReadme({
        appName: APP.name,
        generatorName: def.name,
        params: def.params,
        values,
        reproduceUrl: snapshotUrl({ generator: generatorId, values }),
        files: entries.map((e) => e.path),
        warnings: result.warnings ?? [],
      }),
    });

    const blob = await bundleZip(entries);
    const label = def.exportLabel?.(values) ?? def.id;
    downloadBlob(blob, buildZipFilename(APP.slug, label, new Date()));
  }

  async function saveSettings() {
    const snapshot: Snapshot = { generator: generatorId, values };
    downloadBlob(
      new Blob([settingsJson(snapshot)], { type: "application/json" }),
      `${APP.slug}-settings.json`,
    );
  }

  async function loadSettings() {
    const text = await pickTextFile(".json,application/json");
    if (text === null) return;
    replace(parseSettingsFile(text));
  }

  const ready = build.canExport && !working;
  return (
    <section className="actions">
      <button type="button" disabled={!ready} onClick={() => void run(downloadZip)}>
        Download ZIP
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
