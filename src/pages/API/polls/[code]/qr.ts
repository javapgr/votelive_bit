import type { APIRoute } from "astro";
import QRCode from "qrcode";
import { env } from "cloudflare:workers";
import { currentQrSlot, signQr } from "../../../../lib/qr";
import { isValidCode } from "../../../../lib/security";

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  if (!env.ADMIN_KEY || request.headers.get("x-admin-key") !== env.ADMIN_KEY) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!env.QR_SECRET) {
    console.error("QR_SECRET no está configurado");
    return Response.json({ error: "El acceso QR no está configurado" }, { status: 500 });
  }

  const code = params.code?.toUpperCase() ?? "";
  if (!isValidCode(code)) {
    return Response.json({ error: "Código inválido" }, { status: 400 });
  }

  try {
    const poll = await env.DB.prepare(
      "SELECT status FROM polls WHERE code = ?"
    ).bind(code).first<{ status: string }>();
    if (!poll) return Response.json({ error: "Votación no encontrada" }, { status: 404 });
    if (poll.status !== "open") {
      return Response.json({ error: "La votación debe estar abierta" }, { status: 409 });
    }

    const slot = currentQrSlot();
    const signature = await signQr(env.QR_SECRET, code, slot);
    const origin = new URL(request.url).origin;
    const accessUrl = `${origin}/acceso?code=${code}&slot=${slot}&sig=${encodeURIComponent(signature)}`;
    const image = await QRCode.toDataURL(accessUrl, { margin: 2, width: 320 });

    return Response.json({
      code,
      slot,
      expiresAt: (slot + 1) * 30,
      url: accessUrl,
      image
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Error generando QR:", error);
    return Response.json({ error: "No se pudo generar el QR" }, { status: 500 });
  }
};
