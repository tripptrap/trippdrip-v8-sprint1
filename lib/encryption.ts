// Encryption utilities for sensitive data storage
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Get or generate encryption key from environment variable
 * In production, ENCRYPTION_KEY should be a 32-byte hex string (64 characters)
 */
function getEncryptionKey(): Buffer {
  // .trim() is load-bearing and was added deliberately (#85).
  //
  // The production value carries a trailing newline. Untrimmed it is 65 chars,
  // fails the hex test below, and falls through to the scrypt branch — so the
  // key in use was derived from "<64 hex chars>\n" via scrypt rather than being
  // the 32 raw bytes the hex was meant to supply. Self-consistent, so it worked,
  // but not the intended path, and it made the newline part of the key material:
  // adding this trim later would have silently invalidated every ciphertext.
  //
  // Safe to add now because nothing is encrypted — verified 2026-07-29 that both
  // encrypted columns are empty (porting_orders.account_pin and
  // user_preferences.email_api_key_encrypted, 0 rows each). With the trim here,
  // whether the stored value has a newline stops mattering at all.
  //
  // If ciphertext exists when you read this, do NOT remove or alter this line
  // without a decrypt/re-encrypt migration.
  const envKey = process.env.ENCRYPTION_KEY?.trim();

  if (!envKey) {
    throw new Error('ENCRYPTION_KEY environment variable is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }

  // If the key is hex-encoded (64 chars = 32 bytes)
  if (envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }

  // If it's a passphrase, derive a key using scrypt
  const salt = Buffer.from('hyvewyre_static_salt_v1'); // Static salt for consistent key derivation
  return scryptSync(envKey, salt, 32);
}

/**
 * Encrypt a string value
 * Returns: iv:authTag:encryptedData (all base64 encoded)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encryptedData
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt a string value
 * Expects format: iv:authTag:encryptedData (all base64 encoded)
 */
export function decrypt(encryptedValue: string): string {
  const key = getEncryptionKey();

  const parts = encryptedValue.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const encryptedData = parts[2];

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Check if a value appears to be encrypted (has the expected format)
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(':');
  if (parts.length !== 3) return false;

  // Check if parts look like base64
  try {
    Buffer.from(parts[0], 'base64');
    Buffer.from(parts[1], 'base64');
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely decrypt a value, returning the original if it's not encrypted
 * This allows for backward compatibility with unencrypted values
 */
export function safeDecrypt(value: string): string {
  if (!value) return value;

  if (isEncrypted(value)) {
    try {
      return decrypt(value);
    } catch (error) {
      console.error('Failed to decrypt value:', error);
      // Return original value if decryption fails (might be unencrypted)
      return value;
    }
  }

  // Value is not encrypted, return as-is
  return value;
}
