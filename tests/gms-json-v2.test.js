const assert = require("assert");

function closingChecksum(payload) {
  const copy = { ...payload };
  delete copy.checksum;
  const text = JSON.stringify(copy);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (`00000000${(hash >>> 0).toString(16)}`).slice(-8);
}

function stableHash(text, seed = 2166136261) {
  let hash = seed;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (`00000000${(hash >>> 0).toString(16)}`).slice(-8);
}

function stableId(prefix, parts) {
  const text = JSON.stringify(parts);
  return `${prefix}_${stableHash(text)}${stableHash(text, 2166136261 ^ 0x9e3779b9)}`;
}

function validate(payload) {
  const errors = [];
  const iso = (v) => typeof v === "string" && !Number.isNaN(Date.parse(v));
  if (payload.schema !== "club-genesis-pos-closing") errors.push("schema");
  if (payload.schemaVersion !== 2) errors.push("schemaVersion");
  if (!payload.submissionId) errors.push("submissionId");
  if (!iso(payload.generatedAt)) errors.push("generatedAt");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.businessDate || "")) errors.push("businessDate");
  ["sales", "customers", "nominations", "rosterSnapshot"].forEach((k) => {
    if (!payload[k] || typeof payload[k] !== "object" || Array.isArray(payload[k])) errors.push(k);
  });
  ["transactions", "castSales", "castWork", "enteredCasts", "exitedCasts", "trialCasts", "lifecycleEvents"].forEach((k) => {
    if (!Array.isArray(payload[k])) errors.push(k);
  });
  if (payload.rosterSnapshot) {
    if (typeof payload.rosterSnapshot.complete !== "boolean") errors.push("rosterSnapshot.complete");
    if (!iso(payload.rosterSnapshot.capturedAt)) errors.push("rosterSnapshot.capturedAt");
    (payload.rosterSnapshot.casts || []).forEach((c, i) => {
      if (!c.castId) errors.push(`rosterSnapshot.casts.${i}.castId`);
    });
  }
  const eventIds = new Set();
  (payload.lifecycleEvents || []).forEach((ev, i) => {
    if (!ev.eventId) errors.push(`lifecycleEvents.${i}.eventId`);
    if (eventIds.has(ev.eventId)) errors.push(`lifecycleEvents.${i}.eventId.duplicate`);
    eventIds.add(ev.eventId);
    if (!["entered", "departed", "trial"].includes(ev.eventType)) errors.push(`lifecycleEvents.${i}.eventType`);
    if (!iso(ev.eventAt)) errors.push(`lifecycleEvents.${i}.eventAt`);
    if (!ev.castId) errors.push(`lifecycleEvents.${i}.castId`);
  });
  if (payload.checksum !== closingChecksum(payload)) errors.push("checksum");
  return errors;
}

function sample(overrides = {}) {
  const core = {
    schema: "club-genesis-pos-closing",
    schemaVersion: 2,
    submissionId: "pos_abc123def4567890",
    generatedAt: "2026-07-25T14:10:00.000Z",
    businessDate: "2026-07-25",
    sales: { totalSales: 12000, cashSales: 12000, cardSales: 0, discountTotal: 0, taxServiceTotal: 3600 },
    customers: { groupCount: 1, totalCustomers: 2, customerUnitPrice: 6000 },
    nominations: { honShimeiCount: 1, jonaiCount: 1 },
    transactions: [{
      transactionId: "tx1",
      items: [
        { itemId: "hs_c1", castId: "c1", castName: "\u3042\u3044", banaiExtCastIds: [], backTargetCastIds: [] },
        { itemId: "be1", castId: "", castName: "", banaiExtCastIds: ["c2"], backTargetCastIds: ["c2"] },
      ],
    }],
    castSales: [
      { castId: "c1", castName: "\u3042\u3044", honShimeiSales: 6000, jonaiExtensionSales: 0, drinkSales: 0, totalAttributedSales: 6000 },
      { castId: "c2", castName: "\u3042\u3044", honShimeiSales: 0, jonaiExtensionSales: 6000, drinkSales: 0, totalAttributedSales: 6000 },
    ],
    castWork: [{ castId: "c1", castName: "\u3042\u3044", startTime: "20:00", endTime: "00:00", breakMinutes: 0, hours: 4 }],
    enteredCasts: [{ castId: "c1", castName: "\u3042\u3044" }],
    exitedCasts: [{ castId: "c3", castName: "\u3057\u304a" }],
    trialCasts: [{ castId: "t100", castName: "\u4f53\u5165" }],
    rosterSnapshot: {
      complete: true,
      capturedAt: "2026-07-25T14:10:00.000Z",
      casts: [
        { castId: "c1", name: "\u3042\u3044", status: "active" },
        { castId: "c2", name: "\u3042\u3044", status: "active" },
      ],
    },
    lifecycleEvents: [
      { eventId: "evt_enter_c1", eventType: "entered", eventAt: "2026-07-25T11:00:00.000Z", castId: "c1", castName: "\u3042\u3044", entryDate: "2026-07-25" },
      { eventId: "evt_trial_t100", eventType: "trial", eventAt: "2026-07-25T12:00:00.000Z", castId: "t100", castName: "\u4f53\u5165", entryDate: "2026-07-25" },
    ],
    staffWork: [],
    expenses: [],
    allowances: [],
    cashReconciliation: { expectedCash: 12000, actualCash: 12000, difference: 0, note: "" },
    source: { posVersion: "6.102", exportMethod: "file", exportedBy: "POS", submissionId: "pos_abc123def4567890" },
  };
  const payload = { ...core, ...overrides };
  payload.checksum = closingChecksum(payload);
  return payload;
}

const normal = sample();
assert.deepStrictEqual(validate(normal), [], "v2 normal output is valid");

const missing = sample({ submissionId: "" });
missing.checksum = closingChecksum(missing);
assert(validate(missing).includes("submissionId"), "missing required field is blocked");

const contentHash = stableHash(JSON.stringify({ businessDate: normal.businessDate, sales: normal.sales }));
const submissionA = stableId("pos", [normal.businessDate, contentHash]);
const submissionB = stableId("pos", [normal.businessDate, contentHash]);
assert.strictEqual(submissionA, submissionB, "same submission keeps submissionId");
assert.strictEqual(closingChecksum(normal), normal.checksum, "same submission keeps checksum");

const changedHash = stableHash(JSON.stringify({ businessDate: normal.businessDate, sales: { ...normal.sales, totalSales: 13000 } }));
assert.notStrictEqual(stableId("pos", [normal.businessDate, contentHash]), stableId("pos", [normal.businessDate, changedHash]), "changed content uses new submissionId");

const correction = sample({ submissionId: stableId("pos", ["correction", normal.businessDate, changedHash, normal.submissionId, 1]), supersedesSubmissionId: normal.submissionId });
correction.checksum = closingChecksum(correction);
assert.notStrictEqual(correction.submissionId, normal.submissionId, "correction gets new submissionId");
assert.strictEqual(correction.supersedesSubmissionId, normal.submissionId, "correction points to previous submissionId");

assert.strictEqual(stableId("evt", ["2026-07-25", "entered", "c1", "2026-07-25T11:00:00.000Z", 1]), stableId("evt", ["2026-07-25", "entered", "c1", "2026-07-25T11:00:00.000Z", 1]), "eventId is stable");

const dup = sample({ lifecycleEvents: [normal.lifecycleEvents[0], normal.lifecycleEvents[0]] });
dup.checksum = closingChecksum(dup);
assert(validate(dup).some((e) => e.includes("duplicate")), "duplicate eventId is blocked");

const noCastId = sample({ rosterSnapshot: { ...normal.rosterSnapshot, casts: [{ name: "no id", status: "active" }] } });
noCastId.checksum = closingChecksum(noCastId);
assert(validate(noCastId).some((e) => e.includes("castId")), "missing roster castId is blocked");

const badEventAt = sample({ lifecycleEvents: [{ ...normal.lifecycleEvents[0], eventAt: "bad-date" }] });
badEventAt.checksum = closingChecksum(badEventAt);
assert(validate(badEventAt).some((e) => e.includes("eventAt")), "invalid eventAt is rejected");

assert.notStrictEqual(normal.rosterSnapshot.casts[0].castId, normal.rosterSnapshot.casts[1].castId, "same-name casts keep unique IDs");
assert(normal.transactions[0].items[1].banaiExtCastIds.includes("c2"), "cast references keep POS castId");

const compatible = closingChecksum(normal);
assert.strictEqual(compatible, normal.checksum, "checksum matches GMS-compatible code");
const mutated = { ...normal, sales: { ...normal.sales, totalSales: 999 } };
assert.notStrictEqual(closingChecksum(mutated), normal.checksum, "mutation changes checksum");

const japanese = sample({ castSales: [{ castId: "jp1", castName: "\u6f22\u5b57\u304b\u306a", honShimeiSales: 1, jonaiExtensionSales: 0, drinkSales: 0, totalAttributedSales: 1 }] });
japanese.checksum = closingChecksum(japanese);
assert.strictEqual(validate(japanese).filter((e) => e === "checksum").length, 0, "Japanese names keep checksum stable");

delete global.firebase;
assert.doesNotThrow(() => sample(), "JSON output logic does not require Firebase");

const historical = sample({ businessDate: "2026-06-30" });
historical.checksum = closingChecksum(historical);
assert.deepStrictEqual(validate(historical), [], "historical business day can be exported");

console.log("gms-json-v2 tests passed");
