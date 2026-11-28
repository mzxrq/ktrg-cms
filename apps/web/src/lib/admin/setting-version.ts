/**
 * A site setting's save address with the version the editor read (`?updatedAt=`, empty when it was never saved), so the
 * API refuses with 409 conflict when someone saved in between. Unknown version (the page could not read it): no check.
 */
export const withVersion = (url: string, version: string | null | undefined) =>
  version === undefined ? url : `${url}?updatedAt=${encodeURIComponent(version ?? "")}`;

/** The version a save answered with, for the next save; undefined when the answer has none. */
export const versionFrom = (json: unknown): string | null | undefined => {
  const v = (json as { updatedAt?: unknown } | null)?.updatedAt;
  return typeof v === "string" || v === null ? v : undefined;
};
