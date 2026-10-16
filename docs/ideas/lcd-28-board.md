# 2.8" board with speakers (ESP32-S3-Touch-LCD-2.8)

Status: planned.

## Problem Statement

How might we make the Waveshare ESP32-S3-Touch-LCD-2.8, a 2.8" touch screen with the ESP32, battery charger, and a stereo speaker amplifier on one board, the default display for the dog and the robot, with its two speakers in the dog's ears and the robot's headphone pods, its USB-C port and buttons reachable, and the board held so taps on the screen do not push it in?

## Hardware

Sources: the vendor STEP model (`esp32-s3-touch-lcd-2_8.stp`, Creo export, 2024-07-26) and the structure drawing (https://files.waveshare.com/wiki/ESP32-S3-Touch-LCD-2.8/ESP32-S3-Touch-LCD-2.8_structure.pdf); they agree to 0.05 mm. The ESP32-S3-Touch-LCD-2.8**B** is a different board (480 × 640 RGB panel, 52.9 × 71.3 glass, buzzer only, no speaker header); its drawing does not apply.

STEP frame: origin at the centre of the touch panel's visible area, glass front at z = +0.70, y away from the USB-C end, buttons at +x.

|                                  | Value                                                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cover glass                      | 50.54 × 73.06 × 0.70, corners R2                                                                                                                                |
| Visible area (touch panel)       | 43.80 × 58.20; LCD active area 43.20 × 57.60                                                                                                                    |
| Visible area position            | centred across; 10.43 from the USB-C end, 4.43 from the far end: 3.0 mm off the glass centre, away from the USB-C                                               |
| PCB                              | 49.90 × 69.00 × 1.6, back face 6.00 behind the glass front                                                                                                      |
| Thickness                        | 10.00 to the tips of four soldered M2.5 standoffs (Ø5.5, 4 mm) at x ±20.5, y −32.9 and +27.1; tallest component 9.4                                             |
| USB-C                            | centre x −0.06, 7.17 behind the glass front; mouth 1.25 behind the glass edge. Over the mouth only the 0.7 mm cover glass overhangs; the LCD stops 0.8 mm short |
| Buttons                          | side-push, actuators at x 24.78: BAT_PWR y 3.63, RESET 11.45, BOOT 19.27; 6.7 behind the glass front                                                            |
| microSD slot                     | same edge as the buttons, centre y −7.2; an inserted card ends about 1 mm past the glass edge (15 mm card, 11.3 mm slot)                                        |
| Speaker, battery, RTC connectors | the other long edge (x −22.7), plugs inserted from the edge, 6.0–9.4 behind the glass front                                                                     |
| Speakers (2)                     | 20 × 30 × 5.5 boxes, 150 mm leads to one 4-pin PH1.25 plug; grille about 13.4 × 16.6; corner radius unknown                                                     |
| USB-C cable (user's)             | plug grip 12.2 × 6.3 × 31, metal 6.7 long                                                                                                                       |

Seen from the front with USB-C on the right, the buttons are on top and the cable connectors at the bottom; with USB-C on the left they swap.

## Decisions (user)

1. The face is centred on the visible area, not the glass: the picture sits in the middle of the face; the head grows 6 mm along the USB-C axis.
2. The standoffs hold the board.
3. Pin holes for the buttons (all three). Room for an inserted microSD card; no opening for it.
4. Dog ears grow to hold the speakers. The "no ears" option goes.
5. Robot: speakers in the ear pods, which stay on the head split; USB-C exits through the side of the face in front of them.
6. This board becomes the default display of both characters. Links always carry `display`, and links without it (written before this change) keep meaning the old default.

## Design

**Catalogue module.** Modules are described in a canonical frame: centred on the visible area, port edge up. New fields: the outline's offset from the visible area, the USB-C position (depth behind the glass front, offset along the edge), buttons (position, depth), standoffs, room needed beyond the outline per edge (cable plugs, SD card), and speakers. A rectangular catalogue module turns with "USB-C faces" like the round ones' tabs: landscape for left or right, portrait for top. The face pad is centred on the visible area and sized so the hollow keeps the extra room (6 mm on the connector edge, 2 mm on the SD edge) behind the face.

**USB-C opening.** Plug width and height become params (default 13 × 7: the user's 12.2 × 6.3 plug plus 0.4 mm a side), replacing the fixed 13 × 7.5. Rounded ends. Validation keeps the opening behind the front wall.

**Buttons.** A Ø1.6 pin hole from each actuator straight out through the shell, for a paperclip.

**Holding the board.** Posts from either head half cannot reach the standoffs: the split runs through the ears and pods 17 mm behind the standoff tips, so front-half posts would block inserting the board and back-half posts would stand proud of the back half's split face. Instead a printed spacer (four tubes with sockets over the standoffs, joined by a frame at the split plane) sits on the standoffs, and four posts in the back half, flush with its split face, press it forward when the head closes. No screws; the spacer prints flat on its frame. The battery lies inside the frame. The dowel bosses move to an angle clear of the spacer, the posts, and the speaker pockets.

**Speakers.** A shared pocket in the kit: 20.6 × 30.6 × 6.1 with R6 corners (fits any speaker with corners of R6 or more), a hex grille of Ø1.6 holes over the grille area through the outer wall, and a 7 × 4.5 channel to the head's hollow that the 4-pin plug passes through. The pocket straddles the head split, so the speaker is clamped between the halves and each half prints the pocket open on its split face. Validation keeps the split inside the pocket.

- Dog: the speaker lies in the ear's plane, grille forward (pointy and round ears) or outward (floppy ears). The ear grows (width and length together) until the pocket plus a wall fits inside ear and head; the ear params stay minimums.
- Robot: the speaker stands upright in each pod, grille outward; pods grow to hold it. Pods stay on the split for speaker boards, moving back only if the USB-C opening would cut them. A speaker board needs ear pods (validation).

## Key Assumptions to Validate

- [ ] R6 pocket corners fit the speaker: check on the real speaker; the pocket has 0.3 mm clearance a side.
- [ ] A Ø1.6 printed pin hole lets a paperclip reach the buttons: print test.
- [ ] Spacer length (split plane minus standoff tips) clamps the board without rattling: print test; the spacer can be reprinted alone.
- [ ] Bambu Studio loads the new parts (spacer) with the right names and filaments: CLI check.

## Not Doing

- SD card access from outside: the user does not need it.
- Screws: the spacer is clamped by the closed head.
- The 2.8B board: different panel and no speaker header.
- A speakers on/off param: speaker boards always get pockets.
