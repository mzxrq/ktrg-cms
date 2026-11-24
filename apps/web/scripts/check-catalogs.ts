// Fails when the English catalog has a message with no English text: such a message shows Japanese on the English site
// without anyone noticing. Runs `lingui extract --clean` first, so a string added in code but never extracted is found too.
// Also fails when extract changed the committed catalogs (hand edits, leftovers, merge order): they drifted 107 messages once.
// Before that it lists the translations lost since the last commit: rewording a Japanese text makes extract drop the old
// message with its English and Thai, so each is shown with the new message to give it to (docs/text-rewrite-guide.md).
//   bun run check:catalogs                        (lost since the last commit)
//   bun run check:catalogs --against origin/main  (lost on this whole branch)
//   bun run check:catalogs --restore              (a Japanese text put back as it was gets its old translation back)

import { readFileSync } from "node:fs";
import { catalogLocales } from "../src/i18n/locales";
import { writeFileSync } from "node:fs";
import { fillEmpty, lostTranslations, translationsOf } from "./resolve-catalogs-lib";

/** The msgids that have an empty msgstr (the file's own header, whose msgid is empty, is not one of them). */
export function missingTranslations(po: string): string[] {
  const missing: string[] = [];
  for (const block of po.split(/\n\s*\n/)) {
    const id = /^msgid ((?:".*"\s*\n?)+)/m.exec(block)?.[1];
    const str = /^msgstr ((?:".*"\s*\n?)+)/m.exec(block)?.[1];
    if (id === undefined || str === undefined) continue;
    const text = (quoted: string) => [...quoted.matchAll(/"(.*)"/g)].map((m) => m[1]).join("");
    if (text(id) !== "" && text(str) === "") missing.push(text(id));
  }
  return missing;
}

/**
 * A catalog as extract would compare it: line endings and the `#:` source lines left out, so moving code around never
 * counts as a change, but a hand-written entry, a stale message or a merge that reordered the file does.
 */
export function catalogText(po: string): string {
  return po
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !line.startsWith("#:"))
    .join("\n");
}

if (import.meta.main) {
  const files = catalogLocales.map((locale) => `${import.meta.dir}/../src/locales/${locale}.po`);
  const ref = process.argv.includes("--against") ? process.argv[process.argv.indexOf("--against") + 1] : "HEAD";
  const committed = files.map((f) => catalogText(readFileSync(f, "utf8")));
  const run = Bun.spawnSync(["bunx", "lingui", "extract", "--clean"], { cwd: import.meta.dir + "/..", stdout: "ignore", stderr: "inherit" });
  if (run.exitCode !== 0) process.exit(run.exitCode ?? 1);
  for (const locale of catalogLocales.filter((l) => l !== "ja")) {
    const old = Bun.spawnSync(["git", "show", `${ref}:./src/locales/${locale}.po`], { cwd: import.meta.dir + "/..", stdout: "pipe", stderr: "ignore" });
    if (old.exitCode !== 0) continue; // a catalog that did not exist at that point lost nothing
    const file = `${import.meta.dir}/../src/locales/${locale}.po`;
    if (process.argv.includes("--restore")) {
      const { text, filled } = fillEmpty(readFileSync(file, "utf8"), translationsOf(old.stdout.toString()));
      writeFileSync(file, text);
      if (filled > 0) console.log(`${locale}.po: ${filled} translation(s) put back from ${ref}.`);
      committed[files.indexOf(file)] = catalogText(text); // restoring is the change asked for, not a drift
    }
    const lost = lostTranslations(old.stdout.toString(), readFileSync(file, "utf8"));
    if (lost.length === 0) continue;
    console.warn(`\n${locale}.po: ${lost.length} translation(s) dropped since ${ref} (their Japanese changed). Copy what you still want into the new message:`);
    for (const l of lost) {
      console.warn(`\n  ${l.files.join(", ") || "(no file)"}\n    was:  ${l.was}\n    ${locale}:   ${l.translation}`);
      for (const c of l.candidates) console.warn(`    now?: ${c}`);
    }
  }
  const thai = missingTranslations(readFileSync(import.meta.dir + "/../src/locales/th.po", "utf8")).length;
  if (thai > 0) console.log(`th.po: ${thai} message(s) not written in Thai yet (they show the English; Thai is a preview language).`);
  const missing = missingTranslations(readFileSync(import.meta.dir + "/../src/locales/en.po", "utf8"));
  if (missing.length > 0) {
    console.error(`${missing.length} message(s) have no English text in src/locales/en.po:`);
    for (const id of missing) console.error(`  - ${id}`);
    process.exit(1);
  }
  const stale = files.filter((f, i) => catalogText(readFileSync(f, "utf8")) !== committed[i]);
  if (stale.length > 0) {
    console.error("The catalogs differ from what extract writes. Run `bun run --cwd apps/web lingui:extract` and commit:");
    for (const f of stale) console.error(`  - ${f.replace(/.*\/src\//, "src/")}`);
    process.exit(1);
  }
  console.log("English catalog is complete.");
}
