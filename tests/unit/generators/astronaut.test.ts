import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { describe, expect, it } from "vitest";
import { boundsOf } from "../../../src/core/bounds";
import { getManifold, withScope, type WasmScope } from "../../../src/core/manifold";
import { validateParams } from "../../../src/core/params";
import type { Params, Part } from "../../../src/core/types";
import { findGenerator } from "../../../src/generators";
import {
  astronautLayout,
  chestSurface,
  TWIST,
  WALL,
} from "../../../src/generators/astronaut/layout";
import { buildWith, paramsFor } from "./helpers";

const ID = "astronaut";
// The shape these tests measure, pinned here so the app's defaults can change freely.
const SHAPE: Params = {
  screen: "landscape",
  collarBlend: 8,
  screenRecess: 0,
  headDepth: 45,
  headCorner: 50,
  headBackRound: 20,
  lowerWidth: 70,
  lowerDepth: 60,
  lowerForward: 2,
  upperWidth: 54,
  upperDepth: 40,
  upperOffset: 10,
  armAngle: 35,
  armForward: 15,
  armWidth: 18,
  patchShape: "rounded",
  patchText: "",
};
const shape = (overrides: Params = {}) => paramsFor(ID, { ...SHAPE, ...overrides });
// Coarse meshes keep the build tests fast; the fittings are exact solids at any detail.
const draft = (overrides: Params = {}): Params => ({ ...SHAPE, meshEdge: 1.2, ...overrides });

describe("astronaut head", () => {
  // The 2.8" board: glass 50.54 x 73.06 (the long side toward USB-C), its centre 3 mm toward
  // USB-C from the visible area's centre, 6 mm of plug room past its long sides, 2.5 mm wall.
  // The face is centred on the visible area.
  it.each([
    ["landscape", 73.06 / 2 + 3 + 2.5, 50.54 / 2 + 6 + 2.5],
    ["portrait", 50.54 / 2 + 6 + 2.5, 73.06 / 2 + 3 + 2.5],
  ])(
    "fits the board %s, plus the extra margins",
    { timeout: 30_000 },
    async (screen, halfWidth, halfHeight) => {
      for (const [side, top] of [
        [0, 0],
        [5, 3],
      ]) {
        const result = await buildWith(
          ID,
          draft({ screen, headMarginSide: side, headMarginTop: top }),
        );
        const front = result.parts.find((p) => p.name === "head-front")!;
        const b = boundsOf([front.mesh])!;
        // Face down on the bed: x spans the width plus the 5 mm bosses, y the height plus the
        // 8 mm neck.
        expect(b.max[0] - b.min[0]).toBeCloseTo(2 * (halfWidth + side) + 10, 0);
        expect(b.max[1] - b.min[1]).toBeCloseTo(2 * (halfHeight + top) + 8, 0);
        expect(b.min[2]).toBeCloseTo(0, 3);
      }
    },
  );
});

describe("astronaut validate", () => {
  const def = findGenerator(ID)!;
  const issueKeys = (overrides: Params) => validateParams(def, shape(overrides)).map((i) => i.key);

  it("rejects an upper volume that floats free of the lower one", () => {
    // Upper half height 22.5: an offset of 25 leaves a 2.5 mm gap between the volumes.
    expect(issueKeys({ upperOffset: 20, stackBlend: 0 })).toEqual([]);
    expect(issueKeys({ upperOffset: 25, stackBlend: 0 })).toEqual(["upperOffset"]);
    // A volume blend wider than the gap bridges it into a waist.
    expect(issueKeys({ upperOffset: 25, stackBlend: 10 })).toEqual([]);
  });

  it("keeps the helmet discs on the flat part of the head's sides", () => {
    // Half height 33.77; the R11.5 discs need corners of at most 33.77 - 12.5 = 21.3 mm,
    // 63 % of the half height.
    expect(issueKeys({ headCorner: 60 })).toEqual([]);
    expect(issueKeys({ headCorner: 66 })).toEqual(["earSize"]);
  });

  it("needs a flat back for the speakers and the discs", () => {
    expect(issueKeys({ headBackRound: 20 })).toEqual([]);
    expect(issueKeys({ headBackRound: 60 })).toContain("headBackRound");
  });

  it("centres the portrait head over the body on a neck ring", () => {
    const layout = (overrides: Params) => astronautLayout(shape(overrides));
    const landscape = layout({});
    const portrait = layout({ screen: "portrait" });
    // The body stays where it is in landscape; the head stands 8 mm higher, on the ring.
    expect(portrait.body).toEqual(landscape.body);
    expect(portrait.head.cz - portrait.head.hh).toBeCloseTo(portrait.body.top + 8, 5);
    // The neck stands on the plug, 9.67 mm behind the face. The ring is centred on the upper
    // volume, 11.58 mm behind it, and reaches round the R9 sleeve's socket and its 1.6 mm wall.
    expect(portrait.neck.y).toBeCloseTo(2.5 + 7.17, 5);
    expect(portrait.collar!.y).toBeCloseTo(21.25, 5);
    expect(portrait.collar!.radius).toBeCloseTo(11.58 + 9 + 0.25 + 1.6, 2);
    expect(issueKeys({ screen: "portrait" })).toEqual([]);
    // A body 3 mm further back pushes the ring out behind the 45 mm head: 24.25 + 25.43 > 47.
    expect(issueKeys({ screen: "portrait", upperForward: -1 })).toEqual([]);
    expect(issueKeys({ screen: "portrait", upperForward: -3 })).toEqual(["upperForward"]);
  });

  it("puts the body under the plug with the portrait twist mount, and Forward moves it", () => {
    const twist = { screen: "portrait", portraitMount: "twist" };
    const layout = (overrides: Params) => astronautLayout(shape(overrides));
    const landscape = layout({});
    const portrait = layout(twist);
    // No ring; the body sits under the neck on the plug as it sits under the landscape neck.
    expect(portrait.collar).toBeNull();
    expect(portrait.head.cz - portrait.head.hh).toBeCloseTo(portrait.body.top, 5);
    expect(portrait.body.cy - portrait.neck.y).toBeCloseTo(landscape.body.cy - landscape.neck.y, 5);
    expect(issueKeys(twist)).toEqual([]);
    const back = layout({ ...twist, upperForward: -10 });
    expect(portrait.body.upper.center[1] - back.body.upper.center[1]).toBeCloseTo(-9, 5);
    // Moved 2 mm back, the socket breaks out of the chest's front, unless the chest is deeper:
    // 60 mm moved 10 mm back puts the head on top of it.
    expect(issueKeys({ ...twist, upperForward: -3 })).toEqual(["upperForward"]);
    expect(issueKeys({ ...twist, upperDepth: 60, upperForward: -10 })).toEqual([]);
  });

  it("hangs the body on the board, so the head grows backward and forward over it", () => {
    const layout = (overrides: Params) => astronautLayout(shape(overrides));
    const base = layout({ screen: "portrait" });
    // A deeper head leaves the body, plug, and ring where they are.
    const deep = layout({ screen: "portrait", headDepth: 55 });
    expect(deep.body).toEqual(base.body);
    expect(deep.collar).toEqual(base.collar);
    // A 4 mm screen recess moves the face forward: everything on the board lies 4 mm further
    // behind it, so the ring's front edge ends 2.8 mm behind the face instead of 1.2 in front.
    const recessed = layout({ screen: "portrait", screenRecess: 4, headDepth: 49 });
    expect(recessed.usb.y - base.usb.y).toBeCloseTo(4, 5);
    expect(recessed.body.cy - base.body.cy).toBeCloseTo(4, 5);
    expect(recessed.collar!.y - recessed.collar!.radius).toBeCloseTo(2.82, 1);
    // The recess comes out of the room behind the board (30.5 mm without it), and the ring
    // then reaches further back, so the head has to be deeper too.
    expect(
      issueKeys({ screen: "portrait", screenRecess: 4, headDepth: 50, headBackRound: 15 }),
    ).toEqual([]);
    expect(issueKeys({ screenRecess: 4, headDepth: 34.5 })).not.toContain("headDepth");
    expect(issueKeys({ screenRecess: 4, headDepth: 34 })).toContain("headDepth");
  });
});

describe("astronaut fit", () => {
  it.each<[string, Params]>([
    ["landscape", {}],
    ["portrait", { screen: "portrait" }],
    [
      "portrait with a recessed screen",
      { screen: "portrait", screenRecess: 4, headDepth: 50, headBackRound: 15 },
    ],
  ])("assembles %s without parts or hardware colliding", { timeout: 60_000 }, async (_, values) => {
    const result = await buildWith(ID, draft(values));
    const L = astronautLayout(paramsFor(ID, draft(values)));
    const wasm = await getManifold();
    withScope((scope) => {
      const t = <T extends { delete(): void }>(x: T) => scope.track(x);
      const placed = result.parts.map(
        (part) => [part.name, assembledSolid(wasm, scope, part)] as const,
      );
      const overlap = (a: Manifold, b: Manifold) => t(a.intersect(b)).volume();
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const [[a, sa], [b, sb]] = [placed[i], placed[j]];
          expect(overlap(sa, sb), `${a} x ${b}`).toBeLessThan(0.5);
        }
      }
      // The module (glass outline with its R2 corners, from the glass front to the standoff
      // tips) and the speakers on the back wall fit their spaces.
      const { glass, view, glassY, cz, depth } = L.head;
      const outline = t(
        t(wasm.CrossSection.square([2 * glass.hx - 4, 2 * glass.hz - 4], true)).offset(
          2,
          "Round",
          2,
          32,
        ),
      );
      const module = t(
        t(t(outline.extrude(10)).rotate([-90, 0, 0])).translate([glass.cx, glassY, cz + glass.cz]),
      );
      const speakers = L.speakers.map((s) =>
        t(t(wasm.Manifold.cube([20, 5.5, 30], true)).translate([s.x, depth - WALL - 2.75, s.z])),
      );
      const halves = placed.filter(([name]) => name.startsWith("head-")).map(([, s]) => s);
      const head = t(wasm.Manifold.union(halves));
      expect(overlap(head, module), "module").toBeLessThan(0.5);
      for (const s of speakers) expect(overlap(head, s), "speaker").toBeLessThan(0.5);
      // The glass rests on solid front all round the window, recessed or not. (The rotation
      // onto the face flips the outline's y, so the strip is drawn mirrored.)
      const strip = t(
        t(
          t(
            t(outline.translate([glass.cx, -glass.cz])).subtract(
              t(wasm.CrossSection.square([2 * view.hx + 3, 2 * view.hz + 3], true)),
            ),
          ).extrude(glassY - 0.6),
        ).rotate([-90, 0, 0]),
      ).translate([0, 0.5, cz]);
      expect(overlap(head, t(strip)) / strip.volume(), "front").toBeGreaterThan(0.98);
    });
  });

  it("centres the speaker grilles on the back", { timeout: 30_000 }, async () => {
    const result = await buildWith(ID, draft());
    const L = astronautLayout(paramsFor(ID, draft()));
    const { hw, hh, cz, depth, backRadius } = L.head;
    const wasm = await getManifold();
    withScope((scope) => {
      const t = <T extends { delete(): void }>(x: T) => scope.track(x);
      const back = assembledSolid(
        wasm,
        scope,
        result.parts.find((p) => p.name === "head-back")!,
      );
      // The flat middle of the back wall, where the grille holes go, mirrored about x = 0.
      const [fx, fz] = [hw - backRadius - WALL, hh - backRadius - WALL];
      const slab = t(
        t(wasm.Manifold.cube([2 * fx, WALL, 2 * fz], true)).translate([0, depth - WALL / 2, cz]),
      );
      const wall = t(back.intersect(slab));
      const mirrored = t(wall.mirror([1, 0, 0]));
      expect(t(wall.subtract(mirrored)).volume()).toBeLessThan(0.5);
    });
  });

  it("twists the helmet discs on and locks them", { timeout: 60_000 }, async () => {
    const result = await buildWith(ID, draft());
    const L = astronautLayout(paramsFor(ID, draft()));
    const { cz } = L.head;
    const wasm = await getManifold();
    withScope((scope) => {
      const t = <T extends { delete(): void }>(x: T) => scope.track(x);
      const solid = (name: string) =>
        assembledSolid(
          wasm,
          scope,
          result.parts.find((p) => p.name === name)!,
        );
      const head = t(wasm.Manifold.union([solid("head-front"), solid("head-back")]));
      for (const [name, s] of [
        ["disc-left", -1],
        ["disc-right", 1],
      ] as const) {
        const disc = solid(name);
        // The disc turned `turn` degrees back from locked (anticlockwise seen from outside)
        // and `out` mm off the head.
        const overlap = (turn: number, out: number) => {
          const centred = t(disc.translate([0, -L.seamY, -cz]));
          const moved = t(t(centred.rotate([s * turn, 0, 0])).translate([s * out, L.seamY, cz]));
          return t(moved.intersect(head)).volume();
        };
        // On: straight in with the notches over the hooks, then the clockwise turn, which
        // draws the disc the last `rise` onto the head.
        for (const out of [8, 4, 2, 1]) {
          expect(overlap(TWIST.turn, TWIST.rise + out), `${name} in at ${out}`).toBeLessThan(0.5);
        }
        for (const f of [1, 0.75, 0.5, 0.25, 0]) {
          expect(overlap(TWIST.turn * f, TWIST.rise * f), `${name} turn ${f}`).toBeLessThan(0.5);
        }
        // Short of the notches, the hooks hold it: pulled 1 mm off, locked or half-turned.
        expect(overlap(0, 1), `${name} pulled locked`).toBeGreaterThan(2);
        expect(
          overlap(TWIST.turn / 2, TWIST.rise / 2 + 1),
          `${name} pulled mid-turn`,
        ).toBeGreaterThan(2);
      }
    });
  });

  it.each([
    ["landscape", {}],
    ["portrait", { screen: "portrait", portraitMount: "twist" }],
  ])("twists the head onto the body (%s) and locks it", { timeout: 60_000 }, async (_, mount) => {
    const result = await buildWith(ID, draft(mount));
    const L = astronautLayout(paramsFor(ID, draft(mount)));
    const wasm = await getManifold();
    withScope((scope) => {
      const t = <T extends { delete(): void }>(x: T) => scope.track(x);
      const solid = (name: string) =>
        assembledSolid(
          wasm,
          scope,
          result.parts.find((p) => p.name === name)!,
        );
      const body = solid("body");
      const shell = ["head-front", "head-back", "disc-left", "disc-right"].map(solid);
      // In portrait a 12.2 x 6.3 USB-C plug, 25 mm from the port to the end of its strain
      // relief, hangs from the board's bottom edge through the neck and turns with the head.
      const { usb } = L;
      const plug = t(
        t(wasm.Manifold.cube([12.2, 6.3, 25], true)).translate([usb.x, usb.y, usb.z - 12.5]),
      );
      if (L.portrait) {
        for (const s of shell) expect(t(plug.intersect(s)).volume(), "plug").toBeLessThan(0.5);
      }
      const head = t(wasm.Manifold.union(L.portrait ? [...shell, plug] : shell));
      const [x, y] = [L.neck.x, L.neck.y];
      // The head turned `turn` degrees back from locked (anticlockwise seen from above)
      // about the neck and lifted `up` mm off the body.
      const overlap = (turn: number, up: number) => {
        const centred = t(head.translate([-x, -y, 0]));
        const moved = t(t(centred.rotate([0, 0, turn])).translate([x, y, up]));
        return t(moved.intersect(body)).volume();
      };
      for (const up of [8, 4, 2, 1]) {
        expect(overlap(TWIST.turn, TWIST.rise + up), `in at ${up}`).toBeLessThan(0.5);
      }
      for (const f of [1, 0.75, 0.5, 0.25, 0]) {
        expect(overlap(TWIST.turn * f, TWIST.rise * f), `turn ${f}`).toBeLessThan(0.5);
      }
      expect(overlap(0, 1), "pulled locked").toBeGreaterThan(2);
      expect(overlap(TWIST.turn / 2, TWIST.rise / 2 + 1), "pulled mid-turn").toBeGreaterThan(2);
    });
  });

  it(
    "lowers the portrait head and its plug straight into the neck ring, keyed",
    { timeout: 60_000 },
    async () => {
      const values = draft({ screen: "portrait" });
      const result = await buildWith(ID, values);
      const L = astronautLayout(paramsFor(ID, values));
      const wasm = await getManifold();
      withScope((scope) => {
        const t = <T extends { delete(): void }>(x: T) => scope.track(x);
        const solid = (name: string) =>
          assembledSolid(
            wasm,
            scope,
            result.parts.find((p) => p.name === name)!,
          );
        const body = solid("body");
        const shell = ["head-front", "head-back", "disc-left", "disc-right"].map(solid);
        // A 12.2 x 6.3 USB-C plug, 25 mm from the port to the end of its strain relief, hangs
        // from the board's bottom edge through the neck.
        const { usb } = L;
        const plug = t(
          t(wasm.Manifold.cube([12.2, 6.3, 25], true)).translate([usb.x, usb.y, usb.z - 12.5]),
        );
        for (const s of shell) expect(t(plug.intersect(s)).volume(), "plug").toBeLessThan(0.5);
        const head = t(wasm.Manifold.union([...shell, plug]));
        const overlap = (moved: Manifold) => t(moved.intersect(body)).volume();
        // Straight down from above, all the way to its seat.
        for (const up of [30, 20, 10, 5, 2, 0]) {
          expect(overlap(t(head.translate([0, 0, up]))), `lifted ${up}`).toBeLessThan(0.5);
        }
        // Seated, the sleeve's flats stop it turning even without the plug in its opening,
        // and its round stops it sliding.
        const [x, y] = [L.neck.x, L.neck.y];
        const front = shell[0];
        for (const turn of [-8, 8]) {
          const turned = t(
            t(t(front.translate([-x, -y, 0])).rotate([0, 0, turn])).translate([x, y, 0]),
          );
          expect(overlap(turned), `turned ${turn}`).toBeGreaterThan(3);
        }
        for (const shift of [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
        ] as [number, number, number][]) {
          expect(overlap(t(head.translate(shift))), `shifted ${shift.join(",")}`).toBeGreaterThan(
            1,
          );
        }
        // The ring stays under the head: at most 2 mm past its front and back.
        const ring = t(body.trimByPlane([0, 0, 1], L.body.top + 0.5)).boundingBox();
        expect(ring.min[1]).toBeGreaterThan(-2);
        expect(ring.max[1]).toBeLessThan(L.head.depth);
      });
    },
  );

  it(
    "leads the portrait cable down the body and out under the base",
    { timeout: 30_000 },
    async () => {
      const values = draft({ screen: "portrait" });
      const result = await buildWith(ID, values);
      const L = astronautLayout(paramsFor(ID, values));
      const wasm = await getManifold();
      withScope((scope) => {
        const t = <T extends { delete(): void }>(x: T) => scope.track(x);
        const body = assembledSolid(
          wasm,
          scope,
          result.parts.find((p) => p.name === "body")!,
        );
        // A 4 mm cable from the plug's end straight down to 2 mm above the bed, then back
        // along the bed past the body.
        const { x, y } = L.neck;
        const down = t(t(wasm.Manifold.cylinder(L.usb.z - 25 - 2, 2, 2, 24)).translate([x, y, 2]));
        const back = body.boundingBox().max[1] + 5;
        const along = t(
          t(t(wasm.Manifold.cylinder(back - y, 2, 2, 24)).rotate([-90, 0, 0])).translate([x, y, 2]),
        );
        expect(t(down.intersect(body)).volume(), "down").toBeLessThan(0.1);
        expect(t(along.intersect(body)).volume(), "along").toBeLessThan(0.1);
      });
    },
  );

  it.each(["rounded", "circle", "hexagon", "shield"])(
    "seats a %s badge in its recess, lettering on its face",
    { timeout: 30_000 },
    async (patchShape) => {
      const values = draft({ patchShape, patchText: "FR" });
      const result = await buildWith(ID, values);
      const L = astronautLayout(paramsFor(ID, values));
      const byName = (name: string) => result.parts.find((p) => p.name === name);
      expect(byName("badge")?.assembly).toBe("patch");
      expect(byName("letters")?.assembly).toBe("patch");
      const wasm = await getManifold();
      withScope((scope) => {
        const t = <T extends { delete(): void }>(x: T) => scope.track(x);
        const solid = (name: string) => assembledSolid(wasm, scope, byName(name)!);
        const [body, badge, letters] = ["body", "badge", "letters"].map(solid);
        const overlap = (shift: [number, number, number]) =>
          t(t(badge.translate(shift)).intersect(body)).volume();
        // In the recess: clear of the body, but its back on the floor and its rim 0.2 mm from
        // the walls, so a 0.3 mm nudge back, sideways, or up meets the body.
        expect(overlap([0, 0, 0])).toBeLessThan(0.1);
        expect(t(letters.intersect(body)).volume(), "letters").toBeLessThan(0.1);
        for (const shift of [
          [0, 0.3, 0],
          [0.3, 0, 0],
          [-0.3, 0, 0],
          [0, 0, 0.3],
          [0, 0, -0.3],
        ] as [number, number, number][]) {
          expect(overlap(shift), `nudged ${shift.join(",")}`).toBeGreaterThan(0.01);
        }
        // It stands out of the chest without turning into a slab, and the lettering stands on
        // its face, inside its outline (both as printed: back on the bed, face up).
        const [chest] = chestSurface(L, [[0, L.patch!.z]]);
        expect(badge.boundingBox().min[1]).toBeLessThan(chest - 0.5);
        const b = boundsOf([byName("badge")!.mesh])!;
        const l = boundsOf([byName("letters")!.mesh])!;
        expect(b.max[2] - b.min[2]).toBeLessThan(3);
        expect(l.min[2]).toBeCloseTo(b.max[2], 3);
        expect(l.min[0]).toBeGreaterThan(b.min[0]);
        expect(l.max[0]).toBeLessThan(b.max[0]);
        expect(l.min[1]).toBeGreaterThan(b.min[1]);
        expect(l.max[1]).toBeLessThan(b.max[1]);
        // Centred on the badge's outline, except on the shield: its point pulls the outline's
        // middle down, so the lettering sits a quarter of the box's half height (2 mm) above
        // it, over the middle of the shield's area.
        const above = (l.min[1] + l.max[1]) / 2 - (b.min[1] + b.max[1]) / 2;
        expect(above).toBeCloseTo(patchShape === "shield" ? 0.275 * L.patch!.hz : 0, 0);
      });
    },
  );
});

/** A part as a Manifold in the assembled frame. */
function assembledSolid(wasm: ManifoldToplevel, scope: WasmScope, part: Part): Manifold {
  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: part.mesh.positions,
    triVerts: part.mesh.indices,
  });
  const solid = scope.track(new wasm.Manifold(mesh));
  return scope.track(solid.transform(part.assembled!));
}
