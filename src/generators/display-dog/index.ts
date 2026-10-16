import {
  batteryParams,
  displayParams,
  migrateDisplay,
  validateDisplay,
} from "../../characters/hardware";
import { cutParams, headParams, printParams, validateCharacter } from "../../characters/kit";
import type { GeneratorDef } from "../../core/types";
import { dogLayout } from "./layout";

/**
 * A sitting dog whose face is a round (or custom) display. The display sets the head size;
 * the rest are proportions. Shared parts come from src/characters; the dog's shape is in
 * layout.ts and its accents in build.ts.
 */
const displayDog: GeneratorDef = {
  id: "display-dog",
  name: "Display dog",
  description:
    "A sitting dog enclosure built around a small display: head in two halves, body with a neck socket.",
  params: [
    ...displayParams(),
    ...headParams(),
    {
      kind: "number",
      key: "bodySize",
      label: "Body size",
      group: "Shape",
      unit: "%",
      default: 72,
      min: 55,
      max: 100,
      step: 1,
      help: "Relative to the head.",
    },
    {
      kind: "number",
      key: "softness",
      label: "Softness",
      group: "Shape",
      unit: "mm",
      default: 4,
      min: 1,
      max: 8,
      step: 0.5,
      help: "How smoothly the head, ears, and limbs blend into each other.",
    },
    {
      kind: "select",
      key: "earStyle",
      label: "Ears",
      group: "Dog",
      default: "pointy",
      options: [
        { value: "pointy", label: "Pointy" },
        { value: "round", label: "Round" },
        { value: "floppy", label: "Floppy" },
        { value: "none", label: "None" },
      ],
    },
    {
      kind: "number",
      key: "earLength",
      label: "Ear length",
      group: "Dog",
      unit: "mm",
      default: 18,
      min: 8,
      max: 30,
      step: 0.5,
      visibleWhen: (v) => v.earStyle !== "none",
    },
    {
      kind: "number",
      key: "earWidth",
      label: "Ear width",
      group: "Dog",
      unit: "mm",
      default: 14,
      min: 8,
      max: 24,
      step: 0.5,
      visibleWhen: (v) => v.earStyle !== "none",
    },
    {
      kind: "number",
      key: "earSpread",
      label: "Ear spread",
      group: "Dog",
      unit: "°",
      default: 15,
      min: 0,
      max: 45,
      step: 1,
      visibleWhen: (v) => v.earStyle === "pointy" || v.earStyle === "round",
      help: "Outward lean.",
    },
    {
      kind: "number",
      key: "snout",
      label: "Snout size",
      group: "Dog",
      unit: "mm",
      default: 5,
      min: 0,
      max: 8,
      step: 0.5,
      help: "0 for none. Limited by the room below the screen.",
    },
    {
      kind: "boolean",
      key: "nose",
      label: "Nose",
      group: "Dog",
      default: true,
      visibleWhen: (v) => typeof v.snout === "number" && v.snout > 0,
    },
    { kind: "boolean", key: "frontLegs", label: "Front legs", group: "Dog", default: true },
    {
      kind: "select",
      key: "tail",
      label: "Tail",
      group: "Dog",
      default: "curl",
      options: [
        { value: "curl", label: "Curled up" },
        { value: "wag", label: "Wagging" },
        { value: "stub", label: "Stub" },
        { value: "none", label: "None" },
      ],
    },
    ...batteryParams(),
    ...cutParams("Back (+) or forward (−) from the ears' middle, where half-ears print flat."),
    ...printParams({
      accents: "Nose and inner ears",
      glue: true,
      bodyColor: "#f1e6d6",
      accentColor: "#4a3428",
    }),
  ],
  migrate: migrateDisplay,
  validate(values) {
    const display = validateDisplay(values);
    if (display.length > 0) return display;
    const L = dogLayout(values);
    return validateCharacter(values, L, L.body.center[2]);
  },
};

export default displayDog;
