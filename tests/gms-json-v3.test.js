const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const GmsJson = require("../gms-json-core.js");

assert.strictEqual(
  GmsJson.sha256Hex("abc"),
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  "SHA-256固定ベクトル"
);

function transactionItems() {
  return [
    {
      itemId: "set1", label: "同伴セット", category: "set", price: 12000, quantity: 1,
      castId: "", castName: "", banaiExtCastIds: [], isSet: true, isHonShimei: false,
      isBanaiShimei: false, isExtension: false, backTargetCastIds: [], backTargetCastNames: [], backType: "", backAllocation: ""
    },
    {
      itemId: "hs1", label: "本指名料 (在籍 花子)", category: "honShimei", price: 2000, quantity: 1,
      castId: "regular-1", castName: "在籍 花子", banaiExtCastIds: [], isHonShimei: true,
      isBanaiShimei: false, isExtension: false, backTargetCastIds: [], backTargetCastNames: [], backType: "", backAllocation: ""
    },
    {
      itemId: "dh1", label: "同伴料", category: "dohan", price: 3000, quantity: 1,
      castId: "regular-1", castName: "在籍 花子", banaiExtCastIds: [], isHonShimei: false,
      isBanaiShimei: false, isExtension: false, backTargetCastIds: ["regular-1"], backTargetCastNames: ["在籍 花子"],
      backType: "dohan", backAllocation: "single"
    },
    {
      itemId: "cw1", label: "シャンパン", category: "champagneWine", price: 30000, quantity: 1,
      castId: "trial-1", castName: "体入 美咲", banaiExtCastIds: [], isHonShimei: false,
      isBanaiShimei: false, isExtension: false, backTargetCastIds: ["trial-1"], backTargetCastNames: ["体入 美咲"],
      backType: "champagneWine", backAllocation: "single"
    },
    {
      itemId: "keep0", label: "キープ利用", category: "keepBottle", price: 0, quantity: 1,
      castId: "", castName: "", banaiExtCastIds: [], isHonShimei: false,
      isBanaiShimei: false, isExtension: false, backTargetCastIds: [], backTargetCastNames: [], backType: "", backAllocation: ""
    },
    {
      itemId: "ext1", label: "延長30分", category: "extension", price: 3000, quantity: 1,
      castId: "", castName: "", banaiExtCastIds: ["dispatch-1"], isHonShimei: false,
      isBanaiShimei: false, isExtension: true, backTargetCastIds: [], backTargetCastNames: [], backType: "", backAllocation: ""
    },
    {
      itemId: "drink1", label: "キャストDrink (在籍 花子)", category: "castDrink", price: 2000, quantity: 1,
      castId: "regular-1", castName: "在籍 花子", banaiExtCastIds: [], isHonShimei: false,
      isBanaiShimei: false, isExtension: false, backTargetCastIds: ["regular-1"], backTargetCastNames: ["在籍 花子"],
      backType: "castDrink", backAllocation: "orderedCast"
    }
  ];
}

function basePayload(overrides = {}) {
  return {
    schema: "club-genesis-pos-closing",
    schemaVersion: 3,
    businessDate: "2026-09-02",
    status: "submitted",
    sales: { totalSales: 50000, cashSales: 20000, cardSales: 30000, discountTotal: 0, taxServiceTotal: 0 },
    customers: { groupCount: 1, totalCustomers: 2, customerUnitPrice: 25000 },
    nominations: { honShimeiCount: 1, jonaiCount: 1 },
    transactions: [{
      transactionId: "tx-20260902-1",
      tableId: "t1",
      tableLabel: "テーブル 1",
      startTime: 1788350400000,
      endTime: 1788361200000,
      guests: 2,
      note: "",
      payMethod: "cash",
      splits: [{ method: "cash", amount: 20000 }, { method: "card", amount: 30000 }],
      subtotal: 50000,
      discount: 0,
      tax: 0,
      total: 50000,
      items: transactionItems()
    }],
    castSales: [
      { castId: "regular-1", castName: "在籍 花子", honShimeiSales: 50000, jonaiExtensionSales: 0, drinkSales: 2000, totalAttributedSales: 50000 },
      { castId: "trial-1", castName: "体入 美咲", honShimeiSales: 0, jonaiExtensionSales: 0, drinkSales: 0, totalAttributedSales: 0 },
      { castId: "dispatch-1", castName: "派遣 葵", honShimeiSales: 0, jonaiExtensionSales: 0, drinkSales: 0, totalAttributedSales: 0 }
    ],
    castWork: [
      { castId: "regular-1", castName: "在籍 花子", name: "在籍 花子", castType: "regular", isTrial: false, startTime: "20:00", endTime: "01:00", breakMinutes: 0, hours: 5 },
      { castId: "trial-1", castName: "体入 美咲", name: "体入 美咲", castType: "trial", isTrial: true, startTime: "20:30", endTime: "00:30", breakMinutes: 0, hours: 4 },
      { castId: "dispatch-1", castName: "派遣 葵", name: "派遣 葵", castType: "dispatch", isTrial: false, startTime: "21:00", endTime: "02:00", breakMinutes: 0, hours: 5 }
    ],
    enteredCasts: [
      { castId: "regular-1", castName: "在籍 花子", castType: "regular", isTrial: false, enteredAt: 1788350400000 },
      { castId: "dispatch-1", castName: "派遣 葵", castType: "dispatch", isTrial: false, enteredAt: 1788350400000 }
    ],
    exitedCasts: [],
    trialCasts: [{ castId: "trial-1", castName: "体入 美咲", castType: "trial", isTrial: true, trialRegisteredAt: 1788350400000 }],
    rosterSnapshot: {
      complete: true,
      capturedAt: "2026-09-02T18:00:00.000Z",
      casts: [
        { castId: "regular-1", name: "在籍 花子", castName: "在籍 花子", status: "active", castType: "regular", isTrial: false },
        { castId: "trial-1", name: "体入 美咲", castName: "体入 美咲", status: "trial", castType: "trial", isTrial: true },
        { castId: "dispatch-1", name: "派遣 葵", castName: "派遣 葵", status: "active", castType: "dispatch", isTrial: false }
      ]
    },
    lifecycleEvents: [
      { eventId: "evt_regular", eventType: "entered", eventAt: "2026-09-02T11:00:00.000Z", castId: "regular-1", castName: "在籍 花子", castType: "regular", isTrial: false, entryDate: "2026-09-02" },
      { eventId: "evt_trial", eventType: "trial", eventAt: "2026-09-02T11:30:00.000Z", castId: "trial-1", castName: "体入 美咲", castType: "trial", isTrial: true, entryDate: "2026-09-02" },
      { eventId: "evt_dispatch", eventType: "entered", eventAt: "2026-09-02T12:00:00.000Z", castId: "dispatch-1", castName: "派遣 葵", castType: "dispatch", isTrial: false, entryDate: "2026-09-02" }
    ],
    source: { exportMethod: "file", exportedBy: "POS", businessStartedAt: 1788350400000, businessEndedAt: 1788361200000 },
    checksumAlgorithm: "sha256",
    checksumCanonicalization: "recursive-key-sort-v1",
    ...overrides
  };
}

function prepare(base = basePayload(), previous = {}, options = {}) {
  return GmsJson.prepareSubmission(base, previous, {
    correction: false,
    generatedAt: "2026-09-02T18:00:00.000Z",
    nonce: 1,
    ...options
  });
}

function recalculate(payload) {
  payload.checksum = GmsJson.closingChecksum(payload);
  return payload;
}

const initial = prepare();
assert(initial.payload, "schemaVersion 3通常版を生成できる");
assert.strictEqual(initial.payload.schemaVersion, 3);
assert.deepStrictEqual(GmsJson.validatePayload(initial.payload), [], "正常なv3 payloadが検証を通る");
assert.match(initial.payload.checksum, /^[0-9a-f]{64}$/, "64文字の小文字SHA-256");

const checksumInput = GmsJson.clone(initial.payload);
delete checksumInput.checksum;
const nodeChecksum = crypto.createHash("sha256").update(GmsJson.canonicalJson(checksumInput), "utf8").digest("hex");
assert.strictEqual(initial.payload.checksum, nodeChecksum, "再帰キーソートしたUTF-8文字列の標準SHA-256と一致");
assert.strictEqual(
  GmsJson.closingChecksum({ b: 2, a: { z: 1, y: [3, 2] }, checksum: "old" }),
  GmsJson.closingChecksum({ a: { y: [3, 2], z: 1 }, b: 2 }),
  "オブジェクトのキー順に依存しない"
);

const tampered = GmsJson.clone(initial.payload);
tampered.transactions[0].items[3].castId = "trial-2";
assert.notStrictEqual(GmsJson.closingChecksum(tampered), initial.payload.checksum, "キャストIDの1文字変更でchecksumが変わる");
const amountChanged = GmsJson.clone(initial.payload);
amountChanged.sales.totalSales += 1;
assert.notStrictEqual(GmsJson.closingChecksum(amountChanged), initial.payload.checksum, "金額変更でchecksumが変わる");

assert.deepStrictEqual(
  initial.payload.castWork.map(({ castType, isTrial }) => ({ castType, isTrial })),
  [
    { castType: "regular", isTrial: false },
    { castType: "trial", isTrial: true },
    { castType: "dispatch", isTrial: false }
  ],
  "在籍・体入・派遣区分を正しく出力"
);

const typeMismatch = GmsJson.clone(initial.payload);
typeMismatch.castWork[1].castType = "regular";
typeMismatch.castWork[1].isTrial = false;
recalculate(typeMismatch);
assert(GmsJson.validatePayload(typeMismatch).some((error) => error.includes("体入 美咲") && error.includes("区分が不一致")), "体入区分の不一致を名前付きで拒否");

const bottle = initial.payload.transactions[0].items.find((item) => item.category === "champagneWine");
assert.deepStrictEqual(bottle.backTargetCastIds, ["trial-1"], "有料ボトル対象IDを出力");
assert.deepStrictEqual(bottle.backTargetCastNames, ["体入 美咲"], "有料ボトル対象名を出力");
assert.strictEqual(bottle.backType, "champagneWine");
assert.strictEqual(bottle.backAllocation, "single");

const multiBottleTargets = GmsJson.clone(initial.payload);
Object.assign(multiBottleTargets.transactions[0].items[3], {
  castId: "regular-1", castName: "在籍 花子",
  backTargetCastIds: ["regular-1", "trial-1"],
  backTargetCastNames: ["在籍 花子", "体入 美咲"],
  backAllocation: "equal"
});
recalculate(multiBottleTargets);
assert.deepStrictEqual(GmsJson.validatePayload(multiBottleTargets), [], "複数ボトル対象の均等分配を受理");
const badBottleAllocation = GmsJson.clone(multiBottleTargets);
badBottleAllocation.transactions[0].items[3].backAllocation = "single";
recalculate(badBottleAllocation);
assert(GmsJson.validatePayload(badBottleAllocation).some((error) => error.includes("equal")), "複数ボトル対象は均等分配以外を拒否");

const missingBottleTarget = GmsJson.clone(initial.payload);
Object.assign(missingBottleTarget.transactions[0].items[3], { castId: "", castName: "", backTargetCastIds: [], backTargetCastNames: [], backType: "", backAllocation: "" });
recalculate(missingBottleTarget);
assert(GmsJson.validatePayload(missingBottleTarget).some((error) => error.includes("シャンパン") && error.includes("対象キャストがありません")), "対象なし有料ボトルを商品名付きで拒否");
assert(!GmsJson.validatePayload(initial.payload).some((error) => error.includes("キープ利用")), "価格0円のキープ利用は対象キャスト不要");

const dohan = initial.payload.transactions[0].items.find((item) => item.category === "dohan");
assert.deepStrictEqual(dohan.backTargetCastIds, ["regular-1"], "同伴対象IDを出力");
assert.strictEqual(dohan.castId, "regular-1");
assert.strictEqual(dohan.backType, "dohan");
assert.strictEqual(dohan.backAllocation, "single");

const multiDohan = GmsJson.clone(initial.payload);
multiDohan.transactions[0].items.push({
  ...GmsJson.clone(dohan), itemId: "dh2", castId: "trial-1", castName: "体入 美咲",
  backTargetCastIds: ["trial-1"], backTargetCastNames: ["体入 美咲"]
});
recalculate(multiDohan);
assert.deepStrictEqual(GmsJson.validatePayload(multiDohan), [], "同伴2名を1名1明細で受理");
assert.strictEqual(multiDohan.transactions[0].items.filter(item => item.category === "dohan").length, 2, "同伴対象人数分の明細を保持");

const missingDohanTarget = GmsJson.clone(initial.payload);
Object.assign(missingDohanTarget.transactions[0].items[2], { castId: "", castName: "", backTargetCastIds: [], backTargetCastNames: [], backType: "", backAllocation: "" });
recalculate(missingDohanTarget);
assert(GmsJson.validatePayload(missingDohanTarget).some((error) => error.includes("同伴料") && error.includes("対象キャストがありません")), "同伴対象なしを拒否");

["staffWork", "expenses", "allowances", "cashReconciliation", "castSalesSummary"].forEach((key) => {
  assert.strictEqual(Object.prototype.hasOwnProperty.call(initial.payload, key), false, `${key}を出力しない`);
});

const duplicateTransaction = GmsJson.clone(initial.payload);
duplicateTransaction.transactions.push(GmsJson.clone(duplicateTransaction.transactions[0]));
recalculate(duplicateTransaction);
assert(GmsJson.validatePayload(duplicateTransaction).some((error) => error.includes("transactionId") && error.includes("重複")), "transactionId重複を拒否");

const badPayment = GmsJson.clone(initial.payload);
badPayment.transactions[0].splits[0].amount -= 1;
recalculate(badPayment);
assert(GmsJson.validatePayload(badPayment).some((error) => error.includes("splits合計")), "splits不一致を拒否");

const badSales = GmsJson.clone(initial.payload);
badSales.sales.cashSales -= 1;
recalculate(badSales);
assert(GmsJson.validatePayload(badSales).some((error) => error.includes("売上合計")), "売上・決済合計不一致を拒否");

const badHours = GmsJson.clone(initial.payload);
badHours.castWork[0].hours = 4;
recalculate(badHours);
assert(GmsJson.validatePayload(badHours).some((error) => error.includes("在籍 花子") && error.includes("hours")), "勤務時刻とhoursの矛盾を拒否");

const unknownCast = GmsJson.clone(initial.payload);
unknownCast.transactions[0].items[5].banaiExtCastIds = ["missing-cast"];
recalculate(unknownCast);
assert(GmsJson.validatePayload(unknownCast).some((error) => error.includes("missing-cast") && error.includes("識別できません")), "参照キャストID欠損を拒否");

assert.strictEqual(initial.payload.transactions[0].startTime, 1788350400000, "入店時刻を保持");
assert.strictEqual(initial.payload.transactions[0].items[5].isExtension, true, "延長フラグを保持");
assert.strictEqual(initial.payload.transactions[0].splits.length, 2, "決済内訳を保持");
assert.strictEqual(initial.payload.nominations.honShimeiCount, 1, "指名集計を保持");
assert.strictEqual(initial.payload.castWork.length, 3, "出退勤を保持");
assert(initial.payload.transactions[0].items.some((item) => item.category === "champagneWine"), "ボトル明細を保持");
assert(initial.payload.transactions[0].items.some((item) => item.category === "castDrink" && item.castId === "regular-1"), "ドリンク明細と対象キャストを保持");
[
  "schema", "schemaVersion", "businessDate", "status", "sales", "customers", "nominations", "transactions",
  "castSales", "castWork", "rosterSnapshot", "lifecycleEvents", "source", "submissionId", "generatedAt",
  "checksumAlgorithm", "checksumCanonicalization", "checksum"
].forEach((key) => assert(Object.prototype.hasOwnProperty.call(initial.payload, key), `${key}を保持`));

const previous = {
  schemaVersion: 3,
  submissionId: initial.payload.submissionId,
  generatedAt: initial.payload.generatedAt,
  checksum: initial.payload.checksum,
  contentHash: initial.meta.contentHash,
  payload: GmsJson.clone(initial.payload)
};
const repeated = prepare(basePayload(), previous, { nonce: 2 });
assert.strictEqual(repeated.meta.reused, true, "同じv3内容は完成済みpayloadを再利用");
assert.deepStrictEqual(repeated.payload, initial.payload);
const correction = prepare(basePayload({ sales: { ...basePayload().sales, totalSales: 50001, cashSales: 20001 } }), previous, { correction: true, nonce: 3 });
assert.strictEqual(correction.payload.supersedesSubmissionId, initial.payload.submissionId, "訂正版は訂正元を保持");

const roster = GmsJson.createRosterSnapshot([
  { id: "r", name: "在籍", castType: "regular" },
  { id: "t", name: "体入", castType: "trial" },
  { id: "d", name: "派遣", castType: "dispatch" }
], "2026-09-02T18:00:00.000Z", true);
assert.deepStrictEqual(roster.casts.map(({ castType, isTrial }) => ({ castType, isTrial })), [
  { castType: "regular", isTrial: false },
  { castType: "trial", isTrial: true },
  { castType: "dispatch", isTrial: false }
]);

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
assert(appSource.includes("schema:\"club-genesis-pos-closing\",schemaVersion:3"), "POS本体がschemaVersion 3を生成");
assert(appSource.includes("GMS_JSON.prepareSubmission"), "POS本体が共通提出処理を使用");
assert(appSource.includes("GMS_JSON.validatePayload"), "ダウンロード前に共通検証処理を使用");
assert(appSource.includes("backAllocation:\"single\""), "注文時に単一対象を明示保存");
assert(appSource.includes('backAllocation:selected.length>1?"equal"'), "複数ボトル対象を均等分配で保存");
assert(appSource.includes("gmsCastTypeSourceErrors"), "元データの区分不一致も出力前に検査");
assert.doesNotMatch(appSource.slice(appSource.indexOf("function gmsClosingBasePayload"), appSource.indexOf("function gmsClosingPayload")), /staffWork|expenses|allowances|cashReconciliation|castSalesSummary/, "不要項目をベースpayloadに含めない");

if (process.env.PRINT_GMS_V3_SAMPLE === "1") console.log(`GMS_SAMPLE_JSON:${JSON.stringify(initial.payload, null, 2)}`);

console.log("gms-json-v3 production-core tests passed");
