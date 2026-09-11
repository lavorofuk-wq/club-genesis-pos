const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const GmsJson = require("../gms-json-core.js");

const clone = value => JSON.parse(JSON.stringify(value));
const generatedAt = "2026-09-11T19:00:00.000Z";
const businessDate = "2026-09-11";

function basePayload() {
  return {
    schema: "club-genesis-pos-closing",
    schemaVersion: 3,
    businessDate,
    status: "submitted",
    sales: { totalSales: 1000, cashSales: 1000, cardSales: 0, discountTotal: 0, taxServiceTotal: 0 },
    customers: { groupCount: 1, totalCustomers: 1, customerUnitPrice: 1000 },
    nominations: { honShimeiCount: 0, jonaiCount: 0 },
    transactions: [{
      transactionId: "tx-20260911-1", tableId: "t1", tableLabel: "テーブル1",
      startTime: Date.parse("2026-09-11T12:00:00.000Z"),
      endTime: Date.parse(generatedAt), guests: 1, note: "", payMethod: "cash",
      splits: [{ method: "cash", amount: 1000 }], subtotal: 1000, discount: 0, tax: 0, total: 1000,
      items: [{
        itemId: "set-1", label: "セット", category: "set", price: 1000, quantity: 1,
        castId: "", castName: "", banaiExtCastIds: [], isSet: true, isHonShimei: false,
        isBanaiShimei: false, isExtension: false,
        backTargetCastIds: [], backTargetCastNames: [], backType: "", backAllocation: ""
      }]
    }],
    castSales: [], castWork: [], enteredCasts: [], exitedCasts: [], trialCasts: [], lifecycleEvents: [],
    rosterSnapshot: { complete: true, capturedAt: generatedAt, casts: [] },
    source: { exportMethod: "file", exportedBy: "POS", businessStartedAt: Date.parse("2026-09-11T12:00:00.000Z"), businessEndedAt: Date.parse(generatedAt) },
    checksumAlgorithm: "sha256", checksumCanonicalization: "recursive-key-sort-v1"
  };
}

function previousSubmission(base = basePayload()) {
  const prepared = GmsJson.prepareSubmission(base, {}, { generatedAt, nonce: 1 });
  assert.deepEqual(GmsJson.validatePayload(prepared.payload), [], "比較元の通常版は正常なJSON");
  return {
    schemaVersion: 3, submissionId: prepared.payload.submissionId, payload: prepared.payload,
    contentHash: prepared.meta.contentHash, checksum: prepared.payload.checksum,
    generatedAt: prepared.payload.generatedAt, history: []
  };
}

function rebuild(base, previous, nonce = 2) {
  return GmsJson.prepareSubmission(base, previous, {
    rebuildUnsubmitted: true, correction: false, generatedAt, nonce
  });
}

function businessContent(payload) {
  const result = clone(payload);
  for (const key of ["submissionId", "generatedAt", "checksum", "supersedesSubmissionId"]) delete result[key];
  delete result.source.submissionId;
  return result;
}

test("未送信の同一内容を作り直すと、営業内容を維持して新しいIDとSHA-256を発行する", () => {
  const base = basePayload();
  const previous = previousSubmission(base);
  const before = clone({ base, previous });
  const prepared = rebuild(base, previous);
  assert.ok(prepared.payload);
  assert.notEqual(prepared.payload.submissionId, previous.submissionId);
  assert.notEqual(prepared.payload.checksum, previous.checksum);
  assert.equal(prepared.payload.source.submissionId, prepared.payload.submissionId);
  assert.equal(Object.hasOwn(prepared.payload, "supersedesSubmissionId"), false);
  assert.equal(prepared.meta.rebuiltUnsubmitted, true);
  assert.equal(prepared.meta.isCorrection, false);
  assert.equal(prepared.meta.reused, false);
  assert.equal(prepared.meta.previous, previous);
  assert.match(prepared.payload.checksum, /^[a-f0-9]{64}$/);
  assert.equal(prepared.payload.checksum, GmsJson.closingChecksum(prepared.payload));
  assert.deepEqual(GmsJson.validatePayload(prepared.payload), []);
  assert.deepEqual(businessContent(prepared.payload), businessContent(previous.payload));
  assert.deepEqual({ base, previous }, before, "引数の営業内容・過去の出力履歴を変更しない");
  assert.notEqual(rebuild(base, previous, 3).payload.submissionId, prepared.payload.submissionId, "別の作り直し操作には別IDを発行する");
});

test("未送信の訂正版を作り直しても、訂正元や古いsource.submissionIdを引き継がない", () => {
  const base = basePayload();
  const previous = previousSubmission(base);
  previous.payload.supersedesSubmissionId = "pos_imported-before";
  previous.supersedesSubmissionId = "pos_imported-before";
  previous.payload.checksum = GmsJson.closingChecksum(previous.payload);
  previous.checksum = previous.payload.checksum;
  const staleBase = { ...clone(base), supersedesSubmissionId: "pos_imported-before" };
  staleBase.source.submissionId = previous.submissionId;
  const before = clone(previous);
  const prepared = rebuild(staleBase, previous);
  assert.equal(Object.hasOwn(prepared.payload, "supersedesSubmissionId"), false);
  assert.equal(prepared.payload.source.submissionId, prepared.payload.submissionId);
  assert.notEqual(prepared.payload.source.submissionId, previous.submissionId);
  assert.deepEqual(previous, before);
  assert.deepEqual(GmsJson.validatePayload(prepared.payload), []);
});

test("訂正版と未送信作り直しの同時指定、および元出力なしの作り直しを拒否する", () => {
  const base = basePayload();
  const previous = previousSubmission(base);
  const both = GmsJson.prepareSubmission(base, previous, { correction: true, rebuildUnsubmitted: true, generatedAt, nonce: 2 });
  assert.equal(both.payload, null);
  assert.ok(both.error);
  const missing = rebuild(base, {});
  assert.equal(missing.payload, null);
  assert.ok(missing.error);
  const onlyPayload = rebuild(base, { payload: previous.payload, contentHash: previous.contentHash });
  assert.equal(onlyPayload.payload, null, "同内容payloadがあっても元submissionIdなしでは再利用しない");
  assert.ok(onlyPayload.error);
});

test("通常再出力のID再利用と取込済み訂正版の訂正元指定を維持する", () => {
  const base = basePayload();
  const previous = previousSubmission(base);
  const normal = GmsJson.prepareSubmission(base, previous, { correction: false, generatedAt, nonce: 2 });
  assert.deepEqual(normal.payload, previous.payload);
  assert.equal(normal.meta.reused, true);
  const unchangedCorrection = GmsJson.prepareSubmission(base, previous, { correction: true, generatedAt, nonce: 3 });
  assert.deepEqual(unchangedCorrection.payload, previous.payload);
  assert.equal(unchangedCorrection.meta.reused, true);
  const changed = clone(base);
  changed.transactions[0].note = "確認済み";
  const correction = GmsJson.prepareSubmission(changed, previous, { correction: true, generatedAt, nonce: 4 });
  assert.equal(correction.payload.supersedesSubmissionId, previous.submissionId);
  assert.notEqual(correction.payload.submissionId, previous.submissionId);
  assert.equal(correction.meta.isCorrection, true);
  assert.deepEqual(GmsJson.validatePayload(correction.payload), []);
});

function exportContext({ base = basePayload(), previous = previousSubmission(), accept = true, saveError = null } = {}) {
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const source = app.slice(app.indexOf("function gmsClosingPayload("), app.indexOf("async function loadBizDayForReEdit("));
  const events = [];
  const downloads = [];
  const saves = [];
  const alerts = [];
  const confirmations = [];
  const context = {
    GMS_JSON: GmsJson,
    S: { bizDays: { [businessDate]: { date: businessDate } } },
    gmsClosingBasePayload: () => clone(base),
    gmsCastTypeSourceErrors: () => [],
    gmsGetExportMeta: () => previous,
    gmsIso: value => new Date(value).toISOString(),
    ensureGmsDayLoaded: async () => { events.push("load"); },
    validateGmsClosingPayload: payload => { events.push("validate"); return GmsJson.validatePayload(payload); },
    gmsSaveExportMeta: async (date, meta) => {
      events.push("save");
      if (saveError) throw saveError;
      saves.push({ date, meta: clone(meta) });
    },
    confirm: text => { events.push("confirm"); confirmations.push(text); return accept; },
    prompt: () => { throw new Error("未送信の作り直しでは訂正元の入力を求めない"); },
    alert: text => alerts.push(text),
    console: { warn() {} },
    Date, JSON, String, Array, Object
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  context.gmsDownloadPayload = payload => { events.push("download"); downloads.push(clone(payload)); };
  return { context, events, downloads, saves, alerts, confirmations };
}

test("画面の未送信確認をキャンセルした場合、提出履歴を保存せずダウンロードしない", async () => {
  const harness = exportContext({ accept: false });
  await harness.context.rebuildUnsubmittedGmsClosingJSON(businessDate);
  assert.equal(harness.confirmations.length, 1);
  assert.match(harness.confirmations[0], /未送信|未取込/);
  assert.equal(harness.saves.length, 0);
  assert.equal(harness.downloads.length, 0);
});

test("実出力経路の作り直しは検証後に保存・ダウンロードし、20件を超える履歴もすべて残す", async () => {
  const previous = previousSubmission();
  previous.history = Array.from({ length: 25 }, (_, index) => ({
    submissionId: `pos_older-${index}`, checksum: `checksum-${index}`, generatedAt, supersedesSubmissionId: null
  }));
  const before = clone(previous);
  const harness = exportContext({ previous });
  await harness.context.rebuildUnsubmittedGmsClosingJSON(businessDate);
  assert.equal(harness.confirmations.length, 1);
  assert.equal(harness.saves.length, 1);
  assert.equal(harness.downloads.length, 1);
  assert.ok(harness.events.indexOf("validate") < harness.events.indexOf("save"));
  assert.ok(harness.events.indexOf("save") < harness.events.indexOf("download"));
  const output = harness.downloads[0];
  assert.notEqual(output.submissionId, previous.submissionId, "画面のオプションがcoreまで渡る");
  assert.equal(Object.hasOwn(output, "supersedesSubmissionId"), false);
  assert.equal(output.source.submissionId, output.submissionId);
  assert.deepEqual(GmsJson.validatePayload(output), []);
  const saved = harness.saves[0];
  assert.equal(saved.date, businessDate);
  assert.deepEqual(saved.meta.payload, output);
  assert.equal(saved.meta.history.length, 27);
  assert.deepEqual(saved.meta.history.slice(0, 25), before.history);
  assert.equal(saved.meta.history[25].submissionId, previous.submissionId);
  assert.equal(saved.meta.history[26].submissionId, output.submissionId);
  assert.deepEqual(previous, before, "以前の出力履歴オブジェクトを破壊しない");
  for (const key of ["_gmsMeta", "_gmsError", "rebuiltUnsubmitted", "rebuildUnsubmitted", "isCorrection", "reused", "mode"]) {
    assert.equal(Object.hasOwn(output, key), false, `${key}をGMSファイルへ出力しない`);
  }
});

test("ルナの売上名を補完した未送信JSONは、古い不整合JSONを再利用せず訂正元なしで出力する", async () => {
  const base = basePayload();
  base.castSales = [{ castId: "1789127986881", castName: "ルナ", drinkSales: 1000 }];
  base.castWork = [{ castId: "1789127986881", castName: "ルナ", name: "ルナ", castType: "trial", isTrial: true, startTime: "21:00", endTime: "04:00", breakMinutes: 0, hours: 7 }];
  const previous = previousSubmission(base);
  previous.payload.castSales[0].castName = "";
  previous.payload.checksum = GmsJson.closingChecksum(previous.payload);
  previous.checksum = previous.payload.checksum;
  previous.contentHash = GmsJson.contentHash(previous.payload);
  const before = clone(previous);
  const harness = exportContext({ base, previous });
  await harness.context.rebuildUnsubmittedGmsClosingJSON(businessDate);
  assert.equal(harness.confirmations.length, 1, "内容変更時も未送信の確認だけを行う");
  assert.equal(harness.downloads.length, 1);
  const output = harness.downloads[0];
  assert.equal(output.castSales[0].castId, "1789127986881");
  assert.equal(output.castSales[0].castName, "ルナ");
  assert.equal(output.castSales[0].castName, output.castWork[0].castName);
  assert.equal(Object.hasOwn(output, "supersedesSubmissionId"), false);
  assert.notEqual(output.submissionId, previous.submissionId);
  assert.deepEqual(GmsJson.validatePayload(output), []);
  const expectedBusinessContent = businessContent(previous.payload);
  expectedBusinessContent.castSales[0].castName = "ルナ";
  assert.deepEqual(businessContent(output), expectedBusinessContent, "名前以外の営業内容を変更しない");
  assert.deepEqual(previous, before);
});

test("作り直しでも名前の不一致は検証で停止し、売上を省略して出力しない", async () => {
  const base = basePayload();
  base.castSales = [{ castId: "1789127986881", castName: "", drinkSales: 1000 }];
  base.castWork = [{ castId: "1789127986881", castName: "ルナ", name: "ルナ", castType: "trial", isTrial: true, startTime: "21:00", endTime: "04:00", breakMinutes: 0, hours: 7 }];
  const harness = exportContext({ base });
  await harness.context.rebuildUnsubmittedGmsClosingJSON(businessDate);
  assert.ok(harness.events.includes("validate"));
  assert.equal(harness.saves.length, 0);
  assert.equal(harness.downloads.length, 0);
  assert.ok(harness.alerts.some(text => text.includes("ルナ") && text.includes("castSales")));
});

test("作り直しの提出履歴保存が失敗した場合はファイルを出力しない", async () => {
  const harness = exportContext({ saveError: new Error("接続エラー") });
  await harness.context.rebuildUnsubmittedGmsClosingJSON(businessDate);
  assert.ok(harness.events.includes("validate"));
  assert.ok(harness.events.includes("save"));
  assert.equal(harness.downloads.length, 0);
  assert.ok(harness.alerts.some(text => text.includes("接続エラー")));
});
