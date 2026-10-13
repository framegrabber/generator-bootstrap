import { Fragment } from "react";
import { GENERATORS, findGenerator } from "../generators";
import { isVisible } from "../core/params";
import type { ParamSpec, ParamValue, Params, ValidationIssue } from "../core/types";
import { useParams } from "../state/params-store";
import { NumberField } from "./NumberField";

export function GeneratorPicker() {
  const generatorId = useParams((s) => s.generatorId);
  const selectGenerator = useParams((s) => s.selectGenerator);
  const def = findGenerator(generatorId);
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
      {def && <span className="field-help">{def.description}</span>}
    </label>
  );
}

/** Visible specs bucketed by group, groups in order of first appearance; ungrouped first. */
function groupSpecs(specs: readonly ParamSpec[], values: Params): Map<string, ParamSpec[]> {
  const groups = new Map<string, ParamSpec[]>([["", []]]);
  for (const spec of specs) {
    if (!isVisible(spec, values)) continue;
    const group = spec.group ?? "";
    const list = groups.get(group);
    if (list) list.push(spec);
    else groups.set(group, [spec]);
  }
  return groups;
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
  const fields = (specs: readonly ParamSpec[]) =>
    specs.map((spec) => (
      <ParamField
        key={spec.key}
        spec={spec}
        value={values[spec.key]}
        error={issuesFor(spec.key)}
        onChange={(v) => setValue(spec.key, v)}
      />
    ));

  return (
    <section className="params">
      {[...groupSpecs(def.params, values)].map(([group, specs]) =>
        group === "" ? (
          <Fragment key="">{fields(specs)}</Fragment>
        ) : (
          <fieldset key={group} className="param-group">
            <legend>{group}</legend>
            {fields(specs)}
          </fieldset>
        ),
      )}
      {issues
        .filter((i) => i.key === null)
        .map((issue) => (
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
  const help = spec.help && <span className="field-help">{spec.help}</span>;
  const errorText = error && <span className="field-error">{error}</span>;
  switch (spec.kind) {
    case "number":
      return (
        <NumberField
          label={spec.label}
          unit={spec.unit ?? ""}
          value={typeof value === "number" ? value : spec.default}
          step={spec.step ?? (spec.integer ? 1 : undefined)}
          min={spec.min}
          max={spec.max}
          help={spec.help}
          error={error}
          onChange={onChange}
        />
      );
    case "boolean":
      return (
        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={typeof value === "boolean" ? value : spec.default}
              onChange={(e) => onChange(e.target.checked)}
            />
            {spec.label}
          </label>
          {help}
          {errorText}
        </div>
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
          {help}
          {errorText}
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
          {help}
          {errorText}
        </label>
      );
  }
}
