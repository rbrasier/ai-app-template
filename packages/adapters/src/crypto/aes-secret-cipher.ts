import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { domainError, err, ok, type ISecretCipher, type Result } from "@rbrasier/domain";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

/**
 * AES-256-GCM secret encryption. The stored value is base64 of
 * `iv | authTag | ciphertext`; GCM's auth tag makes tampering or wrong-key
 * decryption fail loudly (surfaced as an error, never a throw across the port).
 */
export class AesSecretCipher implements ISecretCipher {
  private constructor(private readonly key: Buffer) {}

  static fromBase64Key(base64Key: string): AesSecretCipher {
    const key = Buffer.from(base64Key, "base64");
    if (key.length !== 32) {
      throw new Error("APP_SETTINGS_ENCRYPTION_KEY must decode to exactly 32 bytes.");
    }
    return new AesSecretCipher(key);
  }

  encrypt(plaintext: string): Result<string> {
    try {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_BYTES });
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return ok(Buffer.concat([iv, authTag, ciphertext]).toString("base64"));
    } catch (cause) {
      return err(domainError("INFRA_FAILURE", "Failed to encrypt secret.", cause));
    }
  }

  decrypt(ciphertext: string): Result<string> {
    try {
      const bytes = Buffer.from(ciphertext, "base64");
      if (bytes.length <= IV_BYTES + AUTH_TAG_BYTES) {
        return err(domainError("VALIDATION_FAILED", "Ciphertext is too short to be valid."));
      }
      const iv = bytes.subarray(0, IV_BYTES);
      const authTag = bytes.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
      const payload = bytes.subarray(IV_BYTES + AUTH_TAG_BYTES);
      // Pin the expected GCM tag length so a truncated tag cannot be accepted.
      const decipher = createDecipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_BYTES });
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([decipher.update(payload), decipher.final()]);
      return ok(plaintext.toString("utf8"));
    } catch (cause) {
      return err(domainError("VALIDATION_FAILED", "Failed to decrypt secret.", cause));
    }
  }
}
