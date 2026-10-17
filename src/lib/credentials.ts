export async function hashCredential(pollId: string, credential: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(`${pollId}:${credential}`)
  );
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
