// Says what is wrong with a database URL, in plain words, without ever printing it: run by the production migration
// workflow before anything connects, because Bun only answers "Invalid URL" for a secret it cannot read. Pure, so tested.

export type DbUrlProblem =
  | "empty"
  | "quoted"
  | "name_in_front"
  | "spaces"
  | "placeholder"
  | "not_postgres"
  | "password_needs_encoding"
  | "bad_percent"
  | "no_host"
  | "supabase_direct"
  | "unreadable";

/** Which kind of database the URL points at; enough to tell a moved database apart, without printing the address. */
export type DbHostKind = "supabase-pooler" | "supabase-direct" | "supabase" | "aws-rds" | "aws-other" | "local" | "other";

export type DbUrlCheck = { ok: true; kind: DbHostKind; port: string; ssl: boolean } | { ok: false; problem: DbUrlProblem };

export const PROBLEM_TEXT: Record<DbUrlProblem, string> = {
  empty: "The secret is empty.",
  quoted: 'The secret is wrapped in quotes. Paste the URL alone, without " or \' around it.',
  name_in_front: "The secret starts with a name (like DATABASE_URL=). Paste only the URL, starting with postgresql://.",
  spaces: "The secret has a space or a line break inside it. Paste the URL on one line, with nothing else.",
  placeholder: "The secret still holds a placeholder such as [YOUR-PASSWORD]. Put the real password there (without the brackets).",
  not_postgres: "The secret does not start with postgresql:// or postgres://.",
  password_needs_encoding:
    "The password holds a character that must be encoded in a URL: write # as %23, / as %2F, ? as %3F, @ as %40, [ as %5B and ] as %5D.",
  bad_percent: "The URL has a % that is not followed by two hex digits (a % in the password is written %25).",
  no_host: "The URL has no host after the @.",
  supabase_direct:
    "This is Supabase's Direct connection (db.<project>.supabase.co), which GitHub cannot reach (it is IPv6 only). In Supabase, open Connect and copy the Session pooler URI instead (host ...pooler.supabase.com, port 5432).",
  unreadable: "The URL cannot be read. Copy it again from the database provider's connection page.",
};

function hostKind(host: string): DbHostKind {
  const h = host.toLowerCase();
  if (h.endsWith(".pooler.supabase.com")) return "supabase-pooler";
  if (h.startsWith("db.") && h.endsWith(".supabase.co")) return "supabase-direct";
  if (h.endsWith(".supabase.co") || h.endsWith(".supabase.com")) return "supabase";
  if (h.endsWith(".rds.amazonaws.com")) return "aws-rds";
  if (h.endsWith(".amazonaws.com")) return "aws-other";
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]") return "local";
  return "other";
}

export function checkDbUrl(raw: string | undefined): DbUrlCheck {
  const v = (raw ?? "").trim();
  if (v === "") return { ok: false, problem: "empty" };
  if (/^["'`]/.test(v) || /["'`]$/.test(v)) return { ok: false, problem: "quoted" };
  if (/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(v)) return { ok: false, problem: "name_in_front" };
  if (/\s/.test(v)) return { ok: false, problem: "spaces" };
  if (/YOUR[-_ ]?PASSWORD/i.test(v)) return { ok: false, problem: "placeholder" };
  const scheme = /^(postgres|postgresql):\/\//i.exec(v);
  if (!scheme) return { ok: false, problem: "not_postgres" };

  // user:password@host... — the host starts after the LAST @, so an @ in the password lands in the password here.
  const rest = v.slice(scheme[0].length);
  const at = rest.lastIndexOf("@");
  if (at >= 0) {
    const auth = rest.slice(0, at);
    const colon = auth.indexOf(":");
    const password = colon >= 0 ? auth.slice(colon + 1) : "";
    if (/[#/?@]/.test(auth) || /[[\]]/.test(password)) return { ok: false, problem: "password_needs_encoding" };
  }
  if (/%(?![0-9A-Fa-f]{2})/.test(v)) return { ok: false, problem: "bad_percent" };

  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return { ok: false, problem: "unreadable" };
  }
  if (!url.hostname) return { ok: false, problem: "no_host" };
  if (hostKind(url.hostname) === "supabase-direct") return { ok: false, problem: "supabase_direct" };
  return { ok: true, kind: hostKind(url.hostname), port: url.port || "5432", ssl: /sslmode=(require|verify-ca|verify-full)/i.test(url.search) };
}

/** The migrations table is not there yet (a new, empty database): the only error that means "nothing applied". */
export const isMissingJournal = (e: unknown): boolean => {
  const err = e as { errno?: unknown; code?: unknown } | null;
  return ["42P01", "3F000"].includes(String(err?.errno ?? err?.code ?? ""));
};

/** A database error in plain words, from its code only (a message can hold an address; it is not printed). */
export function dbErrorText(e: unknown): string {
  const err = e as { errno?: unknown; code?: unknown } | null;
  const code = String(err?.code ?? "");
  // Bun's driver puts the SQL state in errno; postgres-js (the migrator) puts it in code.
  const state = String(err?.errno ?? (/^[0-9A-Z]{5}$/.test(code) ? code : ""));
  if (/TIMEOUT|REFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|CONNECTION_CLOSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH/i.test(code))
    return `Could not reach the database (${code}). Check that the host is the one the live site uses, that it is reachable from the internet (for Supabase: the Session pooler URI), and that the project is not paused.`;
  if (state === "28P01" || state === "28000" || /AUTH/i.test(code)) return `The database refused the user name or password (${state || code}).`;
  if (state === "3D000") return "The database name at the end of the URL does not exist on that server.";
  return `The database answered with an error (${[code, state].filter(Boolean).join(" ") || "no code"}).`;
}

// `bun apps/api/scripts/db-url-check.ts`: checks DATABASE_URL; prints only the verdict and the kind of host, never the URL.
if (import.meta.main) {
  const r = checkDbUrl(process.env.DATABASE_URL);
  if (!r.ok) {
    console.log(`::error::${PROBLEM_TEXT[r.problem]}`);
    process.exit(1);
  }
  console.log(`The URL can be read. It points at: ${r.kind} (port ${r.port}), ${r.ssl ? "with" : "WITHOUT"} sslmode=require.`);
  if (!r.ssl) console.log("::warning::The URL has no sslmode=require; a hosted database should be reached over SSL.");
}
