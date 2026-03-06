function json(status, body, res) {
  if (res && typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(body);
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default async function handler(req, res) {
  return json(200, {
    ok: true,
    now: new Date().toISOString(),
    method: req?.method ?? "unknown",
    runtime: "api-health",
  }, res);
}
