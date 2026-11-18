import { getStore } from "@netlify/blobs";

const STORE_NAME = "english-reading-library";
const KEY = "articles";

export default async (request) => {
  const store = getStore(STORE_NAME);

  if (request.method === "GET") {
    try {
      const saved = await store.get(KEY, { type: "json" });
      const articles = Array.isArray(saved) ? saved : [];
      return json({ ok: true, articles, count: articles.length });
    } catch (error) {
      console.error("Netlify Blobs GET error:", error);
      return json({
        ok: false,
        error: `Không đọc được Netlify Blobs: ${error?.message || "Unknown error"}`
      }, 500);
    }
  }

  if (request.method === "POST") {
    try {
      const expected = process.env.ADMIN_PASSWORD;
      if (!expected) {
        return json({ error: "Netlify chưa có biến môi trường ADMIN_PASSWORD." }, 500);
      }

      const supplied = request.headers.get("x-admin-password") || "";
      if (supplied !== expected) {
        return json({ error: "Mật khẩu quản trị không đúng (HTTP 401)." }, 401);
      }

      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ error: "Nội dung gửi lên không phải JSON hợp lệ." }, 400);
      }

      const article = payload?.article;
      if (!article || !String(article.title || "").trim() || !String(article.body || "").trim()) {
        return json({ error: "Bài viết cần có tiêu đề và nội dung." }, 400);
      }

      const existing = await store.get(KEY, { type: "json" });
      const current = Array.isArray(existing) ? existing : [];

      const safeArticle = {
        id: String(article.id || crypto.randomUUID()),
        title: String(article.title).trim().slice(0, 180),
        body: String(article.body).trim().slice(0, 50000),
        category: String(article.category || "Stories").slice(0, 40),
        level: String(article.level || "A2–B1").slice(0, 20),
        summary: String(article.summary || "").trim().slice(0, 300),
        date: String(article.date || new Date().toISOString().slice(0, 10))
      };

      const updated = [
        safeArticle,
        ...current.filter(item => item && item.id !== safeArticle.id)
      ];

      await store.setJSON(KEY, updated);

      // Read the data back before telling the browser that the save succeeded.
      const check = await store.get(KEY, { type: "json" });
      const confirmed = Array.isArray(check) ? check : [];
      const savedArticle = confirmed.find(item => item.id === safeArticle.id);

      if (!savedArticle) {
        throw new Error("Đã ghi dữ liệu nhưng không tìm thấy bài khi đọc kiểm tra lại.");
      }

      return json({
        ok: true,
        message: "Article saved and verified.",
        article: savedArticle,
        articles: confirmed,
        count: confirmed.length
      });
    } catch (error) {
      console.error("Netlify Blobs POST error:", error);
      return json({
        error: `Không thể lưu/đọc xác nhận bài viết: ${error?.message || "Unknown error"}`
      }, 500);
    }
  }

  return json({ error: "Method not allowed." }, 405, { Allow: "GET, POST" });
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
      ...extraHeaders
    }
  });
}
