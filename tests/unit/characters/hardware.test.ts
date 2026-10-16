import { describe, expect, it } from "vitest";
import { defaultParams } from "../../../src/core/params";
import { findGenerator } from "../../../src/generators";
import { querySnapshot, restoreSnapshot, snapshotQuery } from "../../../src/state/snapshot";

describe("display links", () => {
  it.each(["display-dog", "display-robot"])(
    "%s: links keep the display they were made with across a default change",
    (id) => {
      const restore = (query: string) => restoreSnapshot(querySnapshot(query)).values.display;
      // Before the 2.8" board, the default display was left out of links.
      expect(restore(`?g=${id}`)).toBe("waveshare-s3-touch-lcd-128");
      expect(restore(`?g=${id}&antenna=none&earStyle=round`)).toBe("waveshare-s3-touch-lcd-128");
      // Links now always name the display, so they survive the next default change too.
      const query = snapshotQuery({
        generator: id,
        values: defaultParams(findGenerator(id)!.params),
      });
      expect(query).toBe(`g=${id}&display=waveshare-s3-touch-lcd-28`);
      expect(restore(`?${query}`)).toBe("waveshare-s3-touch-lcd-28");
    },
  );
});
