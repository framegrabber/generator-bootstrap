import type { GeneratorDef, NumberParam } from "../../core/types";
import { astronautLayout, MIN_HEAD_DEPTH, validateLayout } from "./layout";

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
 * A Deskimon-style astronaut around the Waveshare 2.8" board (landscape, USB-C on the right):
 * every proportion of the head, torso, arms, and legs is a param. The head prints as a front
 * and a back half, held together by the helmet discs and the neck socket; see layout.ts.
 */
const astronaut: GeneratorDef = {
  id: "astronaut",
  name: "Screen astronaut",
  description:
    "A sitting astronaut whose face is the Waveshare ESP32-S3-Touch-LCD-2.8. The head prints in two halves that the helmet discs and the neck socket hold together; the body prints in one piece.",
  params: [
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
      45,
      MIN_HEAD_DEPTH,
      60,
      "The board, battery, and speakers need the minimum.",
    ),
    pct(
      "headCorner",
      "Corner roundness",
      "Head",
      50,
      "Face corner radius, relative to the shorter half side.",
    ),
    pct(
      "headBackRound",
      "Back roundness",
      "Head",
      20,
      "How much of the depth behind the rim curves inward.",
    ),
    mm("headFrontEdge", "Front edge", "Head", 2.5, 0.5, 6, "Rounding of the rim around the face."),

    mm("lowerWidth", "Width", "Lower body", 70, 25, 90),
    mm("lowerDepth", "Depth", "Lower body", 60, 20, 70),
    mm(
      "lowerHeight",
      "Height",
      "Lower body",
      45,
      10,
      70,
      "Top of the lower volume above the base.",
    ),
    pct("lowerRoundness", "Roundness", "Lower body", 100, "0 is box-like, 100 an ellipsoid."),
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
      "The torso is cut flat 0.4 of it above its centre.",
    ),
    mm(
      "upperOffset",
      "Offset",
      "Upper body",
      10,
      -30,
      40,
      "Centre above (+) or below (−) the lower volume's top; the head and shoulders move with it.",
    ),
    pct("upperRoundness", "Roundness", "Upper body", 90, "0 is box-like, 100 an ellipsoid."),
    mm("upperForward", "Forward", "Upper body", -1, -10, 10, "Leans the chest toward the face."),

    mm(
      "stackBlend",
      "Volume blend",
      "Body",
      25,
      0,
      25,
      "Fillet between the lower and upper volume.",
    ),
    mm("blend", "Joint softness", "Body", 1, 0, 10, "Fillet where arms and legs meet the torso."),

    mm("armLength", "Length", "Arms", 38, 10, 60),
    deg("armAngle", "Angle out", "Arms", 35, 0, 60, "Away from the body, seen from the front."),
    deg(
      "armForward",
      "Angle forward",
      "Arms",
      15,
      -20,
      40,
      "Hands toward the front, seen from the side.",
    ),
    mm("armThickness", "Thickness", "Arms", 15, 6, 25),
    mm("armWidth", "Width", "Arms", 18, 8, 35, "Front to back."),
    pct("armRoundness", "Roundness", "Arms", 85),

    mm("legLength", "Length", "Feet", 35, 10, 50, "From the hip inside the torso to the toe."),
    deg("legAngle", "Toes out", "Feet", 9, -10, 40, "Turn of the feet away from straight ahead."),
    mm("legWidth", "Width", "Feet", 26, 10, 40),
    mm("legHeight", "Height", "Feet", 23, 8, 40),
    mm("legSpread", "Spread", "Feet", 15, 5, 35, "Hip distance from the middle."),
    pct("legRoundness", "Roundness", "Feet", 85),

    {
      ...mm("earSize", "Helmet disc radius", "Details", 11.5, 5, 20),
      help: "The discs snap onto the bosses that hold the head halves together.",
    },
    { kind: "boolean", key: "chestPatch", label: "Chest patch", group: "Details", default: true },

    { kind: "color", key: "suitColor", label: "Suit", group: "Colours", default: "#f1f1ee" },
    {
      kind: "color",
      key: "trimColor",
      label: "Helmet discs",
      group: "Colours",
      default: "#00a3d7",
    },
    {
      kind: "color",
      key: "patchColor",
      label: "Chest patch",
      group: "Colours",
      default: "#3a88fe",
    },
    { kind: "color", key: "eyeColor", label: "Eyes", group: "Colours", default: "#19d3ff" },

    {
      kind: "number",
      key: "meshEdge",
      label: "Mesh detail",
      group: "Print",
      unit: "mm",
      default: 0.8,
      min: 0.4,
      max: 2,
      step: 0.1,
      help: "Triangle size of the curved surfaces; smaller is smoother and slower.",
    },
  ],
  validate: (values) => validateLayout(astronautLayout(values)),
};

export default astronaut;
