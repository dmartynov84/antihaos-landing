// Нативний Netlify hook: викликається АВТОМАТИЧНО при кожному form
// submission (файл має називатись рівно "submission-created"). Нуль змін
// у існуючих формах/js/form-submit.js.
//
// Netlify's platform event handlers "run in the background; no response
// is delivered to a client" (підтверджено пошуком офіційної документації
// цього циклу) -- відповідний HTTP-код НЕ впливає на платформний retry
// форми, і взагалі немає client, який його чекає. Тому durable-запис
// (appendEvent) відбувається ПЕРШИМ, до будь-якої спроби downstream-
// обробки -- lead ніколи не губиться, навіть якщо CRM projection впаде.
"use strict";

const { newCorrelationId } = require("./_lib/ids");
const { log } = require("./_lib/logger");
const { normalizeEmail } = require("./_lib/adapters/crm");
const { appendEvent, sha256 } = require("./_lib/events");
const { createWorkflowStatus, markProcessing, markCompleted, markFailure } = require("./_lib/workflow-status");
const { processLeadEvent } = require("./_lib/lead-processor");
const { getAutomationModes } = require("./_lib/automation-mode");
const { withBlobs } = require("./_lib/with-blobs");

const KNOWN_FORMS = new Set(["lead-checklist", "lead-checklist-mobile"]);

exports.handler = withBlobs(async (event) => {
  const correlationId = newCorrelationId("lead");
  const modes = getAutomationModes();

  if (modes.automation === "disabled") {
    log({ event: "lead_submission_skipped", correlationId, status: "skipped", reasonCode: "automation_disabled" });
    return { statusCode: 200, body: "" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}").payload;
  } catch (e) {
    log({ event: "lead_submission_parse_error", correlationId, status: "failed", reasonCode: "invalid_input" });
    return { statusCode: 200, body: "" };
  }

  if (!payload || !KNOWN_FORMS.has(payload.form_name)) {
    log({ event: "lead_submission_unknown_form", correlationId, status: "skipped", data: { formName: payload && payload.form_name } });
    return { statusCode: 200, body: "" };
  }

  const data = payload.data || {};
  const rawEmail = data.email;
  if (!rawEmail || !String(rawEmail).includes("@")) {
    log({ event: "lead_submission_invalid_email", correlationId, status: "failed", reasonCode: "invalid_input", data: { formName: payload.form_name } });
    return { statusCode: 200, body: "" };
  }
  const email = normalizeEmail(rawEmail);

  // Детермінований ключ -- точний платформний retry ТІЄЇ САМОЇ Netlify
  // submission (якщо такий колись станеться) дедублюється на рівні
  // сховища, а не на нашій довірі до Netlify.
  const idempotencyKey = sha256(`${payload.form_name}|${email}|${payload.created_at || ""}`);
  const workflowId = `lead:${idempotencyKey}`;

  // КРОК 1 -- durable acceptance. Навмисно БЕЗ try/catch: якщо сам
  // durable-шар недоступний (Blobs повністю не відповідає), виняток
  // пролітає природно у Netlify function logs (видимо для власника) --
  // єдиний сценарій, де lead справді може не зберегтись. Це не впливає
  // на реального відвідувача форми (він уже отримав /thanks до виклику
  // цього hook), тому проковтувати цю помилку тут немає сенсу.
  const { event: leadEvent, wasNew } = await appendEvent({
    eventType: "lead_submitted",
    entityType: "contact",
    entityId: email,
    workflowId,
    correlationId,
    idempotencyKey,
    source: payload.form_name,
    payload: {
      name: data.name || null,
      source: payload.form_name,
      formName: payload.form_name,
      utm: {
        source: data.utm_source || null,
        medium: data.utm_medium || null,
        campaign: data.utm_campaign || null,
        content: data.utm_content || null,
        referrer: data.referrer || null,
      },
      interestedProduct: data.product_type || null,
    },
  });

  if (!wasNew) {
    log({ event: "lead_event_already_accepted", correlationId, workflowId, entityId: email, status: "ok", reasonCode: "duplicate_event" });
    return { statusCode: 200, body: "" };
  }

  log({ event: "lead_event_accepted", correlationId, workflowId, entityId: email, status: "accepted" });
  await createWorkflowStatus(workflowId, { entityType: "contact", entityId: email, eventType: "lead_submitted" });
  await markProcessing(workflowId);

  // КРОК 2 -- downstream projection/notification. Збій ТУТ більше не
  // означає втрату ліда -- подія вже durable з кроку 1. Статус
  // workflow переходить у retry_scheduled/dead_letter, не "completed".
  try {
    const { isNewContact } = await processLeadEvent(leadEvent);
    await markCompleted(workflowId);
    log({
      event: isNewContact ? "lead_projection_updated" : "lead_projection_duplicate",
      correlationId, workflowId, entityId: email, status: "completed",
    });
  } catch (err) {
    const reasonCode = classifyError(err);
    const result = await markFailure(workflowId, reasonCode);
    log({
      event: "lead_projection_failed",
      correlationId, workflowId, entityId: email,
      status: result ? result.status : "failed",
      reasonCode,
      data: { message: String(err && err.message) },
    });
  }

  // Netlify не читає цю відповідь як "client result" для platform event
  // handlers -- 200 тут стосується лише нашого власного HTTP-контракту
  // (curl-тестованість), не є твердженням "усе довершено успішно".
  return { statusCode: 200, body: "" };
});

function classifyError(err) {
  const message = String(err && err.message || "").toLowerCase();
  if (message.includes("blob") || message.includes("timeout")) return "blob_temporary_failure";
  return "storage_temporary_failure";
}
