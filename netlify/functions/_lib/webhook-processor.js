// Спільна логіка обробки webhook-події — використовується і реальним
// webhook.js (куди в майбутньому вкаже провайдер), і simulate-pay.js
// (mock-режим). Це навмисно: mock-кнопка на сторінці не йде "коротким
// шляхом" повз перевірку підпису чи ідемпотентність — вона проганяє
// той самий код, який обробляв би справжню подію від провайдера.
"use strict";

const { verifySignature, issueDownloadToken } = require("./security");
const { getOrder, updateOrder, markEventOnce, appendAudit } = require("./store");
const { getProduct } = require("./products");
const { log } = require("./logger");

const DOWNLOAD_TTL_SECONDS = 60 * 60; // 1 година — sandbox-значення, не остаточне

// Чисті функції -- винесено з processWebhookEvent для unit-тестів
// (CHECKOUT_MODE=disabled на production, live-тест цього шляху
// недоступний цього циклу; node:test у CI -- єдина реальна перевірка).
function isAmountMatching(receivedAmountUah, orderAmountUah) {
  return Number(receivedAmountUah) === Number(orderAmountUah);
}

function isRefundAmountValid(refundAmountUah, capturedAmountUah) {
  if (refundAmountUah === undefined) return true; // provider не завжди шле суму на refund-подію
  return Number(refundAmountUah) <= Number(capturedAmountUah);
}

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
    if (!isAmountMatching(amountUah, order.amountUah)) {
      await appendAudit(orderId, "amount_mismatch", { eventId, expected: order.amountUah, received: amountUah });
      return { status: 409, body: { error: "amount_mismatch" } };
    }
    if (order.status === "paid") {
      await appendAudit(orderId, "webhook_already_paid", { eventId });
      return { status: 200, body: { ok: true, alreadyPaid: true } };
    }

    // payment-security invariant #7 (fail-loud): markEventOnce() вище вже
    // "спожив" цей eventId для dedup -- якщо щось нижче кине виняток,
    // provider-retry того самого eventId мовчки отримає {deduped:true} і
    // НІКОЛИ не завершить видачу. Тому: try/catch навколо всього шляху
    // ПІСЛЯ підтвердження оплати, critical-лог + окремий audit-запис для
    // ручного розбору (замінює "мовчазну втрату" на видиму, хоч і без
    // автоматичного retry -- те саме дерево, що ще не з'єднане з
    // Owner Operations retry/dead-letter, окремий Blobs-стор, див.
    // docs/automation/payment-security-checklist.md §7).
    try {
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
    } catch (err) {
      log({
        event: "payment_confirmed_delivery_failed", status: "critical",
        entityId: orderId, reasonCode: "delivery_exception_after_payment_confirmed",
        data: { eventId, amountUah, message: String(err && err.message) },
      });
      await appendAudit(orderId, "payment_confirmed_delivery_failed", { eventId, amountUah, message: String(err && err.message) });
      throw err; // 500 до provider -- НЕ приховувати як success, provider retry (якщо буде) хоча б спробує ще раз
    }
  }

  if (type === "refund_succeeded" || type === "payment_canceled") {
    // §16/§20 invariant: refund event на ще не оплачене замовлення —
    // безглуздо (нічого повертати) і потенційно ознака підробленого
    // виклику. Ідемпотентно, не помилка, якщо вже refunded (dedupe,
    // не 4xx на легітимний повторний webhook).
    if (order.status === "refunded") {
      await appendAudit(orderId, "webhook_already_refunded", { eventId });
      return { status: 200, body: { ok: true, alreadyRefunded: true } };
    }
    if (order.status !== "paid") {
      await appendAudit(orderId, "refund_unpaid_order", { eventId, orderStatus: order.status });
      return { status: 409, body: { error: "order_not_paid", status: order.status } };
    }
    // Сума refund, якщо provider її передає -- не може перевищувати gross
    // суму оригінального платежу (order.amountUah). Поле необов'язкове в
    // event-схемі (не всі provider-и шлють суму на refund-подію), тому
    // перевіряємо лише коли вона фактично присутня.
    const refundAmountUah = event.refundAmountUah;
    if (!isRefundAmountValid(refundAmountUah, order.amountUah)) {
      await appendAudit(orderId, "refund_amount_exceeds_payment", { eventId, refundAmountUah, capturedAmountUah: order.amountUah });
      return { status: 409, body: { error: "refund_amount_exceeds_payment" } };
    }

    await updateOrder(orderId, { status: "refunded", refundedAt: new Date().toISOString(), lastEventId: eventId, refundAmountUah: refundAmountUah !== undefined ? Number(refundAmountUah) : order.amountUah });
    await appendAudit(orderId, type, { eventId, refundAmountUah: refundAmountUah !== undefined ? Number(refundAmountUah) : order.amountUah });
    // Токени лишаються криптографічно валідними до закінчення TTL, але
    // download.js завжди звіряє ПОТОЧНИЙ статус замовлення в Blobs — тому
    // status:"refunded" ефективно відкликає доступ навіть у межах TTL.
    return { status: 200, body: { ok: true, revoked: true } };
  }

  await appendAudit(orderId, "webhook_unknown_type", { eventId, type });
  return { status: 400, body: { error: "unknown_event_type" } };
}

module.exports = { processWebhookEvent, DOWNLOAD_TTL_SECONDS, isAmountMatching, isRefundAmountValid };
