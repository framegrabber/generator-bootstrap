import type { CrossSection, SimplePolygon } from "manifold-3d";
import type opentype from "opentype.js";
import type { Geom } from "./geom";

export type TextAlign = "left" | "center" | "right";

export type TextOptions = {
  /** May contain "\n" for several lines. */
  text: string;
  /** Height of capital letters in mm; the font is scaled so its cap height matches. */
  capHeight: number;
  /** Baseline-to-baseline distance as a multiple of the font's own line height. Default 1. */
  lineSpacing?: number;
  /** Horizontal alignment of lines against each other. Default "left". */
  align?: TextAlign;
  /** Maximum distance in mm between a curve and its straight-segment approximation. */
  tolerance?: number;
};

/** Cap height in font units: OS/2 sCapHeight, else the height of "H", else 70% of the em. */
function capHeightUnits(font: opentype.Font): number {
  const os2 = font.tables.os2;
  const fromTable = os2 && "sCapHeight" in os2 && typeof os2.sCapHeight === "number" ? os2.sCapHeight : 0;
  if (fromTable > 0) return fromTable;
  const h = font.charToGlyph("H").getBoundingBox();
  return h.y2 - h.y1 > 0 ? h.y2 - h.y1 : font.unitsPerEm * 0.7;
}

/**
 * Lays out `text` in `font` and returns its outline as one CrossSection (tracked in `scope`).
 * The first line's baseline is y = 0 and later lines go down; x = 0 is the left edge, centre, or
 * right edge of the lines depending on `align`. Letters are placed by advance width plus the
 * font's pair kerning where opentype.js can read it (legacy `kern` tables and simple GPOS
 * kerning; kerning inside GPOS extension lookups, as in Inter, is skipped).
 * Glyph contours are filled with the non-zero rule, the way TrueType and CFF fonts define them,
 * so holes in letters and overlapping contours come out right. Throws if no glyph has an outline.
 */
export function textOutline(
  { wasm, scope }: Geom,
  font: opentype.Font,
  { text, capHeight, lineSpacing = 1, align = "left", tolerance = 0.02 }: TextOptions,
): CrossSection {
  const fontSize = (capHeight * font.unitsPerEm) / capHeightUnits(font);
  const scale = fontSize / font.unitsPerEm;
  const lineHeight = (font.ascender - font.descender) * scale * lineSpacing;

  const polygons: SimplePolygon[] = [];
  text.split("\n").forEach((line, row) => {
    const glyphs = Array.from(line, (ch) => font.charToGlyph(ch));
    const xs: number[] = [];
    let cursor = 0;
    glyphs.forEach((glyph, i) => {
      xs.push(cursor);
      cursor += (glyph.advanceWidth ?? 0) * scale;
      if (i + 1 < glyphs.length) cursor += font.getKerningValue(glyph, glyphs[i + 1]) * scale;
    });
    const shift = align === "left" ? 0 : align === "center" ? -cursor / 2 : -cursor;
    glyphs.forEach((glyph, i) => {
      const path = glyph.getPath(xs[i] + shift, row * lineHeight, fontSize);
      polygons.push(...flattenPath(path.commands, tolerance));
    });
  });
  if (polygons.length === 0) throw new Error("Text has no visible characters");
  return scope.track(new wasm.CrossSection(polygons, "NonZero"));
}

/**
 * Flattens path commands (y pointing down, as opentype.js emits them) into closed polygons with
 * y pointing up. Curves are subdivided until every control point is within `tolerance`.
 */
export function flattenPath(commands: readonly opentype.PathCommand[], tolerance: number): SimplePolygon[] {
  const polygons: SimplePolygon[] = [];
  let current: SimplePolygon = [];
  let x = 0;
  let y = 0;
  const close = () => {
    const [first, last] = [current[0], current.at(-1)];
    if (first && last && first[0] === last[0] && first[1] === last[1]) current.pop();
    if (current.length >= 3) polygons.push(current);
    current = [];
  };
  const add = (px: number, py: number) => current.push([px, -py]);

  for (const cmd of commands) {
    switch (cmd.type) {
      case "M":
        close();
        add(cmd.x, cmd.y);
        break;
      case "L":
        add(cmd.x, cmd.y);
        break;
      case "Q":
        subdivide([x, y, cmd.x1, cmd.y1, cmd.x1, cmd.y1, cmd.x, cmd.y], tolerance, add, true);
        break;
      case "C":
        subdivide([x, y, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y], tolerance, add, false);
        break;
      case "Z":
        close();
        continue;
    }
    [x, y] = [cmd.x, cmd.y];
  }
  close();
  return polygons;
}

type Bezier = [number, number, number, number, number, number, number, number];

/**
 * Emits the end points of a recursive subdivision of a Bézier curve. A quadratic is passed with
 * its single control point twice and split with de Casteljau on the quadratic itself.
 */
function subdivide(
  curve: Bezier,
  tolerance: number,
  emit: (x: number, y: number) => void,
  quadratic: boolean,
): void {
  const stack: [Bezier, number][] = [[curve, 0]];
  while (stack.length > 0) {
    const [[ax, ay, bx, by, cx, cy, dx, dy], depth] = stack.pop()!;
    const deviation = Math.max(distanceToLine(bx, by, ax, ay, dx, dy), distanceToLine(cx, cy, ax, ay, dx, dy));
    if (deviation <= tolerance || depth >= 16) {
      emit(dx, dy);
      continue;
    }
    if (quadratic) {
      const [m1x, m1y, m2x, m2y] = [(ax + bx) / 2, (ay + by) / 2, (bx + dx) / 2, (by + dy) / 2];
      const [mx, my] = [(m1x + m2x) / 2, (m1y + m2y) / 2];
      stack.push([[mx, my, m2x, m2y, m2x, m2y, dx, dy], depth + 1]);
      stack.push([[ax, ay, m1x, m1y, m1x, m1y, mx, my], depth + 1]);
      continue;
    }
    const [m1x, m1y] = [(ax + bx) / 2, (ay + by) / 2];
    const [m2x, m2y] = [(bx + cx) / 2, (by + cy) / 2];
    const [m3x, m3y] = [(cx + dx) / 2, (cy + dy) / 2];
    const [m12x, m12y] = [(m1x + m2x) / 2, (m1y + m2y) / 2];
    const [m23x, m23y] = [(m2x + m3x) / 2, (m2y + m3y) / 2];
    const [mx, my] = [(m12x + m23x) / 2, (m12y + m23y) / 2];
    stack.push([[mx, my, m23x, m23y, m3x, m3y, dx, dy], depth + 1]);
    stack.push([[ax, ay, m1x, m1y, m12x, m12y, mx, my], depth + 1]);
  }
}

function distanceToLine(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const [dx, dy] = [bx - ax, by - ay];
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(px - ax, py - ay);
  return Math.abs(dx * (ay - py) - dy * (ax - px)) / length;
}
