import { expect, test } from "bun:test";
import { gsiToTerrarium } from "./gsi-dem";

const terrarium = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768;

test("GSI heights become terrarium heights, and no-data (the sea) becomes sea level, not a spike", () => {
  // 1125.37 m (Kongō-zan is about 1125 m) = 112537 = 0x01_B7_99; no data = 2^23 = (128, 0, 0); -5 m = 2^24 - 500.
  const px = new Uint8ClampedArray([0x01, 0xb7, 0x99, 255, 128, 0, 0, 255, 0xff, 0xfe, 0x0c, 255]);
  gsiToTerrarium(px);
  expect(terrarium(px[0]!, px[1]!, px[2]!)).toBeCloseTo(1125.37, 1);
  expect(terrarium(px[4]!, px[5]!, px[6]!)).toBe(0);
  expect(terrarium(px[8]!, px[9]!, px[10]!)).toBeCloseTo(-5, 1);
});
