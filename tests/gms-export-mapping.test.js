const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const GMS_JSON = require("../gms-json-core.js");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const source = app.slice(app.indexOf("function gmsInt"), app.indexOf("function gmsLocalMeta"));
const casts = [
  { id: "regular-1", name: "在籍 花子", castType: "regular", isTrial: false },
  { id: "trial-1", name: "体入 美咲", castType: "trial", isTrial: true },
  { id: "dispatch-1", name: "派遣 葵", castType: "dispatch", isTrial: false }
];
const context = {
  GMS_JSON,
  S: { casts, castLifecycleLogs: {} },
  allCasts: () => casts,
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

assert.match(app, /md==="liquor-target"/, "有料ボトル対象キャスト選択UIを持つ");
assert.match(app, /function ciSetDouhanCast/, "同伴キャスト明示選択を持つ");
assert.doesNotMatch(source.slice(source.indexOf("function gmsTransactionItems"), source.indexOf("function gmsTransactions")), /currentBanaiIds|splitEvenly|singleCast/, "ボトル対象を場内延長から推測しない");

console.log("gms export mapping tests passed");
