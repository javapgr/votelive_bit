
export function isValidCode(code: string): boolean {
  return /^[A-F0-9]{12}$/.test(code);
}

export async function hashCredential(
  credential: string
): Promise<string> {
  const data = new TextEncoder().encode(credential);

  const hash = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function newCredential(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
