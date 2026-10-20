import type { GeneratorDef, NumberParam } from "../../core/types";
import { MIN_HEAD_DEPTH } from "./layout";

const mm = (
  key: string,
  label: string,
  group: string,
  value: number,
  min: number,
  max: number,
  help?: string,
): NumberParam => ({
  kind: "number",
  key,
  label,
  group,
  unit: "mm",
  default: value,
  min,
  max,
  step: 0.5,
  help,
});
const pct = (
  key: string,
  label: string,
  group: string,
  value: number,
  help?: string,
): NumberParam => ({
  kind: "number",
  key,
  label,
  group,
  unit: "%",
  default: value,
  min: 0,
  max: 100,
  step: 1,
  help,
});
const deg = (
  key: string,
  label: string,
  group: string,
  value: number,
  min: number,
  max: number,
  help: string,
): NumberParam => ({
  kind: "number",
  key,
  label,
  group,
  unit: "°",
  default: value,
  min,
  max,
  step: 1,
  help,
});

/**
 * Look development for a Deskimon-style astronaut around the Waveshare 2.8" board: every
 * proportion of the head, torso, arms, and legs is a param. The parts are solid previews;
 * hollowing, the head split, and the clamps come in the printable iteration.
 */
const astronaut: GeneratorDef = {
  id: "astronaut",
  name: "Screen astronaut",
  description:
    'Look development: a sitting astronaut whose face is the Waveshare 2.8" display. Tune the head, body, arms, and legs; the parts are solid previews, not printable yet.',
  params: [
    {
      kind: "select",
      key: "screen",
      label: "Screen",
      group: "Head",
      default: "landscape",
      options: [
        { value: "landscape", label: "Landscape (USB-C right)" },
        { value: "portrait", label: "Portrait (USB-C down)" },
      ],
    },
    mm(
      "headMarginSide",
      "Extra width",
      "Head",
      0,
      0,
      25,
      "Added on each side beyond what the board needs.",
    ),
    mm(
      "headMarginTop",
      "Extra height",
      "Head",
      0,
      0,
      25,
      "Added top and bottom beyond what the board needs.",
    ),
    mm(
      "headDepth",
      "Depth",
      "Head",
      30,
      MIN_HEAD_DEPTH,
      60,
      "The board, battery, and speakers need the minimum.",
    ),
    pct(
      "headCorner",
      "Corner roundness",
      "Head",
      42,
      "Face corner radius, relative to the shorter half side.",
    ),
    pct(
      "headBackRound",
      "Back roundness",
      "Head",
      100,
      "How much of the depth behind the rim curves inward.",
    ),
    mm("headFrontEdge", "Front edge", "Head", 2.5, 0.5, 6, "Rounding of the rim around the face."),

    mm("lowerWidth", "Width", "Lower body", 56, 25, 90),
    mm("lowerDepth", "Depth", "Lower body", 42.5, 20, 70),
    mm(
      "lowerHeight",
      "Height",
      "Lower body",
      38,
      10,
      70,
      "Top of the lower volume above the base.",
    ),
    pct("lowerRoundness", "Roundness", "Lower body", 50, "0 is box-like, 100 an ellipsoid."),
    mm(
      "lowerForward",
      "Forward",
      "Lower body",
      2,
      -10,
      10,
      "Moves the volume toward the face: a belly.",
    ),

    mm("upperWidth", "Width", "Upper body", 54, 25, 90),
    mm("upperDepth", "Depth", "Upper body", 40, 20, 70),
    mm(
      "upperHeight",
      "Height",
      "Upper body",
      45,
      10,
      80,
      "Centred on the lower volume's top; the torso is cut flat 0.4 of it above that.",
    ),
    pct("upperRoundness", "Roundness", "Upper body", 100, "0 is box-like, 100 an ellipsoid."),
    mm("upperForward", "Forward", "Upper body", 0, -10, 10, "Leans the chest toward the face."),

    mm(
      "stackBlend",
      "Volume blend",
      "Body",
      8,
      0,
      25,
      "Fillet between the lower and upper volume.",
    ),
    mm("blend", "Joint softness", "Body", 4.8, 0, 10, "Fillet where arms and legs meet the torso."),

    mm("armLength", "Length", "Arms", 34, 10, 60),
    deg("armAngle", "Angle out", "Arms", 20, 0, 60, "Away from the body, seen from the front."),
    deg(
      "armForward",
      "Angle forward",
      "Arms",
      7,
      -20,
      40,
      "Hands toward the front, seen from the side.",
    ),
    mm("armThickness", "Thickness", "Arms", 15, 6, 25),
    mm("armWidth", "Width", "Arms", 23, 8, 35, "Front to back."),
    pct("armRoundness", "Roundness", "Arms", 98),

    mm("legLength", "Length", "Feet", 26, 10, 50, "From the hip inside the torso to the toe."),
    deg("legAngle", "Toes out", "Feet", 9, -10, 40, "Turn of the feet away from straight ahead."),
    mm("legWidth", "Width", "Feet", 26, 10, 40),
    mm("legHeight", "Height", "Feet", 23, 8, 40),
    mm("legSpread", "Spread", "Feet", 15, 5, 35, "Hip distance from the middle."),
    pct("legRoundness", "Roundness", "Feet", 82),

    { kind: "boolean", key: "helmetEars", label: "Helmet discs", group: "Details", default: true },
    {
      ...mm("earSize", "Disc radius", "Details", 11.5, 5, 20),
      visibleWhen: (v) => v.helmetEars === true,
    },
    {
      kind: "boolean",
      key: "antenna",
      label: "Antenna",
      group: "Details",
      default: true,
      visibleWhen: (v) => v.helmetEars === true,
    },
    { kind: "boolean", key: "chestPatch", label: "Chest patch", group: "Details", default: true },

    { kind: "color", key: "suitColor", label: "Suit", group: "Colours", default: "#f1f1ee" },
    {
      kind: "color",
      key: "trimColor",
      label: "Helmet discs",
      group: "Colours",
      default: "#cfd4da",
    },
    {
      kind: "color",
      key: "patchColor",
      label: "Chest patch",
      group: "Colours",
      default: "#2b3a67",
    },
    { kind: "color", key: "eyeColor", label: "Eyes", group: "Colours", default: "#19d3ff" },

    {
      kind: "number",
      key: "meshEdge",
      label: "Mesh detail",
      group: "Preview",
      unit: "mm",
      default: 0.8,
      min: 0.4,
      max: 2,
      step: 0.1,
      help: "Triangle size; larger rebuilds faster while tuning.",
    },
  ],
  exportLabel: (v) => String(v.screen),
};

export default astronaut;
