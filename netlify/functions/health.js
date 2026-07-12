// GET /.netlify/functions/health
// Public-safe healthcheck — NO PII, no record counts, no contact/order
// data, no credentials, no internal paths. Just: is Blobs reachable, and
// what mode is each subsystem in. Never writes/changes client data.
"use strict";

const { getStore } = require("@netlify/blobs");
const { getAutomationModes } = require("./_lib/automation-mode");
const { getMode: getCheckoutMode } = require("./_lib/mode");
const { withBlobs } = require("./_lib/with-blobs");

exports.handler = withBlobs(async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }

  const modes = getAutomationModes();
  let blobs = "unknown";
  try {
    const probe = getStore("healthcheck-probe");
    await probe.setJSON("ping", { at: new Date().toISOString() });
    blobs = "healthy";
  } catch (e) {
    blobs = "failed";
  }

  const status = blobs === "healthy" ? "healthy" : "degraded";

  return {
    statusCode: 200,
    body: JSON.stringify({
      status,
      environment: process.env.CONTEXT || "unknown",
      components: {
        blobs,
        workflow_store: blobs,
        crm: modes.crm,
        email: modes.email,
        checkout: getCheckoutMode(),
        analytics: modes.analytics,
      },
    }),
  };
});
