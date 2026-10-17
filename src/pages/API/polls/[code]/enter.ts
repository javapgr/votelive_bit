import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  createPresenceToken,
  presenceCookieName,
  presenceMaxAge,
  verifyQr
} from "../../../../lib/qr";
import { isValidCode } from "../../../../lib/security";

export const prerender = false;

interface EnterBody {
  slot?: unknown;
  sig?: unknown;
}

export const POST: APIRoute = async ({ request, params }) => {
  if (!env.QR_SECRET) {
    console.error("QR_SECRET no está configurado");
    return Response.json({ error: "El acceso QR no está configurado" }, { status: 500 });
  }

  const code = params.code?.toUpperCase() ?? "";
  if (!isValidCode(code)) {
    return Response.json({ error: "Código inválido" }, { status: 400 });
  }

  let body: EnterBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    !Number.isInteger(body.slot) ||
    typeof body.sig !== "string" ||
    body.sig.length > 200
  ) {
    return Response.json({ error: "Datos del QR inválidos" }, { status: 400 });
  }

  try {
    const valid = await verifyQr(env.QR_SECRET, code, body.slot as number, body.sig);
    if (!valid) return Response.json({ error: "QR vencido o inválido" }, { status: 403 });

    const poll = await env.DB.prepare(
      "SELECT status FROM polls WHERE code = ?"
    ).bind(code).first<{ status: string }>();
    if (!poll) return Response.json({ error: "Votación no encontrada" }, { status: 404 });
    if (poll.status !== "open") {
      return Response.json({ error: "La votación no está abierta" }, { status: 403 });
    }

    const { token } = await createPresenceToken(env.QR_SECRET, code);
    const secure = new URL(request.url).protocol === "https:";
    const cookie = [
      `${presenceCookieName(code)}=${token}`,
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${presenceMaxAge()}`,
      `Path=/api/polls/${code}/votes`,
      secure ? "Secure" : ""
    ].filter(Boolean).join("; ");

    return Response.json(
      { message: "Acceso presencial autorizado", expiresIn: presenceMaxAge() },
      { headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Error canjeando QR:", error);
    return Response.json({ error: "No se pudo validar el acceso" }, { status: 500 });
  }
};
