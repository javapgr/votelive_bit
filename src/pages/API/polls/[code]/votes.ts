import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { hashCredential } from "../../../../lib/credentials";
import { presenceCookieName, verifyPresenceToken } from "../../../../lib/qr";

export const POST: APIRoute = async ({ request, params }) => {
  const code = params.code?.toUpperCase() ?? "";
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (
    !/^[A-F0-9]{12}$/.test(code) ||
    !body ||
    typeof body !== "object" ||
    !("optionId" in body) ||
    !("credential" in body) ||
    typeof body.optionId !== "string" ||
    body.optionId.length > 100 ||
    typeof body.credential !== "string" ||
    !/^[a-f0-9]{32}$/.test(body.credential)
  ) {
    return Response.json({ error: "Datos del voto inválidos" }, { status: 400 });
  }
  if (!env.QR_SECRET) {
    console.error("QR_SECRET no está configurado");
    return Response.json({ error: "El acceso QR no está configurado" }, { status: 500 });
  }
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = cookieHeader.split(";").map((item) => item.trim())
    .find((item) => item.startsWith(`${presenceCookieName(code)}=`));
  const presenceToken = cookie?.slice(presenceCookieName(code).length + 1);
  if (!presenceToken || !(await verifyPresenceToken(env.QR_SECRET, code, presenceToken))) {
    return Response.json({ error: "Acceso presencial requerido: escanea el QR vigente." }, { status: 403 });
  }
  try {
    const poll = await env.DB.prepare("SELECT id FROM polls WHERE code = ?").bind(code).first<{id: string}>();
    if (!poll) return Response.json({ error: "Votación no encontrada" }, { status: 404 });
    // La comprobación de estado y el voto se ejecutan en una sola operación.
    const result = await env.DB.prepare(`INSERT INTO votes (id, poll_id, option_id, participant_id)
      SELECT ?, p.id, o.id, a.id FROM polls p
      JOIN options o ON o.poll_id = p.id AND o.id = ?
      JOIN participants a ON a.poll_id = p.id AND a.credential_hash = ?
      WHERE p.id = ? AND p.status = 'open'
      ON CONFLICT (poll_id, participant_id) DO NOTHING`)
      .bind(crypto.randomUUID(), body.optionId, await hashCredential(poll.id, body.credential), poll.id).run();
    if (!result.meta.changes) return Response.json({ error: "No se pudo registrar: comprueba tu credencial, que la votación esté abierta y que no hayas votado antes." }, { status: 409 });
    return Response.json({ message: "Voto registrado correctamente" }, { status: 201 });
  } catch (error) {
    console.error("Error registrando voto:", error);
    return Response.json({ error: "No se pudo registrar el voto" }, { status: 500 });
  }
};
