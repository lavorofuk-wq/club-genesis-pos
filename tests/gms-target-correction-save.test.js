const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const GMS_JSON = require("../gms-json-core.js");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const mappingSource = app.slice(app.indexOf("function gmsInt"), app.indexOf("function gmsLocalMeta"));
const targetSource = app.slice(app.indexOf("function gmsEscapeHtml"), app.indexOf("function exportDayCSV"));
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.keys(value).sort().reduce((out, key) => (out[key] = canonical(value[key]), out), {});
  return value;
};

const casts = [
  { id: "c1", name: "みゆ", castType: "regular", isTrial: false },
  { id: "c2", name: "みお", castType: "regular", isTrial: false }
];
const record = {
  id: "sale-1", tableId: "t1", tableLabel: "テーブル 1", startTime: 1000, total: 38000,
  items: [
    { id: "dh", label: "同伴料", category: "dohan", price: 3000, qty: 2 },
    { id: "cw", label: "シャンパン", category: "champagneWine", price: 30000, qty: 1 },
    { id: "hs1", label: "本指名料 (みゆ)", price: 2000, qty: 1, castId: "c1", castName: "みゆ", isHonShimei: true },
    { id: "hs2", label: "本指名料 (みお)", price: 2000, qty: 1, castId: "c2", castName: "みお", isHonShimei: true }
  ]
};
const day = {
  id: "2026-09-02", date: "2026-09-02", endedAt: 2000, history: [clone(record)],
  rosterSnapshot: { casts: casts.map(cast => ({ castId: cast.id, castName: cast.name, castType: cast.castType, isTrial: cast.isTrial })) }
};

const refs = [];
let remoteRecord = clone(record);
let remoteCorrection = null;
const mockDb = { ref: refPath => {
  refs.push(refPath);
  if (refPath === "pos-dev/bizDays/2026-09-02/history/0") return {
    once: async () => ({ val: () => clone(remoteRecord) })
  };
  if (refPath.startsWith("pos-dev/gmsTargetCorrections/2026-09-02/")) return {
    transaction: async updater => {
      const next = updater(clone(remoteCorrection));
      if (next === undefined) return { committed: false, snapshot: { val: () => clone(remoteCorrection) } };
      remoteCorrection = clone(next);
      return { committed: true, snapshot: { val: () => clone(remoteCorrection) } };
    }
  };
  throw new Error("unexpected Firebase path: " + refPath);
}};

const context = {
  GMS_JSON,
  APP_VERSION: "6.140.4",
  FB_ROOT: "pos-dev",
  S: { casts, castLifecycleLogs: {}, bizDays: { "2026-09-02": day }, gmsTargetCorrections: {}, activeBizDay: null },
  window: { _db: mockDb },
  allCasts: () => casts,
  cloneData: clone,
  stableJson: value => JSON.stringify(canonical(value === undefined ? null : value)),
  normalizeCastType: GMS_JSON.normalizeCastType,
  roomTypeFromItem: () => "",
  requireFirebaseReady: () => true,
  isFirebasePermissionDenied: () => false,
  _verNum: value => { const p = String(value || "0").split("."); return parseInt((p[0] || "0").padStart(2, "0") + (p[1] || "0").padStart(2, "0") + (p[2] || "0").padStart(2, "0"), 10); },
  sbs: () => {},
  Map, Set, Date, Math, Number, String, Object, Array, JSON, Promise, console
};
vm.createContext(context);
vm.runInContext(mappingSource, context);
vm.runInContext(targetSource, context);

(async () => {
  const candidates = context.gmsTargetCandidates(day, record);
  const selections = { dohan: ["c1", "c2"], item_1: ["c1", "c2"] };
  const saved = await context.saveGmsTargetCorrection("2026-09-02", record, 0, selections, candidates);

  assert.strictEqual(saved._rev, 1, "初回保存のrevisionは1");
  assert.strictEqual(saved._nodeWriteVersion, 614004, "保存ノードへアプリ版を記録");
  assert.deepStrictEqual(saved.selections, selections, "対象指定だけを小さな専用ノードへ保存");
  assert.deepStrictEqual(context.S.bizDays["2026-09-02"].history[0], record, "営業履歴本体を変更しない");
  assert.strictEqual(refs.length, 2, "対象会計の確認と対象指定の保存だけを行う");
  assert.strictEqual(refs[0], "pos-dev/bizDays/2026-09-02/history/0");
  assert.match(refs[1], /^pos-dev\/gmsTargetCorrections\/2026-09-02\/tx_[0-9a-f]{32}$/);
  assert(!refs.includes("pos-dev"), "POSルート全体を読み書きしない");

  remoteCorrection = { ...clone(remoteCorrection), _rev: 2, selections: { dohan: ["c2", "c1"], item_1: ["c1", "c2"] } };
  await assert.rejects(
    context.saveGmsTargetCorrection("2026-09-02", record, 0, selections, candidates),
    error => error.userMessage.includes("他端末で更新")
  );
  const key = context.gmsTargetCorrectionKey(record, 0);
  assert.strictEqual(context.S.gmsTargetCorrections["2026-09-02"][key]._rev, 2, "競合時は最新の対象指定だけを同期");

  remoteRecord = { ...clone(record), items: clone(record.items).map((item, index) => index === 1 ? { ...item, price: 35000 } : item) };
  const correctionRefsBefore = refs.filter(refPath => refPath.includes("/gmsTargetCorrections/")).length;
  await assert.rejects(
    context.saveGmsTargetCorrection("2026-09-02", record, 0, selections, candidates),
    error => error.userMessage.includes("対象の会計が他端末で更新")
  );
  assert.strictEqual(refs.filter(refPath => refPath.includes("/gmsTargetCorrections/")).length, correctionRefsBefore, "対象会計が変わった場合は保存を開始しない");

  console.log("GMS target correction lightweight save passed");
})().catch(error => { console.error(error); process.exit(1); });
