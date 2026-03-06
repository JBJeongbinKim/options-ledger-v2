import { peekNext, readQueue, removeById, QueueUnavailableError } from "./_lib/queue";

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method === "GET") {
      const item = await peekNext();
      const queue = await readQueue();
      return Response.json({ item, count: queue.length }, { status: 200 });
    }

    if (request.method === "DELETE") {
      const url = new URL(request.url);
      const id = String(url.searchParams.get("id") ?? "").trim();
      if (!id) {
        return Response.json({ error: "id query parameter is required" }, { status: 400 });
      }

      const removed = await removeById(id);
      return Response.json({ ok: true, removed }, { status: 200 });
    }

    return Response.json({ error: "Method Not Allowed" }, { status: 405 });
  } catch (error) {
    if (error instanceof QueueUnavailableError) {
      return Response.json({ error: error.message }, { status: 503 });
    }

    const message = error instanceof Error ? error.message : "Unknown server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
