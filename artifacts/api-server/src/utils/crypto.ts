import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const ALGO = 'aes-256-gcm';
const ENC_PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const keyHex = env.SMTP_ENCRYPTION_KEY;
  if (!keyHex) throw new Error('SMTP_ENCRYPTION_KEY is not configured');
  const buf = Buffer.from(keyHex, 'hex');
  if (buf.length !== 32) throw new Error('SMTP_ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
  return buf;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a prefixed string in the format: enc:v1:<ivHex>:<authTagHex>:<ciphertextHex>
 */
export function encryptSmtpPassword(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return (
    ENC_PREFIX +
    [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':')
  );
}

/**
 * Decrypts a password encrypted by encryptSmtpPassword.
 * If the value does not carry the enc:v1: prefix it is assumed to be a legacy
 * plaintext value and returned as-is, allowing a seamless migration path where
 * old passwords continue to work until overwritten via PUT.
 */
export function decryptSmtpPassword(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) {
    return stored;
  }
  const key = getKey();
  const body = stored.slice(ENC_PREFIX.length);
  const parts = body.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted SMTP password format');
  const [ivHex, authTagHex, encHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encryptedBuf = Buffer.from(encHex, 'hex');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encryptedBuf).toString('utf8') + decipher.final('utf8');
}

/** Returns true if the value was encrypted by encryptSmtpPassword. */
export function isSmtpPasswordEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}
