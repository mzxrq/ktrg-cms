import { decodeDem, DEM_TILE_URL } from "./admin/dem";

// GSI's elevation tiles (標高タイル, PNG) as MapLibre terrain. MapLibre reads "terrarium" tiles; GSI's own encoding marks the
// sea and missing data with 2^23, which a direct reading would raise into an 83 km spike. So each tile is fetched and its
// pixels re-written as terrarium (no data = sea level) before MapLibre gets it, through the `gsidem://` protocol.

/** GSI RGBA pixels -> terrarium RGBA pixels, in place: height + 32768 = R*256 + G + B/256. */
export function gsiToTerrarium(px: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 0; i < px.length; i += 4) {
    const v = (decodeDem(px[i]!, px[i + 1]!, px[i + 2]!) ?? 0) + 32768;
    px[i] = Math.floor(v / 256);
    px[i + 1] = Math.floor(v) % 256;
    px[i + 2] = Math.floor((v - Math.floor(v)) * 256);
    px[i + 3] = 255;
  }
  return px;
}

export const GSI_DEM_SOURCE = {
  type: "raster-dem" as const,
  tiles: ["gsidem://{z}/{x}/{y}"],
  tileSize: 256,
  // GSI's dem_png goes to 14; MapLibre stretches it beyond.
  maxzoom: 14,
  encoding: "terrarium" as const,
};

let registered = false;

/** Teaches MapLibre the `gsidem://z/x/y` address once per page. A tile GSI does not have (open sea) comes back flat. */
export function registerGsiDem(ml: typeof import("maplibre-gl")): void {
  if (registered) return;
  registered = true;
  ml.addProtocol("gsidem", async (params, abort) => {
    const [z, x, y] = params.url.replace("gsidem://", "").split("/").map(Number) as [number, number, number];
    const canvas = new OffscreenCanvas(256, 256);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const res = await fetch(DEM_TILE_URL(z, x, y), { signal: abort.signal });
    if (res.ok) ctx.drawImage(await createImageBitmap(await res.blob()), 0, 0);
    else if (res.status !== 404) throw new Error(`dem ${res.status}`);
    else ctx.fillStyle = "rgb(128,0,0)"; // 2^23: no data, made sea level below
    if (!res.ok) ctx.fillRect(0, 0, 256, 256);
    const image = ctx.getImageData(0, 0, 256, 256);
    gsiToTerrarium(image.data);
    ctx.putImageData(image, 0, 0);
    return { data: await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer() };
  });
}
