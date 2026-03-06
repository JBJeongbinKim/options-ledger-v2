import { peekNext, readQueue, removeById, QueueUnavailableError } from "./_lib/queue";

export default async function handler(req: any, res: any): Promise<void> {
  try {
    if (req.method === "GET") {
      const item = await peekNext();
      const queue = await readQueue();
      res.status(200).json({ item, count: queue.length });
      return;
    }

    if (req.method === "DELETE") {
      const id = String(req.query?.id ?? "").trim();
      if (!id) {
        res.status(400).json({ error: "id query parameter is required" });
        return;
      }

      const removed = await removeById(id);
      res.status(200).json({ ok: true, removed });
      return;
    }

    res.status(405).json({ error: "Method Not Allowed" });
  } catch (error) {
    if (error instanceof QueueUnavailableError) {
      res.status(503).json({ error: error.message });
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown server error";
    res.status(500).json({ error: message });
  }
}
