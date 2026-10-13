import { describe, expect, it } from "vitest";
import { buildZipFilename, localIsoStamp, sanitizeSegment } from "../../../src/exporters/filename";

describe("sanitizeSegment", () => {
  it("replaces unsafe runs with a single underscore and trims edges", () => {
    expect(sanitizeSegment("  a b/c!!  ")).toBe("a_b_c");
  });

  it("uses the fallback when nothing safe remains", () => {
    expect(sanitizeSegment("!!!")).toBe("part");
    expect(sanitizeSegment("???", "export")).toBe("export");
  });
});

describe("localIsoStamp", () => {
  it("formats local time with dashes instead of colons", () => {
    expect(localIsoStamp(new Date(2024, 0, 2, 3, 4, 5))).toBe("2024-01-02T03-04-05");
  });
});

describe("buildZipFilename", () => {
  it("joins slug, sanitized label, and stamp", () => {
    const name = buildZipFilename("generator", "10x20 / A", new Date(2024, 11, 31, 23, 59, 58));
    expect(name).toBe("generator-10x20_A-2024-12-31T23-59-58.zip");
  });
});
