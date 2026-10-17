
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

interface PollRow {
  id: string;
  code: string;
  question: string;
  description: string | null;
  status: string;
}

interface OptionRow {
  id: string;
  name: string;
  position: number;
}

export const GET: APIRoute = async ({ params }) => {
  const code = params.code?.toUpperCase() ?? "";

  if (!/^[A-F0-9]{12}$/.test(code)) {
    return Response.json(
      { error: "Código inválido" },
      { status: 400 }
    );
  }

  try {
    const poll = await env.DB.prepare(`
      SELECT id, code, question, description, status
      FROM polls
      WHERE code = ?
    `).bind(code).first<PollRow>();

    if (!poll) {
      return Response.json(
        { error: "Votación no encontrada" },
        { status: 404 }
      );
    }

    const { results } = await env.DB.prepare(`
      SELECT id, name, position
      FROM options
      WHERE poll_id = ?
      ORDER BY position ASC
    `).bind(poll.id).all<OptionRow>();

    return Response.json(
      {
        code: poll.code,
        question: poll.question,
        description: poll.description,
        status: poll.status,
        options: results
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Error consultando votación:", error);

    return Response.json(
      { error: "Error al consultar la votación" },
      { status: 500 }
    );
  }
};
