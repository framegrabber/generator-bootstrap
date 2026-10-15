# Display robot generator and the shared character kit

Status: planned.

## Problem Statement
How might we add a cute display robot without copying the display dog's 1,400 lines, so the dog, the robot, and later characters share one implementation of the hardware, cuts, accents, and print layout?

## Decisions (from the user)
- Shape: the first robot spike (`/tmp/robot-spike/robot.mjs`). A round helmet with a flat face for the display, headphone ear pods, an antenna, stubby arms with round hands, sitting legs with chunky feet, and a pillowy torso. Rejected: the Orbit and Eilik visor plates ("overhead"), the BMO box, and the TV-head.
- Accents, each switchable, in one accent colour: antenna ball, ear pods, chest badge.
- Antenna styles: stalk + ball, sprout (two leaves), none.
- Rectangular displays get the same robot with a rounded-rectangle face (the face pad follows the display, as in the dog).
- Architecture: extract a shared kit from the dog first, guarded by the dog's tests, then build the robot on it.

## Recommended Direction
**Kit** (`src/characters/`), split by where the code may run:

| Module | Runs on | Contents |
|---|---|---|
| `hardware.ts` | main + worker | display and battery catalogue, `selectedModule`, `selectedBattery`, the Display and Battery param specs |
| `face.ts` | main + worker | display footprint and face-pad sizing from module + margin, port placement |
| `cuts.ts` | main + worker | neck cut (height, tilt) and front/back split: params, layout, plane helpers, validation |
| `assemble.ts` | worker | cut a whole character into pieces (peg and socket, dowels in bosses), cut accents with them, print poses, side-by-side layout, `assembled` transforms, `whole` part, cut planes, crumb filter and loose-piece warnings |
| `face-build.ts` | worker | window, pocket rim, pocket, USB slot or cable hole as manifolds |

A character supplies: its outer and hollow SDFs and bounds, its face plane and display centre, its dowel boss positions, an anatomy reference height, and its accent solids. The dog's existing tests must pass unchanged through the refactor (part names, volumes, validation boundaries).

**Accents become pieces too.** An accent is a solid region (the dog's flat-backed nose and inner ears, or a "skin": the outer 1.2 mm of the model inside a region, proven in the Eilik/TV spike). The kit cuts accents with the same planes as the body, and each piece's accent fragments join that piece's in-place assembly. The dog's accents never cross a cut, so its glue-on mode stays. The robot's accents do cross the head split, so it offers in place or none.

**Robot specifics**
- Antenna and ear pods are centred on the head split, so each half prints its half lying flat, like the dog's ears.
- Sprout: two flattened leaves on a short stem, in the split plane.
- Chest badge: a round skin patch on the torso front, below the neck cut, so it joins the body's assembly.
- Head size from the display, like the dog; params for proportions (head depth, body size, softness), arms on/off, legs on/off, antenna style, ear pods on/off.

## Key Assumptions to Validate
- [ ] The kit extraction keeps every dog test green without editing the tests. Test: run the suite after each extraction step.
- [ ] Skin accents cut by the head split stay single pieces per side at default detail (the spike left only zero-volume crumbs). Test: robot unit test, every part one real piece.
- [ ] A centred antenna stalk (radius 1.8 mm) prints as two half-stalks lying flat. Test: check part bounds; slicer later.
- [ ] Robot build stays near 2–3 s in the browser with three skin accents. Test: time the default build.

## MVP Scope
In: kit extraction with the dog on it; `display-robot` generator with the shape above, round and custom displays, battery check, neck cut (height, tilt) and head split, dowels, peg and socket, `whole` export, assembled view and cut planes, three switchable skin accents in place, antenna stalk + ball or sprout.

## Not Doing (and Why)
- Visor plates, BMO, TV-head: the user rejected them.
- Glue-on robot accents: skin accents are thin and curved and cross the head split; there is no flat face to glue.
- Per-accent colours: one accent colour, like the dog.
- A rectangular catalogue module: Custom covers it until a real module is named.

## Open Questions
- None blocking.
