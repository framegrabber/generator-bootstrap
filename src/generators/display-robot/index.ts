import { batteryParams, displayParams, validateDisplay } from "../../characters/hardware";
import { cutParams, headParams, printParams, validateCharacter } from "../../characters/kit";
import type { GeneratorDef, Params } from "../../core/types";
import { robotLayout } from "./layout";

const hasAccents = (v: Params) => v.accentMode !== "none";

/**
 * A sitting robot whose face is a round (or custom) display: a helmet head with ear pods and
 * an antenna, stubby arms, and sitting legs. Shared parts come from src/characters; the
 * robot's shape is in layout.ts and its accents in build.ts.
 */
const displayRobot: GeneratorDef = {
  id: "display-robot",
  name: "Display robot",
  description:
    "A sitting robot enclosure built around a small display: helmet head in two halves with ear pods and an antenna, body with a neck socket.",
  params: [
    ...displayParams(),
    ...headParams(),
    {
      kind: "number",
      key: "bodySize",
      label: "Body size",
      group: "Shape",
      unit: "%",
      default: 70,
      min: 55,
      max: 100,
      step: 1,
      help: "Torso width relative to the head.",
    },
    {
      kind: "number",
      key: "softness",
      label: "Softness",
      group: "Shape",
      unit: "mm",
      default: 3,
      min: 1,
      max: 6,
      step: 0.5,
      help: "How smoothly the head, pods, and limbs blend into each other.",
    },
    { kind: "boolean", key: "earPods", label: "Ear pods", group: "Robot", default: true },
    {
      kind: "select",
      key: "antenna",
      label: "Antenna",
      group: "Robot",
      default: "ball",
      options: [
        { value: "ball", label: "Stalk and ball" },
        { value: "sprout", label: "Sprout" },
        { value: "none", label: "None" },
      ],
    },
    {
      kind: "number",
      key: "antennaLength",
      label: "Antenna length",
      group: "Robot",
      unit: "mm",
      default: 10,
      min: 4,
      max: 20,
      step: 0.5,
      visibleWhen: (v) => v.antenna !== "none",
    },
    { kind: "boolean", key: "arms", label: "Arms", group: "Robot", default: true },
    { kind: "boolean", key: "legs", label: "Legs", group: "Robot", default: true },
    ...batteryParams(),
    ...cutParams(
      "Back (+) or forward (−) from the ear pods' middle, where pods and antenna print flat.",
    ),
    {
      kind: "boolean",
      key: "accentAntenna",
      label: "Antenna tip in accent colour",
      group: "Accents",
      default: true,
      visibleWhen: (v) => hasAccents(v) && v.antenna !== "none",
    },
    {
      kind: "boolean",
      key: "accentPods",
      label: "Ear pods in accent colour",
      group: "Accents",
      default: true,
      visibleWhen: (v) => hasAccents(v) && v.earPods === true,
    },
    {
      kind: "boolean",
      key: "chestBadge",
      label: "Chest badge",
      group: "Accents",
      default: true,
      visibleWhen: hasAccents,
    },
    ...printParams({
      accents: "Accents",
      glue: false,
      bodyColor: "#f4f4f1",
      accentColor: "#6fd3c8",
    }),
  ],
  validate(values) {
    const display = validateDisplay(values);
    if (display.length > 0) return display;
    const L = robotLayout(values);
    const issues = validateCharacter(values, L, L.torso.center[2]);
    if (L.port.kind === "usb" && L.edge === "top" && L.stalk) {
      issues.push({
        key: "usbEdge",
        message: "USB-C on top would cut through the antenna; turn the board left or right.",
      });
    }
    return issues;
  },
};

export default displayRobot;
