export class ApiResponseError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiResponseError";
  }
}

function statusMessage(status: number) {
  if (status === 401) return "La clave docente no es válida o ha caducado.";
  if (status === 403) return "No tienes permiso para realizar esta operación.";
  if (status === 404) return "La votación o la ruta solicitada no existe.";
  if (status === 409) return "La operación no se puede realizar en el estado actual.";
  if (status >= 500) return "El servidor tuvo un problema. Inténtalo nuevamente.";
  return "La solicitud no pudo completarse.";
}

export async function readApiResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ApiResponseError(
      response.ok ? "El servidor devolvió una respuesta no válida." : statusMessage(response.status),
      response.status
    );
  }

  let data: T;
  try {
    data = JSON.parse(body) as T;
  } catch {
    throw new ApiResponseError("El servidor devolvió un JSON no válido.", response.status);
  }

  return data;
}

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiResponseError || error instanceof Error) {
    if (error.name === "TypeError") return "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo nuevamente.";
    return error.message;
  }
  return "Error desconocido.";
}
