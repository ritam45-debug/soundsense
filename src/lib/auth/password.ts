import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { bcryptCost } from "../env";

export const hashPassword = (pw: string) => bcrypt.hash(pw, bcryptCost());
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

/** Dummy hash so login timing does not reveal whether an e-mail exists. */
export const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 4);

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** ≥10 chars, at least one letter and one digit. Length matters more than symbols (NIST 800-63B). */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (pw.length > 200) return "Password is too long.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Include at least one letter and one number.";
  return null;
}
