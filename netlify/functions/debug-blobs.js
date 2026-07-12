// TEMPORARY diagnostic — no PII, writes/reads only a fixed test key.
// Isolates whether store.get(exactKey) and store.list({prefix}) behave
// differently right after a write, to find the real cause of
// support-status.js returning not_found for a request that was just
// created successfully. Will be removed once the cause is found.
"use strict";

const { getStore } = require("@netlify/blobs");
const { withBlobs } = require("./_lib/with-blobs");

exports.handler = withBlobs(async (event) => {
  const checkRequestId = (event.queryStringParameters || {}).requestId;
  if (checkRequestId) {
    const eventsStore = getStore("automation-events");
    const key = `support_request:${checkRequestId}::${checkRequestId}`;
    const prefix = `support_request:${checkRequestId}::`;
    const directGet = await eventsStore.get(key, { type: "json" });
    const listResult = await eventsStore.list({ prefix });
    // Also try listing with NO prefix to see everything in the store.
    const allBlobs = await eventsStore.list();
    return {
      statusCode: 200,
      body: JSON.stringify({ key, prefix, directGet, listResult, allBlobsCount: allBlobs.blobs.length, allBlobsKeys: allBlobs.blobs.map((b) => b.key).slice(0, 20) }),
    };
  }

  const store = getStore("debug-blobs-test");
  const key = "diag:fixed-test-key";
  await store.setJSON(key, { at: new Date().toISOString(), note: "diagnostic" });
  const directGet = await store.get(key, { type: "json" });
  const listResult = await store.list({ prefix: "diag:" });

  return {
    statusCode: 200,
    body: JSON.stringify({ directGet, listResult }),
  };
});
