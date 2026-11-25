import { describe, expect, test } from "bun:test";
import { movedKeys } from "./moved-keys";

describe("movedKeys", () => {
  test("a place dragged down lands after the row it was dropped on, one dragged up lands before it", () => {
    expect(movedKeys(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(movedKeys(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
  });
  test("dropped on itself or on something unknown, nothing moves", () => {
    expect(movedKeys(["a", "b"], "a", "a")).toEqual(["a", "b"]);
    expect(movedKeys(["a", "b"], "x", "a")).toEqual(["a", "b"]);
  });
});
