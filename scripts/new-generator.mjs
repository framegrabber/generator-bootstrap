#!/usr/bin/env node
// Scaffolds src/generators/<id>/ with a working box generator to edit.
// Usage: npm run new-generator -- <id> "<Display name>"
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [id, name] = process.argv.slice(2);
if (!id || !/^[a-z][a-z0-9-]*$/.test(id) || !name) {
  console.error('Usage: npm run new-generator -- <kebab-case-id> "<Display name>"');
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "generators", id);
if (existsSync(dir)) {
  console.error(`${dir} already exists`);
  process.exit(1);
}

const index = `import type { GeneratorDef } from "../../core/types";

const generator: GeneratorDef = {
  id: ${JSON.stringify(id)},
  name: ${JSON.stringify(name)},
  description: "Describe what this generator makes; shown under the generator picker.",
  params: [
    { kind: "number", key: "width", label: "Width", group: "Size", unit: "mm", default: 20, min: 1, max: 250, step: 1 },
    { kind: "number", key: "depth", label: "Depth", group: "Size", unit: "mm", default: 20, min: 1, max: 250, step: 1 },
    { kind: "number", key: "height", label: "Height", group: "Size", unit: "mm", default: 10, min: 0.4, max: 250, step: 0.5 },
  ],
};

export default generator;
`;

const build = `import { meshFromManifold, withScope } from "../../core/manifold";
import { num } from "../../core/params";
import type { GeneratorBuild } from "../../core/types";

const build: GeneratorBuild = (values, { wasm }) => {
  const mesh = withScope((scope) => {
    const box = scope.track(
      wasm.Manifold.cube([num(values, "width"), num(values, "depth"), num(values, "height")]),
    );
    return meshFromManifold(box);
  });
  return { parts: [{ name: "body", mesh }] };
};

export default build;
`;

mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "index.ts"), index);
writeFileSync(join(dir, "build.ts"), build);
console.log(`Created src/generators/${id}/{index,build}.ts`);
console.log("It is registered automatically and covered by tests/unit/generators/contract.test.ts.");
