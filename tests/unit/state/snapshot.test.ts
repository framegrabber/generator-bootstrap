import { describe, expect, it } from "vitest";
import {
  defaultSnapshot,
  querySnapshot,
  restoreSnapshot,
  snapshotQuery,
} from "../../../src/state/snapshot";
import type { GeneratorDef } from "../../../src/core/types";
import { FIXTURE } from "../fixtures";

const generators: GeneratorDef[] = [FIXTURE];

describe("restoreSnapshot", () => {
  it("falls back to defaults for non-object input", () => {
    expect(restoreSnapshot("garbage", generators)).toEqual(defaultSnapshot(generators));
    expect(restoreSnapshot([1, 2], generators)).toEqual(defaultSnapshot(generators));
    expect(restoreSnapshot(null, generators)).toEqual(defaultSnapshot(generators));
  });

  it("falls back to defaults for an unknown generator id", () => {
    const restored = restoreSnapshot({ generator: "no-such", values: { width: 99 } }, generators);
    expect(restored).toEqual(defaultSnapshot(generators));
  });

  it("keeps valid values and fills mistyped or missing keys from defaults", () => {
    const restored = restoreSnapshot(
      {
        generator: FIXTURE.id,
        values: { width: 60, height: "tall", hole: false, unknownKey: 1 },
      },
      generators,
    );
    expect(restored.generator).toBe(FIXTURE.id);
    expect(restored.values.width).toBe(60);
    expect(restored.values.height).toBe(FIXTURE.params[1].default);
    expect(restored.values.hole).toBe(false);
    expect(restored.values).not.toHaveProperty("unknownKey");
  });

  it("applies the generator's migrate hook before merging", () => {
    const legacy: GeneratorDef = {
      ...FIXTURE,
      migrate: (raw) => ({ ...raw, width: raw.oldWidth }),
    };
    const restored = restoreSnapshot({ generator: FIXTURE.id, values: { oldWidth: 77 } }, [legacy]);
    expect(restored.values.width).toBe(77);
  });
});

describe("URL query", () => {
  // Every param kind that has its own string form.
  const rich: GeneratorDef = {
    ...FIXTURE,
    params: [
      ...FIXTURE.params,
      { kind: "text", key: "label", label: "Label", default: "hi", multiline: true },
      { kind: "color", key: "tint", label: "Tint", default: "#000000" },
      {
        kind: "select",
        key: "mode",
        label: "Mode",
        default: "a",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      },
    ],
  };
  const roundTrip = (values: Record<string, unknown>, defs: GeneratorDef[] = [rich]) => {
    const snapshot = restoreSnapshot({ generator: FIXTURE.id, values }, defs);
    const query = snapshotQuery(snapshot, defs);
    return { query, restored: restoreSnapshot(querySnapshot(`?${query}`, defs), defs), snapshot };
  };

  it("names only the generator when every value is a default", () => {
    expect(snapshotQuery(defaultSnapshot(generators), generators)).toBe("g=fixture");
  });

  it("always writes a param marked alwaysInLink, even at its default", () => {
    const pinned = {
      ...rich,
      params: rich.params.map((p) => ({ ...p, alwaysInLink: p.key === "mode" })),
    };
    expect(roundTrip({}, [pinned]).query).toBe("g=fixture&mode=a");
    expect(roundTrip({ mode: "b" }, [pinned]).query).toBe("g=fixture&mode=b");
  });

  it("writes only changed values, readable, and reads them back exactly", () => {
    const { query, restored, snapshot } = roundTrip({
      width: 12.5,
      hole: false,
      label: "a & b = c\n#2",
      tint: "#ff0000",
      mode: "b",
    });
    expect(query).toBe(
      "g=fixture&width=12.5&hole=false&label=a+%26+b+%3D+c%0A%232&tint=%23ff0000&mode=b",
    );
    expect(restored).toEqual(snapshot);
  });

  it("keeps a hidden param's changed value", () => {
    const { restored } = roundTrip({ hole: false, holeDiameter: 9 });
    expect(restored.values.holeDiameter).toBe(9);
  });

  it("falls back to the default for a value of the wrong type", () => {
    const restored = restoreSnapshot(
      querySnapshot("?g=fixture&width=wide&hole=maybe", generators),
      generators,
    );
    expect(restored.values.width).toBe(FIXTURE.params[0].default);
    expect(restored.values.hole).toBe(true);
  });

  it("passes renamed keys through migrate with their likely type", () => {
    const legacy: GeneratorDef = {
      ...FIXTURE,
      migrate: (raw) => ({ ...raw, width: raw.oldWidth }),
    };
    const restored = restoreSnapshot(querySnapshot("?g=fixture&oldWidth=77", [legacy]), [legacy]);
    expect(restored.values.width).toBe(77);
  });

  it("still reads the original ?p=<json> links", () => {
    const old = `?p=${encodeURIComponent(JSON.stringify({ generator: "fixture", values: { width: 33 } }))}`;
    expect(restoreSnapshot(querySnapshot(old, generators), generators).values.width).toBe(33);
    expect(querySnapshot("?x=1", generators)).toBeUndefined();
  });
});
