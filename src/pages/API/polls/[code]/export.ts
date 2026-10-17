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

interface OptionRow {
  name: string;
  position: number;
  votes: number;
}

function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^\s*[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
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

    if (!poll) return Response.json({ error: "Votación no encontrada" }, { status: 404 });
    if (poll.status !== "closed") {
      return Response.json({ error: "Solo se pueden exportar votaciones cerradas" }, { status: 409 });
    }

    const { results } = await env.DB.prepare(`
      SELECT o.name, o.position, COUNT(v.id) AS votes
      FROM options o
      LEFT JOIN votes v
        ON v.option_id = o.id AND v.poll_id = o.poll_id
      WHERE o.poll_id = ?
      GROUP BY o.id, o.name, o.position
      ORDER BY o.position ASC
    `).bind(poll.id).all<OptionRow>();

    const totalVotes = results.reduce((total, option) => total + Number(option.votes), 0);
    const highestVotes = Math.max(0, ...results.map((option) => Number(option.votes)));
    const leaders = highestVotes > 0
      ? results.filter((option) => Number(option.votes) === highestVotes).map((option) => option.name)
      : [];
    const summary = leaders.length === 1
      ? `Ganador: ${leaders[0]}`
      : leaders.length > 1
        ? `Empate: ${leaders.join(", ")}`
        : "Sin votos";

    const rows = [
      ["VotaLive - resultados de elección"],
      ["Código", poll.code],
      ["Pregunta", poll.question],
      ["Fecha de creación", poll.created_at],
      ["Fecha de cierre", poll.closed_at ?? ""],
      ["Resultado", summary],
      [],
      ["Opción", "Votos", "Porcentaje", "Total de votos"],
      ...results.map((option) => {
        const votes = Number(option.votes);
        const percentage = totalVotes === 0 ? 0 : Number(((votes * 100) / totalVotes).toFixed(2));
        return [option.name, votes, `${percentage} %`, totalVotes];
      })
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="votalive-${poll.code}-resultados.csv"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("Error exportando resultados:", error);
    return Response.json({ error: "No se pudieron exportar los resultados" }, { status: 500 });
  }
};
