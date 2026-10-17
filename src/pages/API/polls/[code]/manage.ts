import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { hashCredential } from "../../../../lib/credentials";

export const POST: APIRoute = async ({ request, params }) => {
  if (!env.ADMIN_KEY || request.headers.get("x-admin-key") !== env.ADMIN_KEY) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const code = params.code?.toUpperCase() ?? "";
  if (!/^[A-F0-9]{12}$/.test(code)) return Response.json({ error: "Código inválido" }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("action" in body) ||
    (body.action !== "participants" && body.action !== "open" && body.action !== "closed")
  ) {
    return Response.json({ error: "Acción inválida" }, { status: 400 });
  }
  try {
    const poll = await env.DB.prepare("SELECT id, status FROM polls WHERE code = ?").bind(code).first<{id: string; status: string}>();
    if (!poll) return Response.json({ error: "Votación no encontrada" }, { status: 404 });
    if (body.action === "participants") {
      const count = "count" in body && typeof body.count === "number"
        ? body.count
        : undefined;
      if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 100) {
        return Response.json({ error: "Solicita entre 1 y 100 credenciales" }, { status: 400 });
      }
      const credentials = Array.from({ length: count }, () => crypto.randomUUID().replaceAll("-", ""));
      const statements = await Promise.all(credentials.map(async (credential) =>
        env.DB.prepare(`INSERT INTO participants (id, poll_id, credential_hash)
          SELECT ?, id, ? FROM polls WHERE id = ? AND status = 'draft'`)
          .bind(crypto.randomUUID(), await hashCredential(poll.id, credential), poll.id)
      ));
      const results = await env.DB.batch(statements);
      if (results.some((r) => r.meta.changes !== 1)) {
        return Response.json({ error: "Solo se autorizan participantes en borrador" }, { status: 409 });
      }
      return Response.json({ credentials }, { headers: { "Cache-Control": "no-store" } });
    }
    const action = body.action;
    const previous = action === "open" ? "draft" : "open";
    const result = await env.DB.prepare(`UPDATE polls SET status = ?,
      closed_at = CASE WHEN ? = 'closed' THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE id = ? AND status = ? AND EXISTS (SELECT 1 FROM participants WHERE poll_id = polls.id)`)
      .bind(action, action, poll.id, previous).run();
    if (!result.meta.changes) return Response.json({ error: "Transición no permitida. Autoriza participantes antes de abrir; solo puedes cerrar una votación abierta." }, { status: 409 });
    return Response.json({ message: action === "open" ? "Votación abierta" : "Votación cerrada" });
  } catch (error) {
    console.error("Error administrando votación:", error);
    return Response.json({ error: "No se pudo administrar la votación" }, { status: 500 });
  }
};
