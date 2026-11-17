import { sys } from "../db";
import { randomToken, sha256 } from "./password";

export type TokenKind = "verify_email" | "reset_password";
const TTL_MIN: Record<TokenKind, number> = { verify_email: 60 * 24, reset_password: 60 };

/** Issue a single-use token. Only its SHA-256 is stored. Previous unused tokens of the same kind are voided. */
export async function issueToken(userId: string, kind: TokenKind): Promise<string> {
  const raw = randomToken();
  await sys("update auth_tokens set used_at = now() where user_id = $1 and kind = $2 and used_at is null", [userId, kind]);
  await sys("insert into auth_tokens(user_id, kind, token_hash, expires_at) values ($1,$2,$3, now() + ($4 || ' minutes')::interval)", [
    userId,
    kind,
    sha256(raw),
    String(TTL_MIN[kind]),
  ]);
  return raw;
}

/** Atomically consume a token; returns the user id or null if invalid / expired / already used. */
export async function consumeToken(raw: string, kind: TokenKind): Promise<string | null> {
  const r = await sys<{ user_id: string }>(
    `update auth_tokens set used_at = now()
      where token_hash = $1 and kind = $2 and used_at is null and expires_at > now()
      returning user_id`,
    [sha256(raw), kind]
  );
  return r.rows[0]?.user_id ?? null;
}
