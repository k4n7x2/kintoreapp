// 最初は匿名の筋トレ記録APIを公開しない。
 // D1の疎通だけをGET /api/healthで確認する。
const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "method_not_allowed" }, 405);
      }
      if (!env.DB) {
        return jsonResponse({ ok: false, database: "not_configured" }, 503);
      }
      try {
        await env.DB.prepare("SELECT 1 AS connected").first();
        return jsonResponse({ ok: true, database: "connected" });
      } catch {
        // SQLの内部エラーや接続情報は公開レスポンスに含めない。
        return jsonResponse({ ok: false, database: "unavailable" }, 503);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return jsonResponse({ error: "not_found" }, 404);
    }

    // 通常はCloudflareがstatic assetsを直接配信する。
    return env.ASSETS
      ? env.ASSETS.fetch(request)
      : new Response("Not found", { status: 404 });
  }
};
