const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const GMS_JSON = require("../gms-json-core.js");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const clone = value => JSON.parse(JSON.stringify(value));
const businessDate = "2026-09-11";
const castId = "1789127986881";
const otherId = "same-name-different-id";
const clockIn = Date.parse("2026-09-11T20:00:00+09:00");
const clockOut = Date.parse("2026-09-12T00:00:00+09:00");

function sourceBetween(start, end) {
  const first = app.indexOf(start);
  const last = app.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `${start} の生産処理を抽出できる`);
  return app.slice(first, last);
}

function createContext() {
  const context = {
    GMS_JSON,
    S: {},
    cloneData: clone,
    stableJson: value => GMS_JSON.canonicalJson(value === undefined ? null : value),
    normalizeCastType: GMS_JSON.normalizeCastType,
    roomTypeFromItem: () => "",
    localStorage: { getItem: () => null },
    Map, Set, Date, Math, Number, String, Object, Array, JSON, console
  };
  vm.createContext(context);
  [
    ["function normalizeCasts", "function nextCastSortIndex"],
    ["function sessionGrossSubtotal", "function standardChargeFromSubtotal"],
    ["function castNameItemValue", "async function remoteHistoryEntry"],
    ["function gmsEscapeHtml", "function exportDayCSV"],
    ["function gmsInt", "function gmsDownloadPayload"]
  ].forEach(([start, end]) => vm.runInContext(sourceBetween(start, end), context));
  return context;
}

function registeredState(castType) {
  const target = {
    id: castId, name: "仮名", castType, isTrial: castType === "trial",
    active: true, registeredAt: clockIn, internalNo: 11,
    ...(castType === "trial" ? { trialBizDay: businessDate } : {})
  };
  const other = { id: otherId, name: "ルナ", castType: "regular", isTrial: false, active: true, registeredAt: clockIn, internalNo: 12 };
  const lifecycleRow = { ...target, castId, castName: target.name };
  return {
    activeBizDay: businessDate,
    casts: [target, other],
    castLifecycleLogs: {
      [businessDate]: {
        enteredCasts: castType === "trial" ? [] : [lifecycleRow],
        exitedCasts: [],
        trialCasts: castType === "trial" ? [lifecycleRow] : []
      }
    },
    shifts: Object.fromEntries([target, other].map(cast => [cast.id, {
      id: `shift-${cast.id}`, castId: cast.id, castName: cast.name,
      castType: cast.castType, isTrial: cast.isTrial, clockIn, clockOut
    }])),
    assignments: { assigned: { id: "assigned", castId, castName: target.name, tableId: "t1", startTime: clockIn, endTime: clockOut } },
    sessions: {}, history: [], bizDays: {}, gmsTargetCorrections: {}, gmsExportMeta: {}
  };
}

function addOrders(state) {
  const target = state.casts.find(cast => cast.id === castId);
  const other = state.casts.find(cast => cast.id === otherId);
  const named = cast => ({ castId: cast.id, castName: cast.name });
  const back = (casts, backType, backAllocation) => ({
    ...named(casts[0]), backTargetCastIds: casts.map(cast => cast.id),
    backTargetCastNames: casts.map(cast => cast.name), backType, backAllocation
  });
  const record = (id, items) => {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    return {
      id, tableId: id, tableLabel: id, startTime: clockIn + 60000, endTime: clockOut,
      guests: 2, subtotal, discount: 0, tax: 0, total: subtotal,
      payMethod: "cash", splits: [{ method: "cash", amount: 10000 }, { method: "card", amount: subtotal - 10000 }], items
    };
  };
  // 場内延長のIDだけで売上行が先に作られ、その後ドリンク名を読む、実障害と同じ順序。
  state.history = [record("banai-sale", [
    { id: "set", label: "セット", price: 10000, qty: 1, isSet: true },
    { id: "bs-target", label: "場内指名", price: 2000, qty: 1, isBanaiShimei: true, ...named(target) },
    { id: "bs-other", label: "場内指名", price: 2000, qty: 1, isBanaiShimei: true, ...named(other) },
    { id: "extension", label: "延長", price: 12000, qty: 1, isExtension: true, isBanaiExtension: true, banaiExtCastIds: [castId, otherId] },
    { id: "cd-target", label: "キャストドリンク", category: "castDrink", price: 5000, qty: 2, ...back([target], "castDrink", "orderedCast") },
    { id: "champagne", label: "シャンパン", category: "champagneWine", price: 30000, qty: 1, ...back([target, other], "champagneWine", "equal") }
  ])];
  state.sessions = { t2: record("hon-sale", [
    { id: "hon-target", label: "本指名", price: 2000, qty: 1, isHonShimei: true, ...named(target) },
    { id: "hon-other", label: "本指名", price: 2000, qty: 1, isHonShimei: true, ...named(other) },
    { id: "dohan-target", label: "同伴料", category: "dohan", price: 3000, qty: 1, ...back([target], "dohan", "single") },
    { id: "dohan-other", label: "同伴料", category: "dohan", price: 3000, qty: 1, ...back([other], "dohan", "single") },
    { id: "keep", label: "キープボトル", category: "keepBottle", price: 20000, qty: 1, ...back([target, other], "keepBottle", "equal") }
  ]) };
}

function rename(context, state) {
  const plan = context.castNameChangePlan(state, castId, "ルナ", businessDate);
  return { ...state, casts: plan.casts, castLifecycleLogs: plan.lifecycle, sessions: plan.sessions, shifts: plan.shifts, assignments: plan.assignments, history: plan.history };
}

function closeSyntheticDay(state) {
  // 会計後に営業終了が同日記録・名簿を固定し、体入だけ現マスタから外す順序を再現する。
  const closed = clone(state);
  const day = {
    id: businessDate, date: businessDate, startedAt: clockIn, endedAt: clockOut,
    history: [...closed.history, ...Object.values(closed.sessions)],
    shifts: closed.shifts, assignments: closed.assignments,
    rosterSnapshot: GMS_JSON.createRosterSnapshot(closed.casts, new Date(clockOut).toISOString(), true)
  };
  closed.bizDays[businessDate] = day;
  closed.casts = closed.casts.filter(cast => cast.castType !== "trial" || cast.trialBizDay !== businessDate);
  closed.activeBizDay = null;
  closed.sessions = {};
  closed.shifts = {};
  closed.assignments = {};
  closed.history = [];
  return closed;
}

function output(context, closed) {
  context.S = closed;
  const before = clone(closed);
  const payload = clone(context.gmsClosingPayload(businessDate));
  assert.equal(payload._gmsError, undefined, payload._gmsError);
  assert.ok(payload._gmsMeta.contentHash, "実prepareSubmission経路で提出情報を生成する");
  delete payload._gmsMeta;
  assert.deepEqual(GMS_JSON.validatePayload(payload), [], "ダウンロード前の実検証を通る");
  assert.deepEqual(clone(closed), before, "JSON生成が保存済み営業記録を書き換えない");
  return payload;
}

function withoutNamesAndSubmission(value) {
  if (Array.isArray(value)) return value.map(withoutNamesAndSubmission);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["name", "castName", "backTargetCastNames", "checksum", "submissionId"].includes(key))
    .map(([key, entry]) => [key, withoutNamesAndSubmission(entry)]));
}

for (const castType of ["regular", "trial", "dispatch"]) {
  for (const order of ["登録→名前変更→注文", "登録→注文→名前変更"]) {
    test(`${castType}: ${order}→営業終了JSONで同ID・新名・金額を維持`, () => {
      const context = createContext();
      const original = registeredState(castType);
      addOrders(original);
      const baseline = output(context, closeSyntheticDay(original));
      let state = registeredState(castType);
      if (order === "登録→名前変更→注文") {
        state = rename(context, state);
        addOrders(state);
      } else {
        addOrders(state);
        state = rename(context, state);
      }
      const closed = closeSyntheticDay(state);
      if (castType === "trial") assert.ok(!closed.casts.some(cast => cast.id === castId), "営業終了後の体入は現マスタに存在しない");
      const payload = output(context, closed);
      assert.deepEqual(payload.castSales.map(row => row.castId).sort(), [castId, otherId].sort(), "同名2名を別IDの売上行として維持する");
      assert.deepEqual(payload.castWork.map(row => row.castId).sort(), [castId, otherId].sort(), "同名2名を別IDの勤務として維持する");
      for (const key of ["castSales", "castWork", "enteredCasts", "exitedCasts", "trialCasts", "lifecycleEvents"]) {
        assert.ok(payload[key].filter(row => row.castId === castId).every(row => row.castName === "ルナ"), `${key} の対象名が新名になる`);
      }
      const work = payload.castWork.find(row => row.castId === castId);
      assert.equal(work.castType, castType);
      assert.equal(work.isTrial, castType === "trial");
      assert.equal(work.hours, 4);
      assert.equal(payload.rosterSnapshot.casts.find(row => row.castId === castId).name, "ルナ");
      for (const item of payload.transactions.flatMap(transaction => transaction.items)) {
        if (item.castId === castId) assert.equal(item.castName, "ルナ");
        item.backTargetCastIds.forEach((id, index) => {
          if (id === castId) assert.equal(item.backTargetCastNames[index], "ルナ");
        });
      }
      assert.deepEqual(withoutNamesAndSubmission(payload), withoutNamesAndSubmission(baseline), "名前と名前依存のチェックサム・提出ID以外の金額、指名、商品、配賦、勤務を変えない");
      assert.notEqual(payload.checksum, baseline.checksum, "新名を含めてチェックサムを再計算する");
      assert.equal(payload.checksum, GMS_JSON.closingChecksum(payload));
      closed.casts = []; // 退店後も現在のマスタを利用せず、固定された同日記録から再出力する。
      assert.deepEqual(output(context, closed), payload, "退店後の過去日再出力でも新名とデータを維持する");
    });
  }
}

test("通常の営業終了JSON経路は同IDの名前競合を隠さず停止する", () => {
  const context = createContext();
  let state = registeredState("trial");
  addOrders(state);
  state = rename(context, state);
  const closed = closeSyntheticDay(state);
  closed.bizDays[businessDate].history[0].items[1].castName = "仮名";
  context.S = closed;
  const result = context.gmsClosingPayload(businessDate);
  assert.match(result._gmsError, /2026-09-11/);
  assert.match(result._gmsError, /1789127986881/);
  assert.match(result._gmsError, /ルナ/);
  assert.match(result._gmsError, /仮名/);
  assert.match(result._gmsError, /transactions\[0\]\.items\[1\]/);
  assert.equal(result.submissionId, undefined, "矛盾するデータを提出可能なJSONにしない");
});
