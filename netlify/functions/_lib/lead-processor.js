// Downstream-обробка одного lead_submitted event -- спільна для
// submission-created.js (перша спроба) і replay-dead-letter.js (ручний
// повтор того самого workflowId). Ніколи не викликається напряму з
// event.body -- лише з уже записаного envelope в automation-events, щоб
// replay і перша спроба гарантовано узгоджувались.
"use strict";

const { appendEvent } = require("./events");
const { rebuildContactProjection, getContactProjection } = require("./projections");
const emailAdapter = require("./adapters/email");

async function processLeadEvent(leadEvent) {
  const email = leadEvent.entity_id; // нормалізований email -- він же entityId
  const { name, source, utm, interestedProduct, formName } = leadEvent.payload;

  const existingContact = await getContactProjection(email);
  const isNewContact = !existingContact;

  if (isNewContact) {
    await appendEvent({
      eventType: "contact_created",
      entityType: "contact",
      entityId: email,
      workflowId: leadEvent.workflow_id,
      correlationId: leadEvent.correlation_id,
      idempotencyKey: "contact_created",
      source,
      payload: {
        name, source, utm, interestedProduct,
        // Немає чекбокса маркетингової згоди на жодній формі -- ніколи
        // "granted" тут, лише чесний стан (O-15, підтверджено попереднім
        // циклом і не переглядалось цим).
        consentStatus: "not_collected",
        marketingConsentStatus: "not_collected",
      },
    });
    await appendEvent({
      eventType: "lead_stage_changed",
      entityType: "contact",
      entityId: email,
      workflowId: leadEvent.workflow_id,
      correlationId: leadEvent.correlation_id,
      idempotencyKey: `stage:validated:${leadEvent.idempotency_key}`,
      source: "automation",
      payload: { stage: "validated" },
    });
  } else {
    await appendEvent({
      eventType: "lead_duplicate_submission",
      entityType: "contact",
      entityId: email,
      workflowId: leadEvent.workflow_id,
      correlationId: leadEvent.correlation_id,
      idempotencyKey: `dup:${leadEvent.idempotency_key}`,
      source,
      payload: { formName },
    });
  }

  await rebuildContactProjection(email);

  await emailAdapter.sendTransactional("lead_magnet_checklist", email, {
    name, formName, correlationId: leadEvent.correlation_id,
  });

  return { isNewContact };
}

module.exports = { processLeadEvent };
