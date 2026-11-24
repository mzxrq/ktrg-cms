// Pure parts of resolve-catalogs.ts: reading the translations out of one .po file and writing them into another.
// A .po file is blocks separated by blank lines; a block is comment lines, then `msgid` and `msgstr`, each of which may
// continue on following quoted lines. The header block (empty msgid) is left alone.

const LF = (s: string) => s.replace(/\r\n/g, "\n");

type Entry = { key: string; msgstr: string[] };

/** The msgid (as written, quotes and continuation lines included) and the msgstr lines of a block; null for a block that is not a message. */
function entryOf(block: string): Entry | null {
  const lines = block.replace(/\n+$/, "").split("\n");
  const id = lines.findIndex((l) => l.startsWith("msgid "));
  const str = lines.findIndex((l) => l.startsWith("msgstr "));
  if (id < 0 || str < id) return null;
  const key = lines.slice(id, str).join("\n");
  if (key === 'msgid ""') return null; // the file's header
  return { key, msgstr: lines.slice(str) };
}

const EMPTY = ['msgstr ""'];
const isEmpty = (msgstr: string[]) => msgstr.length === 1 && msgstr[0] === EMPTY[0];

/** Every message that has a translation: msgid as written -> its msgstr lines. */
export function translationsOf(po: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const block of LF(po).split(/\n\s*\n/)) {
    const e = entryOf(block);
    if (e && !isEmpty(e.msgstr)) out.set(e.key, e.msgstr);
  }
  return out;
}

/**
 * The file with every empty msgstr that `known` has a translation for filled in. Returns the new text and how many were
 * filled. Messages with a translation already, and ones `known` does not have, are left as they are.
 */
export function fillEmpty(po: string, known: ReadonlyMap<string, string[]>): { text: string; filled: number } {
  let filled = 0;
  const blocks = LF(po)
    .split(/\n\s*\n/)
    .map((block) => {
      const e = entryOf(block);
      const have = e && isEmpty(e.msgstr) ? known.get(e.key) : undefined;
      if (!e || !have) return block;
      filled++;
      const lines = block.replace(/\n+$/, "").split("\n");
      return [...lines.slice(0, lines.findIndex((l) => l.startsWith("msgstr "))), ...have].join("\n");
    });
  const text = blocks.join("\n\n");
  return { text: text.endsWith("\n") ? text : `${text}\n`, filled };
}

/** True when the text still has merge conflict markers. */
export const hasConflictMarkers = (text: string) => /^(<{7}|={7}|>{7})( |$)/m.test(LF(text));

/**
 * A three-way merge of one catalog, for the git merge driver: the `theirs` file, plus the messages `ours` added (not in `base`,
 * not already in `theirs`), with every empty msgstr filled from a translation either side has. Never conflicts. Order and
 * `#:` places are not exact; the next `lingui extract` puts them right.
 */
export function mergeCatalogs(base: string, ours: string, theirs: string): string {
  const keyOf = (block: string) => entryOf(block)?.key ?? null;
  const keys = (po: string) => new Set(LF(po).split(/\n\s*\n/).flatMap((b) => keyOf(b) ?? []));
  const [inBase, inTheirs] = [keys(base), keys(theirs)];
  const added = LF(ours)
    .split(/\n\s*\n/)
    .filter((b) => {
      const k = keyOf(b);
      return k !== null && !inBase.has(k) && !inTheirs.has(k);
    })
    .map((b) => b.replace(/\n+$/, ""));
  const joined = [LF(theirs).replace(/\n+$/, ""), ...added].join("\n\n") + "\n";
  const known = new Map([...translationsOf(theirs), ...translationsOf(ours)]);
  return fillEmpty(joined, known).text;
}

/** The text of quoted .po lines (`msgid "a"` + `"b"` -> `ab`), escapes left as written. */
const textOf = (lines: string) => [...lines.matchAll(/"(.*)"/g)].map((m) => m[1]).join("");

/** Each message's source files (from its `#: src/x.tsx:12 src/y.tsx:3` lines), keyed like translationsOf. */
function filesOf(po: string): Map<string, { files: string[]; empty: boolean }> {
  const out = new Map<string, { files: string[]; empty: boolean }>();
  for (const block of LF(po).split(/\n\s*\n/)) {
    const e = entryOf(block);
    if (!e) continue;
    const files = block.split("\n").filter((l) => l.startsWith("#:")).flatMap((l) => l.slice(2).trim().split(/\s+/)).map((o) => o.replace(/:\d+$/, ""));
    out.set(e.key, { files: [...new Set(files)], empty: isEmpty(e.msgstr) });
  }
  return out;
}

export interface LostTranslation {
  /** The message as it was (Japanese) and its translation then. */
  was: string;
  translation: string;
  files: string[];
  /** Messages of the same files that have no translation now: most likely the rewritten one. */
  candidates: string[];
}

/**
 * Translations in `before` whose message is gone from `after` (its Japanese was reworded, so extract --clean dropped it),
 * each with the untranslated messages of the same source files, so the old translation can be copied to the new one.
 */
export function lostTranslations(before: string, after: string): LostTranslation[] {
  const now = filesOf(after);
  const then = filesOf(before);
  const lost: LostTranslation[] = [];
  for (const [key, msgstr] of translationsOf(before)) {
    if (now.has(key)) continue;
    const files = then.get(key)?.files ?? [];
    const candidates = [...now].filter(([, v]) => v.empty && v.files.some((f) => files.includes(f))).map(([k]) => textOf(k));
    lost.push({ was: textOf(key), translation: textOf(msgstr.join("\n")), files, candidates });
  }
  return lost;
}
