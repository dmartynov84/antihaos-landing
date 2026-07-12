// Спільна логіка обробки webhook-події — використовується і реальним
// webhook.js (куди в майбутньому вкаже провайдер), і simulate-pay.js
// (mock-режим). Це навмисно: mock-кнопка на сторінці не йде "коротким
// шляхом" повз перевірку підпису чи ідемпотентність — вона проганяє
// той самий код, який обробляв би справжню подію від провайдера.
"use strict";

const { verifySignature, issueDownloadToken } = require("./security");
const { getOrder, updateOrder, markEventOnce, appendAudit } = require("./store");
const { getProduct } = require("./products");

const DOWNLOAD_TTL_SECONDS = 60 * 60; // 1 година — sandbox-значення, не остаточне

async function processWebhookEvent({ rawBody, signatureHex, webhookSecret, downloadSecret }) {
  if (!webhookSecret) {
    return { status: 500, body: { error: "CHECKOUT_WEBHOOK_SECRET не налаштовано на Netlify" } };
  }
  if (!verifySignature(webhookSecret, rawBody, signatureHex)) {
    return { status: 401, body: { error: "invalid_signature" } };
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (e) {
    return { status: 400, body: { error: "invalid_json" } };
  }

  const { eventId, type, orderId, amountUah } = event;
  if (!eventId || !type || !orderId) {
    return { status: 400, body: { error: "missing_fields" } };
  }

  // Ідемпотентність: якщо цей eventId вже бачили — 200 без повторної обробки
  // (replay/duplicate webhook, дублювання видачі неможливе за конструкцією).
  const isFirstTime = await markEventOnce(eventId);
  if (!isFirstTime) {
    return { status: 200, body: { ok: true, deduped: true } };
  }

  const order = await getOrder(orderId);
  if (!order) {
    await appendAudit(orderId, "webhook_unknown_order", { eventId, type });
    return { status: 404, body: { error: "order_not_found" } };
  }

  if (type === "payment_succeeded") {
    // Сума звіряється з тим, що зафіксовано на замовленні при створенні —
    // сервер ніколи не довіряє сумі, яку каже клієнт чи навіть сам webhook,
    // без звірки з power власним записом.
    if (Number(amountUah) !== Number(order.amountUah)) {
      await appendAudit(orderId, "amount_mismatch", { eventId, expected: order.amountUah, received: amountUah });
      return { status: 409, body: { error: "amount_mismatch" } };
    }
    if (order.status === "paid") {
      await appendAudit(orderId, "webhook_already_paid", { eventId });
      return { status: 200, body: { ok: true, alreadyPaid: true } };
    }

    const product = getProduct(order.packageId);
    const downloadTokens = (product ? product.files : []).map((file) =>
      issueDownloadToken(downloadSecret, { orderId, packageId: order.packageId, file }, DOWNLOAD_TTL_SECONDS)
    );

    await updateOrder(orderId, { status: "paid", paidAt: new Date().toISOString(), lastEventId: eventId });
    await appendAudit(orderId, "payment_succeeded", { eventId, amountUah });
    await appendAudit(orderId, "delivery_issued", { eventId, fileCount: downloadTokens.length, ttlSeconds: DOWNLOAD_TTL_SECONDS });
    // Реальної email-автовидачі нема (owner blocker) — фіксуємо намір у аудиті,
    // не вдаємо, що лист відправлено.
    await appendAudit(orderId, "email_delivery_simulated", { eventId, note: "email-провайдер не підключено, це запис наміру для sandbox" });

    return { status: 200, body: { ok: true, downloadTokens } };
  }

  if (type === "refund_succeeded" || type === "payment_canceled") {
    await updateOrder(orderId, { status: "refunded", refundedAt: new Date().toISOString(), lastEventId: eventId });
    await appendAudit(orderId, type, { eventId });
    // Токени лишаються криптографічно валідними до закінчення TTL, але
    // download.js завжди звіряє ПОТОЧНИЙ статус замовлення в Blobs — тому
    // status:"refunded" ефективно відкликає доступ навіть у межах TTL.
    return { status: 200, body: { ok: true, revoked: true } };
  }

  await appendAudit(orderId, "webhook_unknown_type", { eventId, type });
  return { status: 400, body: { error: "unknown_event_type" } };
}

module.exports = { processWebhookEvent, DOWNLOAD_TTL_SECONDS };
