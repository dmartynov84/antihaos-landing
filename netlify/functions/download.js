// GET /.netlify/functions/download?token=...
// Файл не лежить на публічному передбачуваному URL — доступ лише через
// підписаний, короткостроковий токен. Токен перевіряється на підпис/строк
// дії (stateless), АЛЕ додатково звіряється ПОТОЧНИЙ статус замовлення в
// Blobs — тому refund відкликає доступ навіть у межах TTL токена.
"use strict";

const fs = require("fs");
const path = require("path");
const { isOperational, getMode } = require("./_lib/mode");
const { verifyDownloadToken } = require("./_lib/security");
const { getOrder, appendAudit } = require("./_lib/store");

// Sandbox-заглушка. Реальні PRO/VIP-файли НЕ лежать у цьому репо і не
// задеплоєні на Netlify (окремий, ще не вирішений owner blocker: хостинг
// платних файлів) — цей endpoint доводить, що механізм токена працює,
// не імітує наявність реального продукту.
const PLACEHOLDER_PATH = path.join(__dirname, "..", "..", "assets", "sandbox", "SANDBOX-PLACEHOLDER.txt");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }
  if (!isOperational()) {
    return { statusCode: 503, body: JSON.stringify({ error: "checkout_disabled", mode: getMode() }) };
  }

  const token = (event.queryStringParameters || {}).token;
  const check = verifyDownloadToken(process.env.CHECKOUT_DOWNLOAD_SECRET, token);
  if (!check.valid) {
    return { statusCode: 401, body: JSON.stringify({ error: "invalid_token", reason: check.reason }) };
  }

  const { orderId, packageId, file } = check.payload;
  const order = await getOrder(orderId);
  if (!order) {
    return { statusCode: 404, body: JSON.stringify({ error: "order_not_found" }) };
  }
  if (order.status !== "paid") {
    await appendAudit(orderId, "download_denied", { reason: `order_status_${order.status}`, file });
    return { statusCode: 403, body: JSON.stringify({ error: "order_not_paid", status: order.status }) };
  }
  if (order.packageId !== packageId) {
    await appendAudit(orderId, "download_denied", { reason: "package_mismatch", file });
    return { statusCode: 403, body: JSON.stringify({ error: "package_mismatch" }) };
  }

  let content;
  try {
    content = fs.readFileSync(PLACEHOLDER_PATH, "utf8");
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "placeholder_asset_missing" }) };
  }

  await appendAudit(orderId, "download_served", { file, packageId });

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}.txt"`,
      "Cache-Control": "no-store",
    },
    body: content,
  };
};
