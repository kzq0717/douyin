import type { LicensePayload } from './types';

function fnv1aHex(input: string, secret: string): string {
  let hash = 0x811c9dc5;
  const combined = `${secret}::${input}::${secret.length}`;
  for (let i = 0; i < combined.length; i += 1) {
    hash ^= combined.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const part1 = (hash >>> 0).toString(16).padStart(8, '0');
  let hash2 = 0x9e3779b9;
  for (let i = combined.length - 1; i >= 0; i -= 1) {
    hash2 ^= combined.charCodeAt(i);
    hash2 = Math.imul(hash2, 0x85ebca6b);
  }
  const part2 = (hash2 >>> 0).toString(16).padStart(8, '0');
  return `${part1}${part2}`;
}

function toBase64Utf8(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf8').toString('base64');
  }
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64Utf8(b64: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString('utf8');
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function signLicense(payload: LicensePayload, secret: string): string {
  const json = JSON.stringify(payload);
  const encoded = toBase64Utf8(json);
  const sig = fnv1aHex(encoded, secret);
  return `${encoded}.${sig}`;
}

export interface LicenseCheckResult {
  valid: boolean;
  status: 'active' | 'grace_readonly' | 'expired' | 'invalid_signature' | 'machine_mismatch';
  matchedHardwareCount: number;
  daysRemaining: number;
  payload?: LicensePayload;
}

export function verifyLicense(
  licenseKey: string,
  localMachineHashes: [string, string, string],
  secret: string,
  nowDateStr: string,
): LicenseCheckResult {
  const parts = licenseKey.trim().split('.');
  if (parts.length !== 2) {
    return { valid: false, status: 'invalid_signature', matchedHardwareCount: 0, daysRemaining: 0 };
  }
  const [encoded, sig] = parts;
  const expectedSig = fnv1aHex(encoded, secret);
  if (sig !== expectedSig) {
    return { valid: false, status: 'invalid_signature', matchedHardwareCount: 0, daysRemaining: 0 };
  }

  let payload: LicensePayload;
  try {
    payload = JSON.parse(fromBase64Utf8(encoded)) as LicensePayload;
  } catch {
    return { valid: false, status: 'invalid_signature', matchedHardwareCount: 0, daysRemaining: 0 };
  }

  let matchedHardwareCount = 0;
  for (let i = 0; i < 3; i += 1) {
    if (payload.machineHashes[i] && payload.machineHashes[i] === localMachineHashes[i]) {
      matchedHardwareCount += 1;
    }
  }
  if (matchedHardwareCount < 2) {
    return {
      valid: false,
      status: 'machine_mismatch',
      matchedHardwareCount,
      daysRemaining: 0,
      payload,
    };
  }

  const expireMs = new Date(`${payload.expireDate}T23:59:59Z`).getTime();
  const nowMs = new Date(`${nowDateStr}T00:00:00Z`).getTime();
  const daysRemaining = Math.floor((expireMs - nowMs) / (24 * 60 * 60 * 1000));

  if (daysRemaining >= 0) {
    return { valid: true, status: 'active', matchedHardwareCount, daysRemaining, payload };
  }
  if (daysRemaining >= -7) {
    return { valid: true, status: 'grace_readonly', matchedHardwareCount, daysRemaining, payload };
  }
  return { valid: false, status: 'expired', matchedHardwareCount, daysRemaining, payload };
}
