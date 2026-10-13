import "./ui/styles.css";
import { APP } from "./app-config";
import { ExportButtons } from "./ui/ExportButtons";
import { GeneratorPicker, ParamsPanel } from "./ui/ParamsPanel";
import { Preview } from "./ui/Preview";
import { useBuild } from "./state/build-store";

export default function App() {
  const issues = useBuild((s) => s.issues);
  const error = useBuild((s) => s.error);
  const warnings = useBuild((s) => s.result?.warnings);

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>{APP.name}</h1>
        <GeneratorPicker />
        <ParamsPanel issues={issues} />
        <ExportButtons />
        {error && (
          <div className="field-error" role="alert">
            {error}
          </div>
        )}
        {warnings?.map((warning, index) => (
          <div key={index} className="status-text">
            {warning}
          </div>
        ))}
      </aside>
      <main className="stage">
        <Preview />
      </main>
    </div>
  );
}
