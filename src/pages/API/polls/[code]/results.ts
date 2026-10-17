import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { isValidCode } from "../../../../lib/security";

export const prerender = false;

interface PollRow {
  id: string;
  code: string;
  question: string;
  status: "draft" | "open" | "closed";
  created_at: string;
  closed_at: string | null;
}

interface ResultRow {
  id: string;
  name: string;
  position: number;
  votes: number;
}

export const GET: APIRoute = async ({ request, params }) => {
  if (!env.ADMIN_KEY || request.headers.get("x-admin-key") !== env.ADMIN_KEY) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const code = params.code?.toUpperCase() ?? "";
  if (!isValidCode(code)) {
    return Response.json({ error: "Código inválido" }, { status: 400 });
  }

  try {
    const poll = await env.DB.prepare(`
      SELECT id, code, question, status, created_at, closed_at
      FROM polls
      WHERE code = ?
    `).bind(code).first<PollRow>();

    if (!poll) {
      return Response.json({ error: "Votación no encontrada" }, { status: 404 });
    }

    const [{ results }, participation] = await Promise.all([
      env.DB.prepare(`
        SELECT o.id, o.name, o.position, COUNT(v.id) AS votes
        FROM options o
        LEFT JOIN votes v
          ON v.option_id = o.id AND v.poll_id = o.poll_id
        WHERE o.poll_id = ?
        GROUP BY o.id, o.name, o.position
        ORDER BY o.position ASC
      `).bind(poll.id).all<ResultRow>(),
      env.DB.prepare(`
        SELECT
          (SELECT COUNT(*) FROM participants WHERE poll_id = ?) AS authorized,
          (SELECT COUNT(*) FROM votes WHERE poll_id = ?) AS total_votes
      `).bind(poll.id, poll.id).first<{ authorized: number; total_votes: number }>()
    ]);

    const totalVotes = Number(participation?.total_votes ?? 0);
    const authorized = Number(participation?.authorized ?? 0);
    const options = results.map((option) => ({
      id: option.id,
      name: option.name,
      position: option.position,
      votes: Number(option.votes),
      percentage: totalVotes === 0
        ? 0
        : Number(((Number(option.votes) * 100) / totalVotes).toFixed(2))
    }));
    const highestVotes = Math.max(0, ...options.map((option) => option.votes));
    const leaders = highestVotes > 0
      ? options.filter((option) => option.votes === highestVotes)
      : [];

    return Response.json({
      code: poll.code,
      question: poll.question,
      status: poll.status,
      createdAt: poll.created_at,
      closedAt: poll.closed_at,
      participation: {
        authorized,
        totalVotes,
        pending: Math.max(authorized - totalVotes, 0),
        percentage: authorized === 0
          ? 0
          : Number(((totalVotes * 100) / authorized).toFixed(2))
      },
      options,
      winner: leaders.length === 1
        ? { type: "winner", options: leaders.map((option) => option.name), votes: highestVotes }
        : leaders.length > 1
          ? { type: "tie", options: leaders.map((option) => option.name), votes: highestVotes }
          : null
    }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("Error consultando resultados:", error);
    return Response.json({ error: "No se pudieron consultar los resultados" }, { status: 500 });
  }
};
