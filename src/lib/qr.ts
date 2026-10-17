const QR_WINDOW_SECONDS = 30;
const PRESENCE_SECONDS = 10 * 60;

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function fromBase64Url(value: string): ArrayBuffer | null {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  } catch {
    return null;
  }
}

async function hmac(
  secret: string,
  usage: KeyUsage[]
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage
  );
}

export function currentQrSlot(now = Date.now()): number {
  return Math.floor(now / (QR_WINDOW_SECONDS * 1000));
}

export async function signQr(
  secret: string,
  code: string,
  slot: number
): Promise<string> {
  const key = await hmac(secret, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`qr:${code}:${slot}`)
  );
  return toBase64Url(signature);
}

export async function verifyQr(
  secret: string,
  code: string,
  slot: number,
  signature: string,
  now = Date.now()
): Promise<boolean> {
  if (!Number.isInteger(slot) || slot < currentQrSlot(now) - 1 || slot > currentQrSlot(now)) {
    return false;
  }
  const bytes = fromBase64Url(signature);
  if (!bytes) return false;
  const key = await hmac(secret, ["verify"]);
  return crypto.subtle.verify(
    "HMAC",
    key,
    bytes,
    new TextEncoder().encode(`qr:${code}:${slot}`)
  );
}

export function presenceCookieName(code: string): string {
  return `votalive_presence_${code}`;
}

export async function createPresenceToken(
  secret: string,
  code: string,
  now = Date.now()
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Math.floor(now / 1000) + PRESENCE_SECONDS;
  const payload = `presence:${code}:${expiresAt}`;
  const key = await hmac(secret, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return { token: `${expiresAt}.${toBase64Url(signature)}`, expiresAt };
}

export async function verifyPresenceToken(
  secret: string,
  code: string,
  token: string,
  now = Date.now()
): Promise<boolean> {
  const [expiresAtText, signature] = token.split(".");
  const expiresAt = Number(expiresAtText);
  const bytes = fromBase64Url(signature ?? "");
  if (!Number.isInteger(expiresAt) || expiresAt < Math.floor(now / 1000) || !bytes) {
    return false;
  }
  const payload = `presence:${code}:${expiresAt}`;
  const key = await hmac(secret, ["verify"]);
  return crypto.subtle.verify(
    "HMAC",
    key,
    bytes,
    new TextEncoder().encode(payload)
  );
}

export function presenceMaxAge(): number {
  return PRESENCE_SECONDS;
}
