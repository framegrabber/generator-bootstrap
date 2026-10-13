import { describe, expect, it } from "vitest";
import { APP } from "../../../src/app-config";
import { parseSettingsFile, settingsJson } from "../../../src/exporters/settings";
import { defaultSnapshot } from "../../../src/state/snapshot";

describe("settings files", () => {
  it("round-trips a snapshot through JSON", () => {
    const snapshot = defaultSnapshot();
    snapshot.values.width = 55;
    expect(parseSettingsFile(settingsJson(snapshot))).toEqual(snapshot);
  });

  it("rejects files written for another app", () => {
    const foreign = JSON.stringify({ app: "other-app", generator: "rounded-tag", values: {} });
    expect(() => parseSettingsFile(foreign)).toThrow(/Not a settings file/);
  });

  it("rejects files that are not JSON", () => {
    expect(() => parseSettingsFile("{nope")).toThrow(/not valid JSON/);
  });

  it("rejects files naming an unknown generator", () => {
    const unknown = JSON.stringify({ app: APP.slug, generator: "ghost", values: {} });
    expect(() => parseSettingsFile(unknown)).toThrow(/unknown generator "ghost"/);
  });
});
