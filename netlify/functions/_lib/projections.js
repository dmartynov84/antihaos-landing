// CRM contact -- ПОХІДНА projection з automation-events, не джерело
// істини. projectContact() чиста функція (можна перерахувати з нуля
// будь-коли -- "rebuild from events" з §14/25.2). Кеш-запис у Blobs
// прискорює lookup, але його втрата/гонка нічого не губить: наступний
// rebuildContactProjection() відновлює точний стан з історії events.
"use strict";

const { getStore } = require("@netlify/blobs");
const { listEvents } = require("./events");

function contactProjectionStore() {
  return getStore("projection-contacts");
}

function projectContact(events) {
  let contact = null;
  for (const e of events) {
    if (e.event_type === "contact_created") {
      contact = {
        id: e.entity_id,
        email: e.entity_id,
        name: e.payload.name || null,
        source: e.payload.source || null,
        utm: e.payload.utm || {},
        interestedProduct: e.payload.interestedProduct || null,
        stage: "new",
        consentStatus: e.payload.consentStatus || "not_collected",
        marketingConsentStatus: e.payload.marketingConsentStatus || "not_collected",
        createdAt: e.timestamp,
        updatedAt: e.timestamp,
        lastEventId: e.event_id,
      };
    } else if (!contact) {
      continue; // подія раніше за contact_created -- пропускаємо (не мало б статись)
    } else if (e.event_type === "lead_stage_changed") {
      contact.stage = e.payload.stage;
      contact.updatedAt = e.timestamp;
      contact.lastEventId = e.event_id;
    } else if (e.event_type === "consent_recorded") {
      contact.consentStatus = e.payload.consentStatus;
      contact.updatedAt = e.timestamp;
      contact.lastEventId = e.event_id;
    } else if (e.event_type === "marketing_consent_recorded") {
      contact.marketingConsentStatus = e.payload.status;
      contact.updatedAt = e.timestamp;
      contact.lastEventId = e.event_id;
    } else if (e.event_type === "interest_recorded") {
      contact.interestedProduct = e.payload.interestedProduct || contact.interestedProduct;
      contact.updatedAt = e.timestamp;
      contact.lastEventId = e.event_id;
    }
  }
  return contact;
}

async function rebuildContactProjection(email) {
  const events = await listEvents("contact", email);
  const contact = projectContact(events);
  if (contact) {
    await contactProjectionStore().setJSON(email, contact);
  }
  return contact;
}

async function getContactProjection(email) {
  return contactProjectionStore().get(email, { type: "json" });
}

module.exports = { projectContact, rebuildContactProjection, getContactProjection };
