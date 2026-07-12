// Спільна перевірка для ВСІХ internal-only endpoints (diagnostics,
// replay, dead-letter, тощо). Header, НЕ query string (query-string
// секрети осідають у browser history, проксі- і referrer-логах).
// Fail-closed: без ADMIN_TOKEN на Netlify — endpoint повністю недоступний,
// немає жодного дефолтного/backdoor значення.
"use strict";

const crypto = require("crypto");

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a || ""), "utf8");
  const bufB = Buffer.from(String(b || ""), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Повертає null, якщо доступ дозволено; інакше -- готовий Netlify response.
function requireAdmin(event) {
  const configured = process.env.ADMIN_TOKEN;
  if (!configured) {
    return { statusCode: 503, body: JSON.stringify({ error: "admin_token_not_configured" }) };
  }
  const provided = (event.headers && (event.headers["x-admin-token"] || event.headers["X-Admin-Token"])) || "";
  if (!timingSafeEqual(configured, provided)) {
    return { statusCode: 403, body: JSON.stringify({ error: "forbidden" }) };
  }
  return null;
}

module.exports = { requireAdmin };
