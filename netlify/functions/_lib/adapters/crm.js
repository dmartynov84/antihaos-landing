// Mock CRM adapter. Provider-agnostic за конструкцією: жодна викликаюча
// функція не знає, що це Blobs, а не HubSpot/Pipedrive/інше — коли
// власник обере CRM (O-05), заміняється лише ЦЕЙ файл, інтерфейс
// (набір експортованих функцій) лишається той самий.
// Dedup — за normalized email (lowercase, trim), не за raw input.
"use strict";

const { getStore } = require("@netlify/blobs");

const LEAD_STATES = [
  "new", "validated", "duplicate", "subscribed", "unsubscribed",
  "qualified", "contacted", "converted", "invalid", "blocked",
];

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function contactsStore() {
  return getStore("crm-contacts");
}

async function findByEmail(email) {
  const store = contactsStore();
  return store.get(normalizeEmail(email), { type: "json" });
}

// Повертає { contact, wasNew }. Якщо контакт уже існує — мерджить нові
// поля (source/UTM/interestedProduct не перезаписуються порожніми
// значеннями), стан лишається як був, якщо явно не передано stage.
async function upsertContact(input) {
  const store = contactsStore();
  const key = normalizeEmail(input.email);
  if (!key || !key.includes("@")) {
    throw new Error("upsertContact: invalid email");
  }
  const existing = await store.get(key, { type: "json" });
  const now = new Date().toISOString();

  if (existing) {
    const merged = {
      ...existing,
      name: input.name || existing.name,
      source: existing.source, // джерело фіксуємо ЛИШЕ при першому створенні
      interestedProduct: input.interestedProduct || existing.interestedProduct,
      stage: input.stage || existing.stage,
      updatedAt: now,
      lastActivityAt: now,
    };
    await store.setJSON(key, merged);
    return { contact: merged, wasNew: false };
  }

  const created = {
    id: key,
    email: key,
    name: input.name || null,
    source: input.source || null,
    utm: input.utm || {},
    interestedProduct: input.interestedProduct || null,
    stage: input.stage || "new",
    consentStatus: input.consentStatus || "not_collected",
    tags: [],
    notes: [],
    tasks: [],
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
  };
  await store.setJSON(key, created);
  return { contact: created, wasNew: true };
}

async function updateLeadStage(email, stage) {
  if (!LEAD_STATES.includes(stage)) {
    throw new Error(`updateLeadStage: unknown stage "${stage}"`);
  }
  const store = contactsStore();
  const key = normalizeEmail(email);
  const existing = await store.get(key, { type: "json" });
  if (!existing) return null;
  const next = { ...existing, stage, updatedAt: new Date().toISOString() };
  await store.setJSON(key, next);
  return next;
}

async function addTag(email, tag) {
  const store = contactsStore();
  const key = normalizeEmail(email);
  const existing = await store.get(key, { type: "json" });
  if (!existing) return null;
  const tags = existing.tags.includes(tag) ? existing.tags : [...existing.tags, tag];
  const next = { ...existing, tags, updatedAt: new Date().toISOString() };
  await store.setJSON(key, next);
  return next;
}

async function addNote(email, note) {
  const store = contactsStore();
  const key = normalizeEmail(email);
  const existing = await store.get(key, { type: "json" });
  if (!existing) return null;
  const notes = [...existing.notes, { text: note, at: new Date().toISOString() }];
  const next = { ...existing, notes, updatedAt: new Date().toISOString() };
  await store.setJSON(key, next);
  return next;
}

async function createTask(email, task) {
  const store = contactsStore();
  const key = normalizeEmail(email);
  const existing = await store.get(key, { type: "json" });
  if (!existing) return null;
  const tasks = [...existing.tasks, { ...task, createdAt: new Date().toISOString(), done: false }];
  const next = { ...existing, tasks, updatedAt: new Date().toISOString() };
  await store.setJSON(key, next);
  return next;
}

async function recordConsent(email, consentStatus) {
  const store = contactsStore();
  const key = normalizeEmail(email);
  const existing = await store.get(key, { type: "json" });
  if (!existing) return null;
  const next = { ...existing, consentStatus, updatedAt: new Date().toISOString() };
  await store.setJSON(key, next);
  return next;
}

async function recordUnsubscribe(email) {
  return recordConsent(email, "unsubscribed").then(async (c) => {
    if (c) return updateLeadStage(email, "unsubscribed");
    return null;
  });
}

module.exports = {
  LEAD_STATES,
  normalizeEmail,
  findByEmail,
  upsertContact,
  updateLeadStage,
  addTag,
  addNote,
  createTask,
  recordConsent,
  recordUnsubscribe,
};
