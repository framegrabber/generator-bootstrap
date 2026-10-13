import "./ui/styles.css";
import { APP } from "./app-config";
import { ExportButtons } from "./ui/ExportButtons";
import { GeneratorPicker, ParamsPanel } from "./ui/ParamsPanel";
import { Preview } from "./ui/Preview";
import { useBuild } from "./ui/useBuild";

export default function App() {
  const build = useBuild();
  const warnings = build.result?.warnings ?? [];

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>{APP.name}</h1>
        <GeneratorPicker />
        <ParamsPanel issues={build.issues} />
        <ExportButtons build={build} />
        {build.error && (
          <div className="field-error" role="alert">
            {build.error}
          </div>
        )}
        {warnings.map((warning, index) => (
          <div key={index} className="status-text">
            {warning}
          </div>
        ))}
      </aside>
      <main className="stage">
        <Preview parts={build.result?.parts ?? null} busy={build.busy} />
      </main>
    </div>
  );
}
