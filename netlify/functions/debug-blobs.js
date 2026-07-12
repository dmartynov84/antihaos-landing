// TEMPORARY diagnostic — no PII, writes/reads only a fixed test key.
// Isolates whether store.get(exactKey) and store.list({prefix}) behave
// differently right after a write, to find the real cause of
// support-status.js returning not_found for a request that was just
// created successfully. Will be removed once the cause is found.
"use strict";

const { getStore } = require("@netlify/blobs");
const { withBlobs } = require("./_lib/with-blobs");

exports.handler = withBlobs(async (event) => {
  const store = getStore("debug-blobs-test");
  const key = "diag:fixed-test-key";

  await store.setJSON(key, { at: new Date().toISOString(), note: "diagnostic" });

  const directGet = await store.get(key, { type: "json" });
  const listResult = await store.list({ prefix: "diag:" });

  return {
    statusCode: 200,
    body: JSON.stringify({
      directGet,
      listResult,
    }),
  };
});
