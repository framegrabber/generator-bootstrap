import type { PrintBed } from "./core/checks";

/**
 * Single place to rename the app. `slug` prefixes export filenames and the
 * localStorage key. Also update the <title> in index.html.
 */
export const APP = { name: "Generator Bootstrap", slug: "generator" } as const;

/** Build volume used for fit warnings and the preview's bed outline. */
export const PRINT_BED: PrintBed = { width: 256, depth: 256, height: 256 };
