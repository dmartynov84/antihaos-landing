// HMAC-підпис і перевірка — той самий примітив для (а) верифікації
// webhook-підпису провайдера і (б) видачі короткострокових signed
// download-токенів. Timing-safe порівняння скрізь, де звіряємо підпис.
"use strict";

const crypto = require("crypto");

function hmacHex(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function timingSafeEqualHex(a, b) {
  const bufA = Buffer.from(String(a), "utf8");
  const bufB = Buffer.from(String(b), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifySignature(secret, rawBody, signatureHex) {
  if (!secret || !signatureHex) return false;
  const expected = hmacHex(secret, rawBody);
  return timingSafeEqualHex(expected, signatureHex);
}

// Signed download-токен: base64url(payload).hexHmac(payload). payload
// містить orderId, packageId, файл і expiry (unix seconds) — усе, що
// потрібно перевірити без додаткового звернення до Blobs (хоча download.js
// однаково звіряє orderId зі станом замовлення, щоб refund міг відкликати
// доступ навіть у межах строку дії токена).
function issueDownloadToken(secret, payload, ttlSeconds) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = JSON.stringify({ ...payload, exp });
  const encoded = Buffer.from(body, "utf8").toString("base64url");
  const sig = hmacHex(secret, encoded);
  return `${encoded}.${sig}`;
}

function verifyDownloadToken(secret, token) {
  if (!token || typeof token !== "string" || token.indexOf(".") === -1) {
    return { valid: false, reason: "malformed" };
  }
  const [encoded, sig] = token.split(".");
  if (!timingSafeEqualHex(hmacHex(secret, encoded), sig)) {
    return { valid: false, reason: "bad_signature" };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch (e) {
    return { valid: false, reason: "bad_payload" };
  }
  if (!payload.exp || Math.floor(Date.now() / 1000) > payload.exp) {
    return { valid: false, reason: "expired" };
  }
  return { valid: true, payload };
}

module.exports = { hmacHex, verifySignature, issueDownloadToken, verifyDownloadToken };
