// Explicit VIP workflow state machine. Forbidden transitions from the
// spec (vip_new -> support_active; intake_pending -> closed without a
// reason; calendar_pending -> support_completed; starting without
// entitlement) are enforced by simply not being in ALLOWED — there is no
// separate "denylist" to keep in sync.
"use strict";

const ALLOWED = {
  vip_new: ["entitlement_pending"],
  entitlement_pending: ["intake_pending", "failed"],
  intake_pending: ["intake_received", "cancelled"],
  intake_received: ["audit_pending"],
  audit_pending: ["audit_in_progress"],
  audit_in_progress: ["fix_required", "owner_review"],
  fix_required: ["owner_review"],
  owner_review: ["calendar_pending"],
  calendar_pending: ["support_scheduled"],
  support_scheduled: ["support_active"],
  support_active: ["support_completed"],
  support_completed: ["closed"],
  closed: [],
  cancelled: [],
  failed: [],
};

// Будь-який стан може перейти в cancelled/failed, АЛЕ лише з причиною
// (reason обов'язковий саме для цих двох цілей).
const REASON_REQUIRED_TARGETS = new Set(["cancelled", "failed"]);

function canTransition(from, to) {
  if (REASON_REQUIRED_TARGETS.has(to) && from !== to) return true; // з reason -- перевіряється окремо викликачем
  return (ALLOWED[from] || []).includes(to);
}

function requiresReason(to) {
  return REASON_REQUIRED_TARGETS.has(to);
}

module.exports = { ALLOWED, canTransition, requiresReason };
