import { GENERATORS, findGenerator } from "../generators";
import type { ParamSpec, ParamValue, ValidationIssue } from "../core/types";
import { useParams } from "../state/params-store";
import { NumberField } from "./NumberField";

export function GeneratorPicker() {
  const generatorId = useParams((s) => s.generatorId);
  const selectGenerator = useParams((s) => s.selectGenerator);
  return (
    <label className="field">
      Generator
      <select value={generatorId} onChange={(e) => selectGenerator(e.target.value)}>
        {GENERATORS.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ParamsPanel({ issues }: { issues: readonly ValidationIssue[] }) {
  const generatorId = useParams((s) => s.generatorId);
  const values = useParams((s) => s.values);
  const setValue = useParams((s) => s.setValue);
  const def = findGenerator(generatorId);
  if (!def) return null;

  const issuesFor = (key: string) =>
    issues
      .filter((i) => i.key === key)
      .map((i) => i.message)
      .join(" ");
  const generalIssues = issues.filter((i) => i.key === null);

  return (
    <section className="params">
      {def.params.map((spec) => (
        <ParamField
          key={spec.key}
          spec={spec}
          value={values[spec.key]}
          error={issuesFor(spec.key)}
          onChange={(v) => setValue(spec.key, v)}
        />
      ))}
      {generalIssues.map((issue) => (
        <div key={issue.message} className="field-error" role="alert">
          {issue.message}
        </div>
      ))}
    </section>
  );
}

type FieldProps = {
  spec: ParamSpec;
  value: ParamValue | undefined;
  error: string;
  onChange: (value: ParamValue) => void;
};

function ParamField({ spec, value, error, onChange }: FieldProps) {
  switch (spec.kind) {
    case "number":
      return (
        <NumberField
          label={spec.label}
          unit={spec.unit ?? ""}
          value={typeof value === "number" ? value : spec.default}
          step={spec.step}
          min={spec.min}
          error={error}
          onChange={onChange}
        />
      );
    case "boolean":
      return (
        <label className="check">
          <input
            type="checkbox"
            checked={typeof value === "boolean" ? value : spec.default}
            onChange={(e) => onChange(e.target.checked)}
          />
          {spec.label}
          {error && <span className="field-error">{error}</span>}
        </label>
      );
    case "text":
      return (
        <label className="field">
          {spec.label}
          <input
            type="text"
            value={typeof value === "string" ? value : spec.default}
            maxLength={spec.maxLength}
            onChange={(e) => onChange(e.target.value)}
          />
          {error && <span className="field-error">{error}</span>}
        </label>
      );
    case "select":
      return (
        <label className="field">
          {spec.label}
          <select
            value={typeof value === "string" ? value : spec.default}
            onChange={(e) => onChange(e.target.value)}
          >
            {spec.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {error && <span className="field-error">{error}</span>}
        </label>
      );
  }
}
