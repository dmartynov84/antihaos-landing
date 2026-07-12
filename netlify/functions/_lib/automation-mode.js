// Центральні feature-flags для контурів ПОЗА checkout (той має власний
// _lib/mode.js з попереднього циклу — навмисно НЕ чіпаємо його, уже
// перевірено на проді). Той самий принцип: безпечний дефолт у коді,
// не покладаємось на те, що хтось не забуде виставити env var.
"use strict";

function readMode(envName, allowed, fallback) {
  const raw = (process.env[envName] || fallback).trim().toLowerCase();
  return allowed.includes(raw) ? raw : fallback;
}

function getAutomationModes() {
  return {
    automation: readMode("AUTOMATION_MODE", ["disabled", "mock", "sandbox", "live"], "mock"),
    email: readMode("EMAIL_MODE", ["disabled", "sink", "sandbox", "live"], "sink"),
    crm: readMode("CRM_MODE", ["disabled", "mock", "sandbox", "live"], "mock"),
    delivery: readMode("DELIVERY_MODE", ["disabled", "test", "secure"], "test"),
    analytics: readMode("ANALYTICS_MODE", ["disabled", "debug", "live"], "debug"),
    legalLiveApproved: process.env.LEGAL_LIVE_APPROVED === "true",
  };
}

module.exports = { getAutomationModes };
