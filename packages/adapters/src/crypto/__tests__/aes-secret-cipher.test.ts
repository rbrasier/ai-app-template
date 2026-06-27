import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { AesSecretCipher } from "../aes-secret-cipher";

const key = randomBytes(32).toString("base64");

describe("AesSecretCipher", () => {
  it("round-trips plaintext through encrypt and decrypt", () => {
    const cipher = AesSecretCipher.fromBase64Key(key);
    const encrypted = cipher.encrypt("sk-secret-value");
    expect(encrypted.error).toBeUndefined();
    const decrypted = cipher.decrypt(encrypted.data!);
    expect(decrypted.data).toBe("sk-secret-value");
  });

  it("produces ciphertext that differs from plaintext and varies per call", () => {
    const cipher = AesSecretCipher.fromBase64Key(key);
    const first = cipher.encrypt("same-input");
    const second = cipher.encrypt("same-input");
    expect(first.data).not.toBe("same-input");
    expect(first.data).not.toBe(second.data);
  });

  it("rejects tampered ciphertext (GCM auth failure)", () => {
    const cipher = AesSecretCipher.fromBase64Key(key);
    const encrypted = cipher.encrypt("sk-secret-value");
    const bytes = Buffer.from(encrypted.data!, "base64");
    bytes[bytes.length - 1] ^= 0x01;
    const result = cipher.decrypt(bytes.toString("base64"));
    expect(result.error).toBeDefined();
  });

  it("rejects ciphertext encrypted under a different key", () => {
    const encrypted = AesSecretCipher.fromBase64Key(key).encrypt("sk-secret-value");
    const otherKey = randomBytes(32).toString("base64");
    const result = AesSecretCipher.fromBase64Key(otherKey).decrypt(encrypted.data!);
    expect(result.error).toBeDefined();
  });

  it("throws when the key does not decode to 32 bytes", () => {
    expect(() => AesSecretCipher.fromBase64Key(randomBytes(16).toString("base64"))).toThrow();
  });
});
