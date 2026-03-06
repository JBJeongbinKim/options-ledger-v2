import { peekNext, readQueue, removeById, QueueUnavailableError } from "./_lib/queue";

function isNodeResponse(res: unknown): res is { status: (code: number) => { json: (body: unknown) => unknown } } {
  return Boolean(
    res &&
      typeof (res as { status?: unknown }).status === "function" &&
      typeof (res as { json?: unknown }).json === "function",
  );
}

function jsonReply(status: number, body: unknown, res?: unknown): unknown {
  if (isNodeResponse(res)) {
    return res.status(status).json(body);
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function readMethod(req: unknown): string {
  const method = (req as { method?: unknown })?.method;
  return typeof method === "string" ? method : "GET";
}

function readQueryId(req: unknown): string {
  const queryId = (req as { query?: { id?: unknown } })?.query?.id;
  if (typeof queryId === "string" && queryId.trim()) return queryId.trim();

  const requestUrl = (req as { url?: unknown })?.url;
  if (typeof requestUrl === "string") {
    return new URL(requestUrl, "https://placeholder.local").searchParams.get("id")?.trim() ?? "";
  }

  return "";
}

export default async function handler(req: unknown, res?: unknown): Promise<unknown> {
  try {
    const method = readMethod(req);

    if (method === "GET") {
      const item = await peekNext();
      const queue = await readQueue();
      return jsonReply(200, { item, count: queue.length }, res);
    }

    if (method === "DELETE") {
      const id = readQueryId(req);
      if (!id) {
        return jsonReply(400, { error: "id query parameter is required" }, res);
      }

      const removed = await removeById(id);
      return jsonReply(200, { ok: true, removed }, res);
    }

    return jsonReply(405, { error: "Method Not Allowed" }, res);
  } catch (error) {
    if (error instanceof QueueUnavailableError) {
      return jsonReply(503, { error: error.message }, res);
    }

    const message = error instanceof Error ? error.message : "Unknown server error";
    return jsonReply(500, { error: message }, res);
  }
}
