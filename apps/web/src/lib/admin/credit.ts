// A photo's credit is stored as one text (lib/rich-text.ts): plain words, or "[words](https://link)" for a linked credit.
// The admin shows it as two boxes, the words and the link (2026-11-16, user: typing [text](link) by hand was no fun).

const LINKED = /^\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/;

/** The stored credit as its words and link; a credit in any other form is all words. */
export function splitCredit(stored: string): { text: string; link: string } {
  const m = LINKED.exec(stored.trim());
  return m ? { text: m[1]!, link: m[2]! } : { text: stored, link: "" };
}

/** The words and link back as one stored credit. Square brackets in the words would end the link early, so they become full-width. */
export function joinCredit(text: string, link: string): string {
  const words = text.replace(/\[/g, "［").replace(/\]/g, "］");
  const url = link.trim();
  if (!url) return words;
  return `[${words.trim() || url}](${url})`;
}
