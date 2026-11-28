import type { SpotStatus } from "./content";

/**
 * The spot whose status decides this place's stamp, as the server decides (stamp-store `usesStampFrom`): a 遥拝 place
 * always uses its waypoint, any other place only while it is closed (閉鎖時のスタンプ地点); an info place never stamps.
 */
export function stampStatusSource(spot: {
  id: string;
  status: SpotStatus;
  detached?: boolean;
  stampFrom?: { id: string; status?: SpotStatus };
}): { spotId: string; status: SpotStatus } {
  const from = spot.stampFrom;
  if (from?.status && spot.status !== "info" && (spot.detached === true || spot.status === "closed")) {
    return { spotId: from.id, status: from.status };
  }
  return { spotId: spot.id, status: spot.status };
}
