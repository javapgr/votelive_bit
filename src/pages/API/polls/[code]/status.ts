
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { isValidCode } from "../../../../lib/security";

export const prerender = false;

export const PATCH: APIRoute = async ({
  request,
  params
}) => {
  if (
    !env.ADMIN_KEY ||
    request.headers.get("x-admin-key") !== env.ADMIN_KEY
  ) {
    return Response.json(
      { error: "No autorizado" },
      { status: 401 }
    );
  }

  const code = params.code?.toUpperCase() ?? "";

  if (!isValidCode(code)) {
    return Response.json(
      { error: "Código inválido" },
      { status: 400 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "JSON inválido" },
      { status: 400 }
    );
  }

  const status =
    typeof body === "object" && body !== null &&
    "status" in body
      ? body.status
      : null;

  if (status !== "open" && status !== "closed") {
    return Response.json(
      { error: "Estado inválido" },
      { status: 400 }
    );
  }

  try {
    const result = await env.DB.prepare(`
      UPDATE polls
      SET status = ?,
          closed_at = CASE
            WHEN ? = 'closed' THEN CURRENT_TIMESTAMP
            ELSE NULL
          END
      WHERE code = ?
        AND (
          (status = 'draft' AND ? = 'open')
          OR
          (status = 'open' AND ? = 'closed')
        )
    `).bind(
      status,
      status,
      code,
      status,
      status
    ).run();

    if (result.meta.changes === 0) {
      return Response.json(
        {
          error:
            "Votación inexistente o transición no permitida"
        },
        { status: 409 }
      );
    }

    return Response.json({
      message: "Estado actualizado",
      status
    });
  } catch (error) {
    console.error("Error actualizando estado:", error);

    return Response.json(
      { error: "Error de base de datos" },
      { status: 500 }
    );
  }
};
