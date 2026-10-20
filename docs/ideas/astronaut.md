# Screen astronaut

A sitting astronaut whose face is the Waveshare ESP32-S3-Touch-LCD-2.8, styled after Creative Chance's Deskimon: a few basic blocks (flat-fronted pillow head, domed torso, slab arms, rounded-box feet) joined with small fillets so each block stays readable.

## Decisions (user, 2026-10-20)

- New generator, starting with the astronaut, no backpack.
- Constrained to the 2.8" board for now: the head is sized from the board's glass, plug room, and stack; the user adds margins, not absolute sizes.
- Two iterations:
  1. **Look development** (this one): every proportion is a param (head margins, depth, corner and back roundness; body size, roundness, dome, belly, joint softness; arm length, angles, thickness, width, roundness; foot length, toe-out, size, spread, roundness). Parts are solid, coloured previews in one assembly.
  2. **Printable**: hollow head split into front and back halves at the board stack's depth, closed by the "triangle": two split bosses on the seam capped by the helmet discs, plus the split neck stem in the body's socket; a tongue on the front half keys the seam. Prototyped in `/tmp/proto/triangle.ts` (throwaway); weak spot is the seam far from the triangle (bunny: lower side corners, robot: top edge middle).

## Choices made without the user

- Name "Screen astronaut" (id `astronaut`): it sorts after "Display dog", so the default generator and its e2e test stay unchanged.
- Screen orientation is a param: landscape (USB-C right, the app's default for this board) or portrait (USB-C down, Deskimon's cable route).
- Body defaults are Deskimon's body measured from its builder meshes, scaled by the square root of the face-area ratio (1.37).

Status: iteration 1 implemented in `src/generators/astronaut/`.
