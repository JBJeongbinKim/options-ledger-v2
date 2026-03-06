import { peekNext, readQueue, removeById, QueueUnavailableError } from "./_lib/queue.js";

function jsonReply(status, body, res) {
  if (res && typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(body);
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default async function handler(req, res) {
  try {
    const method = req?.method || "GET";

    if (method === "GET") {
      const item = await peekNext();
      const queue = await readQueue();
      return jsonReply(200, { item, count: queue.length }, res);
    }

    if (method === "DELETE") {
      const id = req?.query?.id?.toString().trim() || new URL(req.url, "https://placeholder.local").searchParams.get("id")?.trim() || "";
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
