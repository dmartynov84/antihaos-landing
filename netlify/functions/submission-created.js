// Нативний Netlify hook: викликається АВТОМАТИЧНО при кожному form
// submission на сайті (файл має називатись рівно "submission-created" —
// це не довільна назва). Не змінює й не замінює існуючий flow форм
// (index.html + js/form-submit.js вже працюють і перевірені раніше,
// LEAD-2) — лише додає mock CRM upsert + email-sink подію + структурований
// лог ПОВЕРХ того, що вже відбувається. Якщо ця функція впаде — сама
// форма вже успішно прийнята Netlify Forms до виклику цього hook,
// користувач НІКОЛИ не бачить наслідків збою тут.
"use strict";

const { newCorrelationId } = require("./_lib/ids");
const { log } = require("./_lib/logger");
const crm = require("./_lib/adapters/crm");
const email = require("./_lib/adapters/email");
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
    log({ event: "lead_submission_parse_error", correlationId, status: "failed", reasonCode: "invalid_json" });
    return { statusCode: 200, body: "" };
  }

  if (!payload || !KNOWN_FORMS.has(payload.form_name)) {
    log({ event: "lead_submission_unknown_form", correlationId, status: "skipped", data: { formName: payload && payload.form_name } });
    return { statusCode: 200, body: "" };
  }

  const data = payload.data || {};
  const emailAddr = data.email;

  if (!emailAddr || !String(emailAddr).includes("@")) {
    log({ event: "lead_submission_invalid_email", correlationId, status: "failed", reasonCode: "invalid_email", data: { formName: payload.form_name } });
    return { statusCode: 200, body: "" };
  }

  try {
    const { contact, wasNew } = await crm.upsertContact({
      email: emailAddr,
      name: data.name || null,
      source: payload.form_name,
      utm: {
        source: data.utm_source || null,
        medium: data.utm_medium || null,
        campaign: data.utm_campaign || null,
        content: data.utm_content || null,
        referrer: data.referrer || null,
      },
      interestedProduct: data.product_type || null,
      // Немає чекбокса маркетингової згоди на жодній формі зараз (O-15) —
      // явно фіксуємо "not_collected", НЕ "granted". Не вигадувати згоду.
      consentStatus: "not_collected",
      // stage навмисно не передається: upsertContact сам ставить "new"
      // для щойно створеного контакту й НЕ чіпає stage для існуючого.
    });

    if (wasNew) {
      await crm.updateLeadStage(emailAddr, "validated");
    }

    await email.sendTransactional("lead_magnet_checklist", emailAddr, {
      name: data.name || null,
      formName: payload.form_name,
      correlationId,
    });

    log({
      event: wasNew ? "lead_created" : "lead_duplicate_submission",
      correlationId,
      workflowId: "lead-intake",
      entityId: contact.id,
      status: "ok",
      data: { formName: payload.form_name, source: contact.source, email: emailAddr },
    });

    return { statusCode: 200, body: "" };
  } catch (err) {
    log({
      event: "lead_submission_error",
      correlationId,
      workflowId: "lead-intake",
      status: "failed",
      reasonCode: "unhandled_exception",
      data: { message: String(err && err.message) },
    });
    // Не кидаємо далі — Netlify вже прийняв форму, користувач не має
    // побачити наслідків внутрішнього збою автоматизації.
    // TEMP DIAGNOSTIC (буде прибрано наступним комітом): показати помилку
    // в тілі відповіді, щоб знайти причину без доступу до Netlify logs.
    return { statusCode: 200, body: JSON.stringify({ diagnosticError: String(err && err.stack || err) }) };
  }
});
