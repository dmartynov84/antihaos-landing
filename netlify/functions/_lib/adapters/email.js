// Email adapter. EMAIL_MODE=sink (default): жоден лист не йде реально —
// подія записується як "would send" у Blobs, щоб можна було перевірити
// зміст/тригер без ризику надіслати щось реальному клієнту. Коли
// власник обере провайдера (O-06), заміняється internals sendX-функцій,
// інтерфейс лишається той самий.
"use strict";

const { getStore } = require("@netlify/blobs");
const { getAutomationModes } = require("../automation-mode");

function sinkStore() {
  return getStore("email-sink");
}

async function recordSinkEvent(kind, payload) {
  const store = sinkStore();
  const key = `${payload.to || "unknown"}:${Date.now()}:${kind}`;
  const record = { kind, ...payload, at: new Date().toISOString() };
  await store.setJSON(key, record);
  return record;
}

async function sendTransactional(template, to, data) {
  const { email: mode } = getAutomationModes();
  if (mode === "disabled") return { sent: false, mode };
  if (mode === "live") {
    // Немає підключеного провайдера (O-06) — навіть якщо хтось виставить
    // EMAIL_MODE=live передчасно, fail closed, не вдавати відправку.
    throw new Error("EMAIL_MODE=live requires a configured provider (O-06) — none wired yet");
  }
  const record = await recordSinkEvent("transactional", { template, to, data });
  return { sent: false, simulated: true, mode, record };
}

async function sendMarketing(template, to, data) {
  const { email: mode } = getAutomationModes();
  if (mode === "disabled" || mode !== "sink") {
    return { sent: false, mode, blocked: true, reason: "marketing_requires_explicit_sink_review" };
  }
  const record = await recordSinkEvent("marketing", { template, to, data });
  return { sent: false, simulated: true, mode, record };
}

async function sendTemplate(template, to, data) {
  return sendTransactional(template, to, data);
}

async function sendOwnerAlert(reason, data) {
  const { email: mode } = getAutomationModes();
  const record = await recordSinkEvent("owner_alert", { reason, data, to: "owner" });
  return { sent: false, simulated: true, mode, record };
}

async function getDeliveryStatus() {
  return { status: "unknown", reason: "no_provider_configured" };
}

module.exports = { sendTransactional, sendMarketing, sendTemplate, sendOwnerAlert, getDeliveryStatus };
