// Kept out of PlaceOrderList.tsx so its test does not load the Lingui macro (CI has no babel-plugin-macros: "1 error").

/** `keys` with `from` taken out and put where `to` stood (before it when moving up, after it when moving down). */
export function movedKeys(keys: readonly string[], from: string, to: string): string[] {
  const at = keys.indexOf(to);
  if (from === to || at < 0 || !keys.includes(from)) return [...keys];
  const rest = keys.filter((k) => k !== from);
  rest.splice(at, 0, from);
  return rest;
}
