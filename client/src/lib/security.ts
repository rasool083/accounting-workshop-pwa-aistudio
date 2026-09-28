export type StoredCredential = {
  salt: string;
  hash: string;
  iterations: number;
};

export type LocalSecuritySettings = {
  password?: StoredCredential;
  pin?: StoredCredential;
};

const HASH_ALGORITHM = "SHA-256";
const KEY_LENGTH = 256;
const DEFAULT_ITERATIONS = 120_000;

function toBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function getCrypto() {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
    throw new Error("مرورگر فعلی از رمزنگاری امن Web Crypto پشتیبانی نمی‌کند");
  }
  return globalThis.crypto;
}

async function deriveHash(value: string, salt: Uint8Array, iterations: number) {
  const crypto = getCrypto();
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(value),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: HASH_ALGORITHM },
    material,
    KEY_LENGTH
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function createCredential(value: string): Promise<StoredCredential> {
  const iterations = DEFAULT_ITERATIONS;
  const salt = getCrypto().getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(value, salt, iterations);
  return { salt: toBase64(salt), hash: toBase64(hash), iterations };
}

export async function verifyCredential(
  value: string,
  credential: StoredCredential
) {
  try {
    if (!credential?.salt || !credential?.hash) return false;
    const salt = fromBase64(credential.salt);
    const expected = fromBase64(credential.hash);
    const actual = await deriveHash(
      value,
      salt,
      Number(credential.iterations) || DEFAULT_ITERATIONS
    );
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function hasLocalCredential(settings?: LocalSecuritySettings) {
  return Boolean(settings?.password?.hash || settings?.pin?.hash);
}

export function validatePassword(value: string) {
  if (value.length < 8) return "رمز عبور باید حداقل ۸ نویسه باشد";
  return "";
}

export function validatePin(value: string) {
  if (!/^\d{4,8}$/.test(value)) return "PIN باید فقط شامل ۴ تا ۸ رقم باشد";
  return "";
}
