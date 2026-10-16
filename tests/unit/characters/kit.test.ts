import { describe, expect, it } from "vitest";
import { SPACER, headSize } from "../../../src/characters/kit";
import { boundsOf } from "../../../src/core/bounds";
import { dogLayout } from "../../../src/generators/display-dog/layout";
import { robotLayout } from "../../../src/generators/display-robot/layout";
import { validateParams } from "../../../src/core/params";
import { findGenerator } from "../../../src/generators";
import { buildWith, paramsFor } from "../generators/helpers";

// The kit is exercised through the dog's params; the robot shares every value used here.
const ID = "display-dog";
const BOARD = "waveshare-s3-touch-lcd-28";

describe('headSize with the 2.8" board', () => {
  // The visible area sits 3 mm toward the far end from the USB-C end, so the outline reaches
  // 6 mm further toward the port. Cable plugs need 6 mm on the edge clockwise from the port;
  // an inserted memory card 2 mm on the other side.
  it.each([
    ["right", { right: 39.83, left: 33.83, top: 25.57, bottom: 25.57 }, { bottom: 6, top: 2 }],
    ["left", { left: 39.83, right: 33.83, top: 25.57, bottom: 25.57 }, { top: 6, bottom: 2 }],
    ["top", { top: 39.83, bottom: 33.83, left: 25.57, right: 25.57 }, { right: 6, left: 2 }],
  ] as const)("turns the module with USB-C on the %s", (usbEdge, reach, room) => {
    const head = headSize(paramsFor(ID, { display: BOARD, usbEdge }));
    for (const [edge, value] of Object.entries(reach)) {
      expect(head.footprint[edge as keyof typeof reach], edge).toBeCloseTo(value, 2);
    }
    expect(head.room).toMatchObject(room);
  });

  it("centres the face on the visible area and keeps the cable room inside the hollow", () => {
    const values = paramsFor(ID, { display: BOARD, usbEdge: "right", faceMargin: 5, wall: 2 });
    const { pad, footprint, view } = headSize(values);
    // Across the port axis, the far side sets the pad: 39.83 + 5.
    expect(pad.halfX).toBeCloseTo(44.83, 2);
    // Up and down, the 6 mm of cable room plus a wall beats the 5 mm margin: 25.57 + 8.
    expect(pad.halfZ).toBeCloseTo(33.57, 2);
    expect(footprint.right - footprint.left).toBeCloseTo(6, 2);
    expect(view).toEqual({ halfX: 29.1, halfZ: 21.9 });
  });

  it("keeps the plug opening behind the glass", () => {
    const def = findGenerator(ID)!;
    const keys = (usbPlugHeight: number) =>
      validateParams(def, paramsFor(ID, { display: BOARD, usbPlugHeight })).map((i) => i.key);
    // USB-C centre 7.17 mm behind the glass front, 0.5 mm kept: at most 13.34 mm.
    expect(keys(13.3)).toEqual([]);
    expect(keys(13.4)).toContain("usbPlugHeight");
  });
});

describe("pin holes", () => {
  // BAT_PWR, RESET, BOOT sit 3.63, 11.45, and 19.27 mm from the visible area's centre toward
  // the end away from USB-C, on the long edge counter-clockwise from the port.
  it.each([
    ["right", [0, 0, 1], (s: number) => [-s, 24.78]],
    ["left", [0, 0, -1], (s: number) => [s, -24.78]],
    ["top", [-1, 0, 0], (s: number) => [-24.78, -s]],
  ] as const)(
    "start at the actuators and point out of the board's edge (USB-C %s)",
    (usbEdge, dir, at) => {
      const L = dogLayout(paramsFor(ID, { display: BOARD, usbEdge }));
      expect(L.pinHoles.map((h) => h.name)).toEqual(["BAT_PWR", "RESET", "BOOT"]);
      [3.63, 11.45, 19.27].forEach((s, i) => {
        const { from, dir: d } = L.pinHoles[i];
        const [x, z] = at(s);
        expect(from[0]).toBeCloseTo(x, 5);
        expect(from[2] - L.cz).toBeCloseTo(z, 5);
        expect(from[1]).toBeCloseTo(L.faceY + L.wall + 6.7, 5);
        d.forEach((v, k) => expect(v).toBeCloseTo(dir[k], 5));
      });
    },
  );
});

describe("board spacer", () => {
  it("keeps the head split far enough behind the standoffs for the spacer's frame", () => {
    // The robot's pods allow the split to move most, and with USB-C on top they stay on it; a
    // shallow head brings the board's standoff tips within the split's range.
    const robot = "display-robot";
    const shallow = { display: BOARD, usbEdge: "top", antenna: "none", headDepth: 50 };
    const L = robotLayout(paramsFor(robot, shallow));
    const limit = L.spacer!.front + SPACER.thickness + SPACER.gap;
    const keys = (headSplitOffset: number) =>
      validateParams(findGenerator(robot)!, paramsFor(robot, { ...shallow, headSplitOffset })).map(
        (i) => i.key,
      );
    expect(keys(Math.ceil(limit * 2) / 2)).toEqual([]);
    expect(keys(Math.floor(limit * 2) / 2)).toContain("headSplitOffset");
  });

  it(
    "reaches from over the standoff tips to just before the split",
    { timeout: 60_000 },
    async () => {
      const values = { display: BOARD, detail: "draft", headSplitOffset: 2 };
      const L = dogLayout(paramsFor(ID, values));
      const result = await buildWith(ID, values);
      const spacer = result.parts.find((p) => p.name === "spacer")!;
      const { min, max } = boundsOf([spacer.mesh])!;
      // Printed on its frame: its height is split - gap - (tips - socket depth).
      expect(min[2]).toBeCloseTo(0, 3);
      expect(max[2]).toBeCloseTo(2 - SPACER.gap - (L.spacer!.front - SPACER.socketDepth), 1);
    },
  );
});
