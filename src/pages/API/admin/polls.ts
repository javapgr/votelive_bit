import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!env.ADMIN_KEY || request.headers.get("x-admin-key") !== env.ADMIN_KEY) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT
        p.code,
        p.question,
        p.status,
        p.created_at,
        p.closed_at,
        (SELECT COUNT(*) FROM votes v WHERE v.poll_id = p.id) AS total_votes,
        (SELECT COUNT(*) FROM participants pt WHERE pt.poll_id = p.id) AS authorized
      FROM polls p
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT 100
    `).all<{
      code: string;
      question: string;
      status: "draft" | "open" | "closed";
      created_at: string;
      closed_at: string | null;
      total_votes: number;
      authorized: number;
    }>();

    return Response.json({
      polls: results.map((poll) => {
        const totalVotes = Number(poll.total_votes);
        const authorized = Number(poll.authorized);
        return {
          code: poll.code,
          question: poll.question,
          status: poll.status,
          createdAt: poll.created_at,
          closedAt: poll.closed_at,
          totalVotes,
          authorized,
          pending: Math.max(authorized - totalVotes, 0),
          participation: authorized === 0
            ? 0
            : Number(((totalVotes * 100) / authorized).toFixed(2))
        };
      })
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Error consultando panel administrativo:", error);
    return Response.json({ error: "No se pudo cargar el panel" }, { status: 500 });
  }
};
