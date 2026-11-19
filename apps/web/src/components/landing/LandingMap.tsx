import Link from "next/link";
import { Trans, useLingui } from "@lingui/react/macro";
import { baseRasterLayer, englishMaxZoom, gsiTileListUrl } from "@/lib/map";
import { defaultMapSettings, type MapSettings } from "@/lib/map-settings";
import { rectangleRing } from "@/lib/map-screen";
import { pickText, type RouteSummary } from "@/lib/content";
import { labelSides } from "@/lib/label-sides";
import { buttonStyle } from "@/components/button";

// A picture of where all the courses lie: GSI tiles as the background (plain images, no script, so it stays light on a weak
// signal) with each course's area as an outlined box and its number standing on it. It runs from edge to edge of the page and
// is tilted with CSS, so it stays a picture: it cannot be moved or zoomed, which would only show the tiles' coarseness. The
// button opens the real map.

const PAD_X = 240;
const PAD_Y = 160;
const TILT_DEG = 50;
const TILE = 256;
/** About this many pixels across: it decides the zoom, and so how many tiles are fetched. */
const TARGET_W = 960;
// shortcut: the picture's width on a desktop is guessed (125% of a ~1200 px chapter), so the left/right choice is
// approximate on other widths; measure in the browser if labels still collide.
const SCREEN_W = 1500;
const CIRCLE_PX = 28;
const NAME_MAX_PX = 112; // max-w-[7em] at 16 px

// Web Mercator, in pixels of the whole world at zoom z (the same maths the tiles use).
const worldX = (lng: number, z: number) => ((lng + 180) / 360) * TILE * 2 ** z;
const worldY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * TILE * 2 ** z;
};

/** The map of every course, edge to edge, inside the home page's 歩く道 chapter (which carries the heading). */
export function LandingMap({ routes, look = defaultMapSettings }: { routes: RouteSummary[]; /** 管理 > 地図の見た目: the same base map and calming as the real map. */ look?: MapSettings }) {
  const { t, i18n } = useLingui();
  const boxes = routes.flatMap((r) => (r.area ? [{ order: r.order, name: pickText(i18n.locale, r.nameJa, r.nameEn), ring: rectangleRing(r.area) }] : []));
  if (boxes.length === 0) return null;

  const all = boxes.flatMap((b) => b.ring);
  const west = Math.min(...all.map((p) => p.lng));
  const east = Math.max(...all.map((p) => p.lng));
  const south = Math.min(...all.map((p) => p.lat));
  const north = Math.max(...all.map((p) => p.lat));
  const z = Math.min(14, Math.max(5, Math.floor(Math.log2(TARGET_W / Math.max(1e-6, worldX(east, 0) - worldX(west, 0))))));
  const x = (lng: number) => worldX(lng, z);
  const y = (lat: number) => worldY(lat, z);
  const [left, top] = [x(west) - PAD_X, y(north) - PAD_Y];
  const [W, H] = [Math.round(x(east) - x(west) + 2 * PAD_X), Math.round(y(south) - y(north) + 2 * PAD_Y)];
  const layer = i18n.locale === "en" && z <= englishMaxZoom && (look.base === "std" || look.base === "pale") ? "english" : baseRasterLayer(look.base);
  // The real map's raster-saturation / raster-contrast, as near as CSS gets (0 leaves the tiles as GSI draws them).
  const calm = look.saturation === 0 && look.contrast === 0 ? undefined : { filter: `saturate(${1 + look.saturation}) contrast(${1 + look.contrast})` };
  const tiles: { key: string; href: string; x: number; y: number }[] = [];
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + W) / TILE); tx++)
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + H) / TILE); ty++)
      tiles.push({ key: `${tx}/${ty}`, href: `https://cyberjapandata.gsi.go.jp/xyz/${layer}/${z}/${tx}/${ty}.png`, x: tx * TILE, y: ty * TILE });
  const count = boxes.length;
  const labels = boxes.map((b) => ({
    ...b,
    cx: b.ring.reduce((n, p) => n + x(p.lng), 0) / b.ring.length,
    cy: b.ring.reduce((n, p) => n + y(p.lat), 0) / b.ring.length,
  }));
  // Each name runs to the side where it covers the fewest other labels, judged on the tilted picture as a desktop shows it.
  const scale = SCREEN_W / W;
  const sides = labelSides(
    labels.map((b) => {
      const chars = b.name?.text.length ?? 0;
      const nameW = Math.min(NAME_MAX_PX, chars * (b.name?.lang === "en" ? 8.5 : 16));
      return { x: (b.cx - left) * scale, y: (b.cy - top) * scale * Math.cos((TILT_DEG * Math.PI) / 180), width: CIRCLE_PX + nameW + 14, height: CIRCLE_PX, circle: CIRCLE_PX };
    }),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-56 overflow-clip bg-paper [perspective:900px] @[42rem]:h-[28rem] desk:h-[70svh]">
        <div
          role="img"
          aria-label={t`全${count}区間のある場所を示した図`}
          className="absolute left-1/2 top-1/2 w-[150%] [transform-style:preserve-3d] @[42rem]:w-[125%]"
          style={{ aspectRatio: `${W} / ${H}`, transform: `translate(-50%, -50%) rotateX(${TILT_DEG}deg)` }}
        >
          {/* The tiles in their own svg: a CSS filter on an svg element itself works in every browser (Safari ignores it on a <g>). */}
          <svg viewBox={`${left} ${top} ${W} ${H}`} aria-hidden="true" className="absolute inset-0 size-full" style={calm}>
            {tiles.map((tile) => (
              <image key={tile.key} href={tile.href} x={tile.x} y={tile.y} width={TILE} height={TILE} />
            ))}
          </svg>
          <svg viewBox={`${left} ${top} ${W} ${H}`} aria-hidden="true" className="absolute inset-0 size-full">
            {boxes.map((b) => (
              <polygon
                key={b.order}
                points={b.ring.map((p) => `${x(p.lng).toFixed(1)},${y(p.lat).toFixed(1)}`).join(" ")}
                className="fill-brand/25 stroke-accent"
                strokeWidth="1.6"
              />
            ))}
          </svg>
          {/* Each label stands up from the tilted map, so it stays readable: the number circle on the course, its name to the
              side with room (names only where the picture is wide enough; on a phone they would cover the map). */}
          {labels.map((b, i) => (
            <span
              key={b.order}
              aria-hidden="true"
              className="absolute size-0 origin-bottom"
              style={{ left: `${((b.cx - left) / W) * 100}%`, top: `${((b.cy - top) / H) * 100}%`, transform: `rotateX(-${TILT_DEG}deg)` }}
            >
              <span
                className={`absolute bottom-0 flex items-center gap-1 whitespace-nowrap rounded-full @[42rem]:bg-paper/90 @[42rem]:shadow-[0_1px_4px_rgb(0_0_0/0.25)] ${
                  sides[i] === "left" ? "right-0 flex-row-reverse translate-x-3 @[42rem]:translate-x-3.5 @[42rem]:pl-2.5" : "left-0 -translate-x-3 @[42rem]:-translate-x-3.5 @[42rem]:pr-2.5"
                }`}
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-paper bg-accent text-xs font-bold text-paper @[42rem]:size-7 @[42rem]:text-sm">
                  {b.order}
                </span>
                {b.name && (
                  <span lang={b.name.lang} className="hidden max-w-[7em] truncate text-base font-bold text-ink @[42rem]:block">
                    {b.name.text}
                  </span>
                )}
              </span>
            </span>
          ))}
        </div>
        {/* The far edge melts into the page, and the sides and near edge meet it softly. */}
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1/3 bg-linear-to-b from-paper to-transparent" />
        <span aria-hidden="true" className="absolute inset-x-0 -bottom-px h-1/4 bg-linear-to-t from-paper to-transparent" />
        <a href={gsiTileListUrl} target="_blank" rel="noopener noreferrer" className="absolute bottom-1 right-2 rounded bg-paper/85 px-1 text-sm text-muted underline">
          <Trans>国土地理院（地理院タイル）</Trans>
        </a>
      </div>
      <div className="mx-auto w-full max-w-5xl px-5 @[42rem]:px-10">
        <Link href="/map" className={buttonStyle("secondary", "lg", "flex w-full @[34rem]:w-fit")}>
          <Trans>マップをひらく</Trans>
        </Link>
      </div>
    </div>
  );
}
