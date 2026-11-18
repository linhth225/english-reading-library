import { getStore } from "@netlify/blobs";

const STORE_NAME = "english-reading-library";

export default async (request) => {
  const store = getStore(STORE_NAME);

  if (request.method === "GET") {
    try {
      const saved = await store.get("articles", { type: "json" });
      return json({ articles: Array.isArray(saved) ? saved : [] });
    } catch (error) {
      return json({ articles: [] });
    }
  }

  if (request.method === "POST") {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) return json({ error: "Chưa cấu hình ADMIN_PASSWORD trong Netlify." }, 500);
    const supplied = request.headers.get("x-admin-password") || "";
    if (supplied !== expected) return json({ error: "Mật khẩu quản trị không đúng." }, 401);

    let payload;
    try { payload = await request.json(); }
    catch { return json({ error: "Dữ liệu gửi lên không hợp lệ." }, 400); }

    const article = payload?.article;
    if (!article?.title || !article?.body) {
      return json({ error: "Bài viết cần có tiêu đề và nội dung." }, 400);
    }

    const current = await store.get("articles", { type: "json" }) || [];
    const safeArticle = {
      id: String(article.id || crypto.randomUUID()),
      title: String(article.title).slice(0, 180),
      body: String(article.body).slice(0, 50000),
      category: String(article.category || "Stories").slice(0, 40),
      level: String(article.level || "A2–B1").slice(0, 20),
      summary: String(article.summary || "").slice(0, 300),
      date: String(article.date || new Date().toISOString().slice(0, 10))
    };
    const updated = [safeArticle, ...current.filter(item => item.id !== safeArticle.id)];
    await store.setJSON("articles", updated);
    return json({ ok: true, articles: updated });
  }

  return json({ error: "Method not allowed" }, 405, { Allow: "GET, POST" });
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders }
  });
}
