import type { Result } from "../result";

/**
 * Symmetric encryption for settings secrets (API keys). Encrypt is called when
 * an admin supplies a new key; decrypt only at the AI resolution boundary.
 * Decrypt returns an error rather than throwing when ciphertext is malformed or
 * fails authentication (tampered / wrong key).
 */
export interface ISecretCipher {
  encrypt(plaintext: string): Result<string>;
  decrypt(ciphertext: string): Result<string>;
}
