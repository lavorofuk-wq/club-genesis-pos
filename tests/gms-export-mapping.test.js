const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const GMS_JSON = require("../gms-json-core.js");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const source = app.slice(app.indexOf("function gmsInt"), app.indexOf("function gmsLocalMeta"));
const targetEditSource = app.slice(app.indexOf("function gmsEscapeHtml"), app.indexOf("function exportDayCSV"));
const casts = [
  { id: "regular-1", name: "在籍 花子", castType: "regular", isTrial: false },
  { id: "trial-1", name: "体入 美咲", castType: "trial", isTrial: true },
  { id: "dispatch-1", name: "派遣 葵", castType: "dispatch", isTrial: false }
];
const context = {
  GMS_JSON,
  S: { casts, castLifecycleLogs: {} },
  allCasts: () => casts,
  cloneData: value => value == null ? null : JSON.parse(JSON.stringify(value)),
  normalizeCastType: GMS_JSON.normalizeCastType,
  roomTypeFromItem: () => "",
  Map,
  Set,
  Date,
  Math,
  Number,
  String,
  Object,
  Array,
  console
};
vm.createContext(context);
vm.runInContext(source, context);
vm.runInContext(targetEditSource, context);

const newDohanItems = context.buildDohanChargeItems([casts[0], casts[1]], 3000, 12345);
assert.strictEqual(newDohanItems.length, 2, "新規同伴2名に同伴料を2本作成");
assert.deepStrictEqual(newDohanItems.map(item => item.backTargetCastIds[0]), ["regular-1", "trial-1"], "新規同伴料を各対象キャストへ紐付け");
assert(newDohanItems.every(item => item.qty === 1 && item.backAllocation === "single"), "同伴料は1名1明細で保存");

const rawItems = [
  {
    id: "champagne_1",
    label: "シャンパン",
    category: "champagneWine",
    price: 30000,
    qty: 1,
    castId: "trial-1",
    castName: "体入 美咲",
    backTargetCastIds: ["trial-1"],
    backTargetCastNames: ["体入 美咲"],
    backType: "champagneWine",
    backAllocation: "single"
  },
  {
    id: "keep_0",
    label: "キープ利用",
    category: "keepBottle",
    price: 0,
    qty: 1
  },
  {
    id: "dh",
    label: "同伴料",
    category: "dohan",
    price: 3000,
    qty: 1,
    castId: "regular-1",
    castName: "在籍 花子",
    backTargetCastIds: ["regular-1"],
    backTargetCastNames: ["在籍 花子"],
    backType: "dohan",
    backAllocation: "single"
  },
  {
    id: "ext_1",
    label: "延長30分",
    price: 4000,
    qty: 1,
    isExtension: true,
    banaiExtCastIds: ["dispatch-1"]
  },
  {
    id: "cd_1",
    label: "キャストDrink (在籍 花子)",
    category: "castDrink",
    price: 2000,
    qty: 1,
    castId: "regular-1",
    castName: "在籍 花子",
    backTargetCastIds: ["regular-1"],
    backTargetCastNames: ["在籍 花子"],
    backType: "castDrink",
    backAllocation: "orderedCast"
  },
  {
    id: "hs_trial",
    label: "本指名料 (体入 美咲)",
    price: 2000,
    qty: 1,
    castId: "trial-1",
    castName: "体入 美咲",
    isHonShimei: true
  }
];

const mapped = context.gmsTransactionItems(rawItems);
assert.deepStrictEqual(Array.from(mapped[0].backTargetCastIds), ["trial-1"], "注文時に選択したボトル対象IDを出力");
assert.deepStrictEqual(Array.from(mapped[0].backTargetCastNames), ["体入 美咲"], "注文時に保存した対象名を維持");
assert.strictEqual(mapped[0].castId, "trial-1");
assert.strictEqual(mapped[0].backType, "champagneWine");
assert.strictEqual(mapped[0].backAllocation, "single");
assert.deepStrictEqual(Array.from(mapped[1].backTargetCastIds), [], "0円キープは対象なしで出力可能");
assert.strictEqual(mapped[2].castId, "regular-1", "明示登録した同伴キャストを出力");
assert.strictEqual(mapped[2].backType, "dohan");
assert.strictEqual(mapped[3].isExtension, true, "延長フラグを維持");
assert.deepStrictEqual(Array.from(mapped[3].banaiExtCastIds), ["dispatch-1"], "延長対象キャストを維持");
assert.strictEqual(mapped[4].category, "castDrink", "キャストドリンク分類を維持");
assert.deepStrictEqual(Array.from(mapped[4].backTargetCastIds), ["regular-1"], "キャストドリンク対象を維持");

const multiBottle = context.gmsTransactionItems([
  {
    ...rawItems[0],
    castId: "regular-1",
    castName: "在籍 花子",
    backTargetCastIds: ["regular-1", "trial-1"],
    backTargetCastNames: ["在籍 花子", "体入 美咲"],
    backAllocation: "equal"
  },
  { id: "hs_regular", label: "本指名料 (在籍 花子)", price: 2000, qty: 1, castId: "regular-1", castName: "在籍 花子", isHonShimei: true },
  { id: "hs_trial", label: "本指名料 (体入 美咲)", price: 2000, qty: 1, castId: "trial-1", castName: "体入 美咲", isHonShimei: true }
])[0];
assert.deepStrictEqual(Array.from(multiBottle.backTargetCastIds), ["regular-1", "trial-1"], "複数ボトルバック対象を全員出力");
assert.deepStrictEqual(Array.from(multiBottle.backTargetCastNames), ["在籍 花子", "体入 美咲"], "複数対象名をID順に出力");
assert.strictEqual(multiBottle.castId, "regular-1", "複数対象時も代表castIdは配列先頭と一致");
assert.strictEqual(multiBottle.backAllocation, "equal", "複数ボトルバックを均等分配として出力");

const freeBottle = context.gmsTransactionItems([rawItems[0]])[0];
assert.deepStrictEqual(Array.from(freeBottle.backTargetCastIds), [], "本指名・場内延長がない有料ボトルはバック対象外");
assert.strictEqual(freeBottle.castId, "", "バック対象外ボトルのcastIdを出力しない");
assert.strictEqual(freeBottle.backType, "", "バック対象外ボトルのbackTypeを出力しない");

const banaiBottle = context.gmsTransactionItems([
  { id: "ext_banai", label: "延長30分", price: 4000, qty: 1, isExtension: true, isBanaiExtension: true, banaiExtCastIds: ["regular-1", "dispatch-1"] },
  { ...rawItems[0], castId: "regular-1", castName: "在籍 花子", backTargetCastIds: ["regular-1", "dispatch-1"], backTargetCastNames: ["在籍 花子", "派遣 葵"], backAllocation: "equal" }
])[1];
assert.deepStrictEqual(Array.from(banaiBottle.backTargetCastIds), ["regular-1", "dispatch-1"], "場内延長後のボトルは延長売上対象キャストへ出力");
assert.strictEqual(banaiBottle.backAllocation, "equal", "場内延長対象が複数なら均等分配");

const orderSource = app.slice(app.indexOf("function odq"), app.indexOf("function ofdq"));
context.S.menus = { drinks: [], champagne: [{ id: "cw-menu", label: "シャンパン", price: 30000 }], keepBottles: [] };
context.S.sessions = { t1: { items: [] } };
context.at = "t1";
context.qv = 1;
context.qm = null;
context.md = null;
context.modalRenders = 0;
context.qtyOpens = 0;
context.rModal = () => { context.modalRenders += 1; };
context.om = name => { if(name === "qty")context.qtyOpens += 1; };
context.alert = message => { throw new Error(message); };
vm.runInContext(orderSource, context);

vm.runInContext("odq('cw-menu')", context);
assert.strictEqual(context.qtyOpens, 1, "フリー卓の有料ボトルはキャスト選択なしで数量選択へ進む");
assert.strictEqual(context.modalRenders, 0, "フリー卓ではボトルバック選択画面を開かない");
assert.strictEqual(context.qm.itemData, undefined, "フリー卓のボトルにバック対象を保存しない");

context.S.sessions.t1.items = [
  { id: "hs-r", isHonShimei: true, castId: "regular-1" },
  { id: "hs-t", isHonShimei: true, castId: "trial-1" }
];
vm.runInContext("odq('cw-menu')", context);
assert.strictEqual(context.md, "liquor-target", "本指名売上対象がいる場合だけ選択画面を開く");
assert.deepStrictEqual(Array.from(context.qm.itemData.backTargetCastIds), ["regular-1", "trial-1"], "複数本指名を初期選択して均等分配する");

context.S.sessions.t1.items = [{ id: "banai-only", isBanaiShimei: true, castId: "dispatch-1" }];
context.modalRenders = 0;
context.qtyOpens = 0;
vm.runInContext("odq('cw-menu')", context);
assert.strictEqual(context.qtyOpens, 1, "場内指名のみで未延長ならキャスト選択を行わない");
assert.strictEqual(context.modalRenders, 0, "場内指名のみではボトルバック選択画面を開かない");

context.S.sessions.t1.items = [{ id: "banai-ext", isExtension: true, isBanaiExtension: true, banaiExtCastIds: ["regular-1", "dispatch-1"] }];
vm.runInContext("odq('cw-menu')", context);
assert.strictEqual(context.md, "liquor-target", "場内延長後はボトルバック選択画面を開く");
assert.deepStrictEqual(Array.from(context.qm.itemData.backTargetCastIds), ["regular-1", "dispatch-1"], "場内延長売上対象全員を初期選択する");

const transaction = context.gmsTransactions([{
  id: "tx-1",
  tableId: "t1",
  tableLabel: "テーブル 1",
  startTime: 1788350400000,
  endTime: 1788361200000,
  guests: 2,
  payMethod: "card",
  subtotal: 37000,
  discount: 0,
  tax: 0,
  total: 37000,
  items: rawItems
}])[0];
assert.deepStrictEqual(JSON.parse(JSON.stringify(transaction.splits)), [{ method: "card", amount: 37000 }], "旧会計もsplits合計がtotalと一致する形で出力");
assert.strictEqual(transaction.startTime, 1788350400000, "入店時刻を維持");

context.S.castLifecycleLogs["2026-09-02"] = {
  enteredCasts: [{ castId: "regular-1", castName: "在籍 花子", castType: "regular", isTrial: false }],
  exitedCasts: [],
  trialCasts: [{ castId: "trial-1", castName: "体入 美咲", castType: "trial", isTrial: true }]
};
const day = {
  date: "2026-09-02",
  endedAt: new Date("2026-09-03T02:00:00+09:00").getTime(),
  rosterSnapshot: {
    complete: true,
    capturedAt: "2026-09-03T02:00:00+09:00",
    casts: [
      { castId: "regular-1", castName: "在籍 花子", castType: "regular", isTrial: false, status: "active" },
      { castId: "trial-1", castName: "体入 美咲", castType: "trial", isTrial: true, status: "trial" },
      { castId: "dispatch-1", castName: "派遣 葵", castType: "dispatch", isTrial: false, status: "active" }
    ]
  },
  shifts: {
    r: { castId: "regular-1", castName: "在籍 花子", castType: "regular", isTrial: false, clockIn: new Date("2026-09-02T20:00:00+09:00").getTime(), clockOut: new Date("2026-09-03T01:00:00+09:00").getTime() },
    t: { castId: "trial-1", castName: "体入 美咲", clockIn: new Date("2026-09-02T20:30:00+09:00").getTime(), clockOut: new Date("2026-09-03T00:30:00+09:00").getTime() },
    d: { castId: "dispatch-1", castName: "派遣 葵", castType: "dispatch", isTrial: false, clockIn: new Date("2026-09-02T21:00:00+09:00").getTime(), clockOut: new Date("2026-09-03T02:00:00+09:00").getTime() }
  }
};
const work = context.gmsCastWork(day, "2026-09-02");
assert.deepStrictEqual(work.map(({ castType, isTrial }) => ({ castType, isTrial })), [
  { castType: "regular", isTrial: false },
  { castType: "trial", isTrial: true },
  { castType: "dispatch", isTrial: false }
], "保存済み名簿を使って体入をregularへ誤変換しない");

const mismatchedDay = JSON.parse(JSON.stringify(day));
mismatchedDay.shifts.t.castType = "regular";
mismatchedDay.shifts.t.isTrial = false;
const errors = context.gmsCastTypeSourceErrors(mismatchedDay, "2026-09-02");
assert(errors.some((error) => error.includes("体入 美咲") && error.includes("区分が不一致")), "元データ内の区分不一致も名前付きで検出");

const closedRecord = {
  id: "closed-1", tableId: "t1", tableLabel: "テーブル 1", total: 39000, payMethod: "cash",
  items: [
    { id: "dh", label: "同伴料", price: 3000, qty: 2 },
    { id: "cw-old", label: "シャンパン", category: "champagneWine", price: 30000, qty: 1 },
    { id: "keep-use", label: "キープ利用", category: "keepBottle", price: 0, qty: 1 },
    { id: "hs_regular", label: "本指名料 (在籍 花子)", price: 2000, qty: 1, castId: "regular-1", castName: "在籍 花子", isHonShimei: true },
    { id: "hs_dispatch", label: "本指名料 (派遣 葵)", price: 2000, qty: 1, castId: "dispatch-1", castName: "派遣 葵", isHonShimei: true }
  ]
};
const closedDay = { ...day, id: "2026-09-02", history: [closedRecord], assignments: {} };
const candidates = context.gmsTargetCandidates(closedDay, closedRecord);
const applied = context.gmsApplyTargetSelections(closedRecord, {
  dohan: ["regular-1", "trial-1"],
  item_1: ["regular-1", "dispatch-1"]
}, candidates);
assert.deepStrictEqual(Array.from(applied.errors), [], "締め済み明細へ対象キャストを手動設定できる");
assert.strictEqual(applied.record.total, closedRecord.total, "対象修正で会計合計を変えない");
assert.strictEqual(applied.record.payMethod, closedRecord.payMethod, "対象修正で決済を変えない");
const repairedDohan = applied.record.items.filter(item => item.category === "dohan");
assert.strictEqual(repairedDohan.length, 2, "同伴料2本を1名1明細へ分割");
assert.deepStrictEqual(Array.from(repairedDohan, item => item.backTargetCastIds[0]), ["regular-1", "trial-1"], "同伴2名を各同伴料へ明示");
assert.strictEqual(repairedDohan.reduce((sum, item) => sum + item.price * item.qty, 0), 6000, "同伴料総額を維持");
const repairedBottle = applied.record.items.find(item => item.id === "cw-old");
assert.deepStrictEqual(Array.from(repairedBottle.backTargetCastIds), ["regular-1", "dispatch-1"], "締め済みボトルへ複数対象を保存");
assert.strictEqual(repairedBottle.backAllocation, "equal", "締め済みボトルも均等分配");
assert.strictEqual(applied.record.items.find(item => item.id === "keep-use").backTargetCastIds, undefined, "0円キープ利用は修正対象外");

const shortDohan = context.gmsApplyTargetSelections(closedRecord, { dohan: ["regular-1"], item_1: ["regular-1"] }, candidates);
assert(shortDohan.errors.some(error => error.includes("2名選択")), "同伴料本数と対象人数の不一致を拒否");
const missingBottle = context.gmsApplyTargetSelections(closedRecord, { dohan: ["regular-1", "trial-1"], item_1: [] }, candidates);
assert(missingBottle.errors.some(error => error.includes("売上対象キャスト全員")), "締め済み有料ボトルの売上対象不足を拒否");

const freeClosedRecord = { id: "free-closed", items: [{ id: "free-bottle", label: "シャンパン", category: "champagneWine", price: 30000, qty: 1 }] };
assert.deepStrictEqual(Array.from(context.gmsTargetEntries(freeClosedRecord)), [], "本指名・場内延長がない締め済みボトルは修正対象にしない");

assert.match(app, /md==="liquor-target"/, "有料ボトル対象キャスト選択UIを持つ");
assert.match(app, /function ciSetDouhanCast/, "同伴キャスト明示選択を持つ");
assert.match(app, /backAllocation:selected\.length>1\?"equal"/, "注文時の複数ボトルバックを均等分配で保存");
assert.match(app, /items\.push\(\.\.\.buildDohanChargeItems\(douhanCasts/, "同伴キャストごとに同伴料明細を作成");
assert.match(app, /md==="gmsTargetEdit"/, "締め済み対象キャスト修正画面を持つ");
assert.match(app, /function gmsBottleBackEligibleCastIds[\s\S]*honIds[\s\S]*isBanaiExtension/, "ボトル対象を本指名・場内延長の売上判定に限定する");
assert.match(app, /function odq[\s\S]*eligibleIds\.length[\s\S]*liquor-target/, "売上対象キャストがいる場合だけボトル選択画面を開く");

console.log("gms export mapping tests passed");
