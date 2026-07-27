const assert = require("assert");
const fs = require("fs");
const path = require("path");
const GmsJson = require("../gms-json-core.js");

assert.strictEqual(GmsJson.closingChecksum({
  schema: "club-genesis-pos-closing",
  schemaVersion: 2,
  submissionId: "compat-1",
  businessDate: "2026-07-25",
  sales: { totalSales: 12345 },
  checksum: ""
}), "8b5cbbfd", "GMS FNV-1a互換の固定ベクトル");

function basePayload(overrides = {}) {
  return {
    schema: "club-genesis-pos-closing",
    schemaVersion: 2,
    businessDate: "2026-07-25",
    status: "submitted",
    sales: { totalSales: 12000, cashSales: 12000, cardSales: 0 },
    customers: { groupCount: 1, totalCustomers: 2 },
    nominations: { honShimeiCount: 1, jonaiCount: 0 },
    transactions: [{
      transactionId: "tx1",
      items: [{
        itemId: "hs1",
        category: "honShimei",
        castId: "c1",
        castName: "当時名",
        isHonShimei: true,
        banaiExtCastIds: [],
        backTargetCastIds: []
      }]
    }],
    castSales: [{ castId: "c1", castName: "現在名", honShimeiSales: 12000, totalAttributedSales: 12000 }],
    castWork: [{ castId: "c1", castName: "当時名", startTime: "20:00", endTime: "00:00", hours: 4 }],
    enteredCasts: [{ castId: "c1", castName: "当時名", enteredAt: 1753437600000 }],
    exitedCasts: [],
    trialCasts: [],
    rosterSnapshot: {
      complete: true,
      capturedAt: "2026-07-25T15:00:00.000Z",
      casts: [{ castId: "c1", name: "当時名", status: "active" }]
    },
    lifecycleEvents: [{
      eventId: "evt_enter_c1",
      eventType: "entered",
      eventAt: "2026-07-25T11:00:00.000Z",
      castId: "c1",
      castName: "当時名",
      entryDate: "2026-07-25"
    }],
    staffWork: [],
    expenses: [],
    allowances: [],
    cashReconciliation: { expectedCash: 12000, actualCash: 12000, difference: 0, note: "" },
    source: {
      posVersion: "6.102",
      exportMethod: "file",
      exportedBy: "POS",
      businessStartedAt: 1753430400000,
      businessEndedAt: 1753446000000
    },
    ...overrides
  };
}

function prepare(base, previous = {}, options = {}) {
  return GmsJson.prepareSubmission(base, previous, {
    correction: false,
    generatedAt: "2026-07-25T15:00:00.000Z",
    nonce: 1,
    ...options
  });
}

const initial = prepare(basePayload());
assert(initial.payload, "通常版を生成できる");
assert.strictEqual(initial.payload.schemaVersion, 2, "schemaVersion 2");
assert.strictEqual(initial.payload.source.posVersion, undefined, "POS更新で内容が変わるposVersionは出力しない");
assert.strictEqual(GmsJson.closingChecksum(initial.payload), initial.payload.checksum, "GMS互換checksum");
assert.deepStrictEqual(GmsJson.validatePayload(initial.payload), [], "実装本体の正常payloadが検証を通る");

const previous = {
  submissionId: initial.payload.submissionId,
  generatedAt: initial.payload.generatedAt,
  checksum: initial.payload.checksum,
  contentHash: initial.meta.contentHash,
  payload: GmsJson.clone(initial.payload),
  updatedAt: "2026-07-25T15:01:00.000Z"
};
const repeated = prepare(basePayload(), previous, { nonce: 2 });
assert.strictEqual(repeated.meta.reused, true, "同じ内容は保存済みpayloadを再利用する");
assert.deepStrictEqual(repeated.payload, initial.payload, "再ダウンロード時は完成済みJSONが完全一致する");

const repeatedCorrection = prepare(basePayload(), previous, { correction: true, nonce: 3 });
assert.strictEqual(repeatedCorrection.meta.reused, true, "内容不変の訂正版操作でも新しい提出を作らない");
assert.deepStrictEqual(repeatedCorrection.payload, initial.payload, "内容不変ならsubmissionIdとchecksumを維持する");

const noPreviousCorrection = prepare(basePayload(), {}, { correction: true, nonce: 4 });
assert.strictEqual(noPreviousCorrection.payload, null, "訂正元なしの訂正版を拒否する");
assert(noPreviousCorrection.error.includes("訂正元"), "訂正元エラーを返す");

const changedBase = basePayload({
  sales: { totalSales: 13000, cashSales: 13000, cardSales: 0 }
});
const correction = prepare(changedBase, previous, { correction: true, nonce: 5 });
assert(correction.payload, "変更後の訂正版を生成できる");
assert.notStrictEqual(correction.payload.submissionId, initial.payload.submissionId, "訂正版は新しいsubmissionId");
assert.strictEqual(correction.payload.supersedesSubmissionId, initial.payload.submissionId, "訂正元submissionIdを保持");
assert.strictEqual(GmsJson.closingChecksum(correction.payload), correction.payload.checksum, "訂正版checksum");

const versionChanged = prepare(basePayload({
  source: { ...basePayload().source, posVersion: "9.999" }
}));
assert.strictEqual(versionChanged.payload.submissionId, initial.payload.submissionId, "メタデータ消失後もPOSバージョンだけではIDを変えない");
assert.strictEqual(versionChanged.payload.checksum, initial.payload.checksum, "POSバージョンだけではchecksumを変えない");

const capturedRoster = GmsJson.createRosterSnapshot([
  { id: "c1", name: "在籍", active: true },
  { id: "t1", name: "体入", active: true, castType: "trial" }
], "2026-07-25T15:00:00.000Z", true);
assert.strictEqual(capturedRoster.complete, true, "営業終了時名簿は完全として固定できる");
assert.deepStrictEqual(capturedRoster.casts.map((cast) => cast.castId), ["c1", "t1"], "体入を含む営業終了時名簿");

const legacyRoster = GmsJson.createRosterSnapshot([
  { id: "current1", name: "現在在籍", active: true }
], "2026-07-25T15:00:00.000Z", false);
assert.strictEqual(legacyRoster.complete, false, "過去日の推測名簿を完全扱いしない");

const differentNames = GmsJson.clone(initial.payload);
differentNames.castSales[0].castName = "現在名";
differentNames.transactions[0].items[0].castName = "当時名";
differentNames.checksum = GmsJson.closingChecksum(differentNames);
assert.deepStrictEqual(GmsJson.validatePayload(differentNames), [], "同じcastIdの表示名変更は取込を妨げない");

const duplicateEvent = GmsJson.clone(initial.payload);
duplicateEvent.lifecycleEvents.push(GmsJson.clone(duplicateEvent.lifecycleEvents[0]));
duplicateEvent.checksum = GmsJson.closingChecksum(duplicateEvent);
assert(GmsJson.validatePayload(duplicateEvent).some((error) => error.includes("重複")), "eventId重複を拒否");

const missingRosterId = GmsJson.clone(initial.payload);
missingRosterId.rosterSnapshot.casts[0].castId = "";
missingRosterId.checksum = GmsJson.closingChecksum(missingRosterId);
assert(GmsJson.validatePayload(missingRosterId).some((error) => error.includes("castId")), "名簿ID欠損を拒否");

const tampered = GmsJson.clone(initial.payload);
tampered.sales.totalSales = 999;
assert(GmsJson.validatePayload(tampered).some((error) => error.includes("checksum")), "改ざんを検出");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
assert(appSource.includes("GMS_JSON.prepareSubmission"), "POS本体がテスト対象の共通提出処理を使用する");
assert(appSource.includes("GMS_JSON.validatePayload"), "POS本体がテスト対象の共通検証処理を使用する");
assert(appSource.includes("day.rosterSnapshot=GMS_JSON.createRosterSnapshot"), "営業終了時に名簿を固定保存する");
assert(appSource.includes("async function redownloadGmsClosingJSON"), "保存済み完成JSONの専用再ダウンロード処理を持つ");
assert(appSource.includes("if(!window._db)throw new Error"), "共有提出履歴を保存できない場合は出力を止める");

console.log("gms-json-v2 production-core tests passed");
