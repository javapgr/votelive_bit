import type { APIRoute } from "astro";

import { env } from "cloudflare:workers";



export const prerender = false;



interface CreatePollBody {

    question?: unknown;

    description?: unknown;

    options?: unknown;

}



export const POST: APIRoute = async ({ request }) => {

    // Protección provisional del panel docente

    const key = request.headers.get("x-admin-key");



    if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {

        return Response.json(

            { error: "No autorizado" },

            { status: 401 }

        );

    }



    let body: CreatePollBody;



    try {

        body = await request.json();

    } catch {

        return Response.json(

            { error: "JSON inválido" },

            { status: 400 }

        );

    }



    const question =

        typeof body.question === "string"

            ? body.question.trim()

            : "";



    const description =

        typeof body.description === "string"

            ? body.description.trim()

            : "";



    const options = body.options;



    if (

        question.length < 5 ||

        question.length > 200 ||

        description.length > 1000 ||

        !Array.isArray(options) ||

        options.length < 2 ||

        options.length > 20 ||

        !options.every(

            (o) =>

                typeof o === "string" &&

                o.trim().length > 0 &&

                o.trim().length <= 100

        )

    ) {

        return Response.json(

            { error: "Datos de votación inválidos" },

            { status: 400 }

        );

    }



    const names = options.map((o: string) => o.trim());



    if (

        new Set(names.map((n: string) => n.toLowerCase()))

            .size !== names.length

    ) {

        return Response.json(

            { error: "Hay candidatos repetidos" },

            { status: 400 }

        );

    }



    const pollId = crypto.randomUUID();



    // Código aleatorio para localizar la votación.

    // No es una credencial de acceso.

    const code = crypto.randomUUID()

        .replaceAll("-", "")

        .slice(0, 12)

        .toUpperCase();



    const statements = [

        env.DB.prepare(`

   INSERT INTO polls (

    id, code, question, description, status

   )

   VALUES (?, ?, ?, ?, 'draft')

  `).bind(pollId, code, question, description),



        ...names.map((name: string, index: number) =>

            env.DB.prepare(`

    INSERT INTO options (id, poll_id, name, position)

    VALUES (?, ?, ?, ?)

   `).bind(crypto.randomUUID(), pollId, name, index)

        )

    ];



    try {

        await env.DB.batch(statements);



        return Response.json(

            {

                message: "Votación creada",

                code,

                status: "draft"

            },

            { status: 201 }

        );

    } catch (error) {

        console.error("Error creando votación:", error);



        return Response.json(

            { error: "No se pudo guardar la votación" },

            { status: 500 }

        );

    }

};
