import { describe, expect, test } from "bun:test";
import { checkDbUrl, dbErrorText, isMissingJournal } from "./db-url-check";

describe("database errors", () => {
  test("only a missing migrations table means 'nothing applied yet'", () => {
    expect(isMissingJournal({ code: "ERR_POSTGRES_SERVER_ERROR", errno: "42P01" })).toBe(true); // Bun
    expect(isMissingJournal({ code: "3F000" })).toBe(true); // postgres-js: the drizzle schema is not there
    expect(isMissingJournal({ code: "ERR_POSTGRES_CONNECTION_TIMEOUT" })).toBe(false);
    expect(isMissingJournal({ code: "28P01" })).toBe(false);
  });

  test("each kind of failure is said in plain words, from both drivers", () => {
    expect(dbErrorText({ code: "ERR_POSTGRES_CONNECTION_TIMEOUT" })).toContain("Could not reach the database");
    expect(dbErrorText({ code: "CONNECT_TIMEOUT" })).toContain("Could not reach the database");
    expect(dbErrorText({ code: "ECONNREFUSED" })).toContain("Could not reach the database");
    expect(dbErrorText({ code: "ERR_POSTGRES_SERVER_ERROR", errno: "28P01" })).toContain("user name or password");
    expect(dbErrorText({ code: "28P01" })).toContain("user name or password");
    expect(dbErrorText({ code: "3D000" })).toContain("does not exist");
    expect(dbErrorText({ code: "42703" })).toContain("42703");
  });
});

const good = "postgresql://postgres.abc:secretpw@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require";

describe("checkDbUrl", () => {
  test("a good pooler URL reads, with its kind of host, port and SSL", () => {
    expect(checkDbUrl(good)).toEqual({ ok: true, kind: "supabase-pooler", port: "5432", ssl: true });
    expect(checkDbUrl(`${good}\n`)).toMatchObject({ ok: true }); // a trailing line break from pasting is fine
    expect(checkDbUrl("postgres://u:p@db1.abcdefg.ap-northeast-1.rds.amazonaws.com/app")).toEqual({ ok: true, kind: "aws-rds", port: "5432", ssl: false });
    expect(checkDbUrl("postgresql://u:p%23w@localhost:5544/x")).toMatchObject({ ok: true, kind: "local" });
  });

  test("each way a pasted secret goes wrong has its own answer", () => {
    expect(checkDbUrl(undefined)).toEqual({ ok: false, problem: "empty" });
    expect(checkDbUrl("  ")).toEqual({ ok: false, problem: "empty" });
    expect(checkDbUrl(`"${good}"`)).toEqual({ ok: false, problem: "quoted" });
    expect(checkDbUrl(`DATABASE_URL=${good}`)).toEqual({ ok: false, problem: "name_in_front" });
    expect(checkDbUrl("postgresql://u:pa ss@h/db")).toEqual({ ok: false, problem: "spaces" });
    expect(checkDbUrl("postgresql://postgres.abc:[YOUR-PASSWORD]@h.pooler.supabase.com:5432/postgres")).toEqual({ ok: false, problem: "placeholder" });
    expect(checkDbUrl("mysql://u:p@h/db")).toEqual({ ok: false, problem: "not_postgres" });
    expect(checkDbUrl("postgresql://u@h/db")).toMatchObject({ ok: true });
  });

  test("a password with a character a URL cannot hold is named, whichever it is", () => {
    for (const pw of ["se#cret", "se/cret", "se?cret", "se@cret", "[secret]"]) {
      expect(checkDbUrl(`postgresql://postgres.abc:${pw}@h.pooler.supabase.com:5432/postgres`)).toEqual({ ok: false, problem: "password_needs_encoding" });
    }
    expect(checkDbUrl("postgresql://u:50%off@h/db")).toEqual({ ok: false, problem: "bad_percent" });
  });

  test("Supabase's direct connection is named (GitHub cannot reach it); the pooler is fine", () => {
    expect(checkDbUrl("postgresql://postgres:pw@db.abcdefghijk.supabase.co:5432/postgres")).toEqual({ ok: false, problem: "supabase_direct" });
    expect(checkDbUrl(good)).toMatchObject({ ok: true, kind: "supabase-pooler" });
  });

  test("the answer never holds the URL or the password", () => {
    const r = checkDbUrl("postgresql://u:topsecret#1@h/db");
    expect(JSON.stringify(r)).not.toContain("topsecret");
  });
});
