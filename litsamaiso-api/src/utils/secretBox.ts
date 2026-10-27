import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import AppError from "./errors.js";

// Encrypts small secrets (authenticator keys) at rest with AES-256-GCM.
// Stored as "v1:<iv>:<tag>:<ciphertext>" (base64url), so the key can be rotated under a new version later.
const VERSION = "v1";
const IV_BYTES = 12;

export const TOTP_ENCRYPTION_KEY_ENV = "TOTP_ENCRYPTION_KEY";

const readKey = (): Buffer | null => {
  const raw = process.env[TOTP_ENCRYPTION_KEY_ENV]?.trim();
  if (!raw) return null;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
};

// Checked at startup so a missing key is reported once, before a student hits it
export const isSecretBoxConfigured = (): boolean => readKey() !== null;

const getKey = (): Buffer => {
  const key = readKey();
  if (!key) {
    console.error(`${TOTP_ENCRYPTION_KEY_ENV} must be set to 32 bytes (base64 or hex)`);
    throw new AppError("Authenticator apps are not available right now. Please try again later.", 500, "TOTP_UNAVAILABLE");
  }
  return key;
};

export const encryptSecret = (plaintext: string): string => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(":");
};

// Throws if the value was tampered with or encrypted under a different key
export const decryptSecret = (sealed: string): string => {
  const [version, iv, tag, ciphertext] = sealed.split(":");
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error("Unsupported encrypted secret format");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
};
