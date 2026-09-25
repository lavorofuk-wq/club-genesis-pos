// Usage: node scripts/check-gms-discount-compat.cjs <GMS repo> [git refs...]
// Runs actual POS export and GMS import/calculation code without database access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
assert.ok(process.argv[2], 'Supply the GMS repository path (with dependencies installed).');
const accounting = path.resolve(process.argv[2]);
const refs = process.argv.slice(3);
if (!refs.length) refs.push('origin/main', 'origin/dev');
const accountingRequire = createRequire(path.join(accounting, 'package.json'));
const ts = accountingRequire('typescript');
const git = (...args) => execFileSync('git', args, { cwd: accounting, encoding: 'utf8' }).trimEnd();
const clone = value => JSON.parse(JSON.stringify(value));
const floorTen = value => Math.floor(value / 10) * 10;

function loadGms(ref) {
  const commit = git('rev-parse', '--verify', `${ref}^{commit}`);
  const modules = new Map();
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const source = git('show', `${commit}:${filename}`);
    const compiled = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    });
    const module = { exports: {} };
    modules.set(filename, module);
    const requireAtRef = request => {
      if (!request.startsWith('.')) return accountingRequire(request);
      const relative = path.posix.normalize(path.posix.join(path.posix.dirname(filename), request));
      return load(relative.endsWith('.ts') ? relative : `${relative}.ts`);
    };
    vm.runInThisContext(`(function(require,module,exports){${compiled.outputText}\n})`, {
      filename: `${commit}/${filename}`
    })(requireAtRef, module, module.exports);
    return module.exports;
  }
  return { commit, gms: load('src/domain/gms.ts') };
}

// Reuse the existing closed-day fixture without registering its node:test cases.
const fixturePath = path.join(root, 'tests', 'gms-rename-closing.test.js');
const fixtureSource = fs.readFileSync(fixturePath, 'utf8');
const boundary = fixtureSource.indexOf('for (const castType of');
assert.ok(boundary > 0, 'Closed-day fixture boundary must exist.');
const fixture = vm.createContext({ require: createRequire(fixturePath), __dirname: path.dirname(fixturePath), console });
vm.runInContext(fixtureSource.slice(0, boundary), fixture);

function buildPayload(mode, count, total, repeats, legacy = false) {
  const ctx = createContext();
  const state = registeredState('regular');
  if (count === 3) state.casts.push({ ...state.casts[1], id: 'third-cast', name: 'Cast C', internalNo: 13 });
  state.casts = state.casts.slice(0, count);
  state.shifts = Object.fromEntries(state.casts.map(cast => [cast.id, {
    id: `shift-${cast.id}`, castId: cast.id, castName: cast.name,
    castType: 'regular', isTrial: false, clockIn, clockOut
  }]));
  state.castLifecycleLogs[businessDate].enteredCasts.forEach(row => { row.enteredAt = clockIn; });
  const targets = state.casts;
  const named = cast => ({ castId: cast.id, castName: cast.name });
  const back = (casts, backType) => ({
    ...named(casts[0]), backType,
    backTargetCastIds: casts.map(cast => cast.id), backTargetCastNames: casts.map(cast => cast.name),
    backAllocation: backType === 'castDrink' ? 'orderedCast' : casts.length > 1 ? 'equal' : 'single'
  });
  const nominations = targets.map(cast => ({
    id: `nomination-${cast.id}`, label: mode, price: 2000, qty: 1, ...named(cast),
    ...(mode === 'hon' ? { isHonShimei: true } : { isBanaiShimei: true })
  }));
  const drink = { id: 'drink', label: 'Drink', category: 'castDrink', price: 2000, qty: 1, ...back([targets[0]], 'castDrink') };
  const bottle = { id: 'bottle', label: 'Champagne', category: 'champagneWine', price: 16000, qty: 1, ...back(targets, 'champagneWine') };
  const items = mode === 'hon' ? [
    { id: 'set', label: 'Set', price: 29000 - count * 2000, qty: 1, isSet: true },
    ...nominations,
    { id: 'dohan', label: 'Dohan', category: 'dohan', price: 3000, qty: 1, ...back([targets[0]], 'dohan') },
    drink, bottle
  ] : [
    { id: 'set', label: 'Set', price: 28000 - count * 2000, qty: 1, isSet: true },
    ...nominations, drink,
    { id: 'extension', label: 'Extension', price: 4000, qty: 1, isExtension: true, isBanaiExtension: true, banaiExtCastIds: targets.map(cast => cast.id) },
    bottle
  ];
  const session = { id: 'fixture', tableId: 't1', tableLabel: 'T1', startTime: clockIn + 60000, endTime: clockOut, guests: count, items };
  state.sessions = { t1: session };
  let saves = 0;
  Object.assign(ctx, {
    S: state, at: 't1', TAX_RATE: 0.3, TOTAL_ROUND_UNIT: 100,
    roundCharge: n => Math.ceil(n / 100) * 100, fmt: n => String(n),
    document: { getElementById: () => ({ value: String(total) }) },
    save: () => { saves++; }, closeM: () => {}, renderOrderPartial: () => {}
  });
  vm.runInContext(sourceBetween('function standardChargeFromSubtotal', 'function isV(id)'), ctx);
  vm.runInContext(sourceBetween('function adjustedTotalResult', 'function addSetToSession'), ctx);
  const beforeItems = clone(items);
  assert.equal(ctx.ct(session).total, 65000);
  if (legacy) {
    session.adjustedTotal = total;
    session.adjustedTotalBaseSubtotal = 50000;
  } else {
    ctx.applyAdjustedTotal();
    assert.equal(saves, 1);
  }
  const amounts = clone(ctx.ct(session));
  assert.equal(amounts.total, total);
  assert.equal(amounts.subtotal, legacy ? 38400 : total - 15000);
  assert.equal(amounts.tax, legacy ? 11600 : 15000);
  assert.deepEqual(clone(session.items), beforeItems);
  state.sessions = {};
  state.history = Array.from({ length: repeats }, (_, index) => ({
    ...clone(session), ...amounts, id: `fixture-${index}`, payMethod: 'cash',
    splits: [{ method: 'cash', amount: total * 0.4 }, { method: 'card', amount: total * 0.6 }]
  }));
  ctx.S = closeSyntheticDay(state);
  const beforeState = clone(ctx.S);
  const payload = clone(ctx.gmsClosingPayload(businessDate));
  assert.equal(payload._gmsError, undefined, payload._gmsError);
  delete payload._gmsMeta;
  assert.equal(GMS_JSON.validatePayload(payload).length, 0);
  assert.deepEqual(clone(ctx.S), beforeState, 'Export must not rewrite saved accounts.');
  return payload;
}
vm.runInContext(buildPayload.toString(), fixture);

async function check(gms, mode, count, total, repeats, legacy = false) {
  const payload = clone(vm.runInContext(`buildPayload(${JSON.stringify(mode)},${count},${total},${repeats},${legacy})`, fixture));
  const before = clone(payload);
  const imported = await gms.parsePosClosingV3(payload);
  const subtotal = legacy ? 38400 : total - 15000;
  const tax = legacy ? 11600 : 15000;
  assert.equal(imported.transactions.length, repeats);
  for (const row of imported.transactions) {
    assert.equal(row.subtotal, subtotal);
    assert.equal(row.tax, tax);
    assert.equal(row.discount, 50000 - subtotal);
    assert.equal(row.total, total);
    assert.equal(row.items.reduce((sum, item) => sum + item.price * item.quantity, 0), 50000);
  }
  assert.equal(imported.sales.totalSales, repeats * total);
  assert.equal(imported.sales.taxServiceTotal, repeats * tax);
  assert.equal(imported.sales.discountTotal, repeats * (50000 - subtotal));
  const mapping = Object.fromEntries(imported.castWork.map(row => [row.castId, {
    masterId: row.castId, name: row.castName, kind: row.castType, hourlyRate: 3000
  }]));
  const liquor = [{ kind: 'champagneWine', name: 'Champagne', salePrice: 16000, costPrice: 4000 }];
  const daily = gms.buildDailyCasts(imported, mapping, liquor, {});
  assert.equal(daily.length, count);
  const rawHon = mode === 'hon' ? repeats * Math.floor(subtotal / count) : 0;
  const rawBanai = mode === 'banai' ? repeats * Math.floor(20000 * (subtotal / 50000) / count) : 0;
  for (const row of imported.castSales) {
    assert.equal(row.honShimeiSales, rawHon);
    assert.equal(row.jonaiExtensionSales, rawBanai);
  }
  for (const row of daily) {
    assert.equal(row.honShimeiSales, floorTen(rawHon));
    assert.equal(row.jonaiExtensionSales, floorTen(rawBanai));
    assert.equal(row.bottles.reduce((sum, bottle) => sum + bottle.salesAmount, 0), repeats * 16000 / count);
    assert.equal(row.bottles.reduce((sum, bottle) => sum + bottle.backAmount, 0), repeats * floorTen(3000 / count));
    assert.equal(row.honShimeiCount, mode === 'hon' ? repeats : 0);
    assert.equal(row.banaiShimeiCount, mode === 'banai' ? repeats : 0);
  }
  assert.equal(daily.reduce((sum, row) => sum + row.drinkSales, 0), repeats * 2000);
  assert.equal(daily.flatMap(row => row.drinkAllocations).reduce((sum, row) => sum + row.backAmount, 0), repeats * 200);
  const closing = { id: 'fixture', businessDate: imported.businessDate, status: 'approved', casts: daily, posSnapshot: imported };
  const rewards = gms.calculateCastRewards([closing], [], '2026-09');
  assert.equal(rewards.length, count);
  for (const row of rewards) {
    assert.equal(row.honShimeiSales, floorTen(rawHon));
    assert.equal(row.jonaiExtensionSales, floorTen(rawBanai));
    assert.equal(row.bottleBack, repeats * floorTen(3000 / count));
    assert.equal(row.salesRewardBase, floorTen(Math.max(0, floorTen(rawHon) + floorTen(rawBanai) - repeats * 4000 / count * 0.5)));
  }
  assert.equal(rewards.reduce((sum, row) => sum + row.drinkBack, 0), repeats * 200);
  const cash = gms.calculateCash({
    sales: imported.sales, cashFloat: 10000, expenses: 0, regularDailyPayments: 0, trialDailyPayments: 0,
    staffDailyPayments: 0, driverDailyPayments: 0, dispatchCastPayment: 0, dispatchStaffPayment: 0, dispatchFee: 0,
    actualClosingCash: 10000 + repeats * total * 0.4
  });
  assert.equal(cash.totalSales, repeats * total);
  assert.equal(cash.cashSales, repeats * total * 0.4);
  assert.equal(cash.cardSales, repeats * total * 0.6);
  assert.equal(cash.difference, 0);
  assert.deepEqual(payload, before, 'GMS import/calculation must not rewrite the POS payload.');
  return daily.map(row => ({
    id: row.posCastId, dohanCount: row.dohanCount, dohanBack: row.dohanBack,
    drinkSales: row.drinkSales, drinkBack: row.drinkAllocations.map(item => item.backAmount),
    bottleBack: row.bottles.map(item => item.backAmount), liquorCost: row.liquorCost
  }));
}

async function main() {
  for (const ref of refs) {
    const { commit, gms } = loadGms(ref);
    let cases = 0;
    for (const mode of ['hon', 'banai']) {
      for (const count of [1, 2, 3]) {
        for (const repeats of [1, 2]) {
          let baseline;
          for (const total of [65000, 60000, 50000, 15000]) {
            try {
              const back = await check(gms, mode, count, total, repeats);
              if (baseline) assert.deepEqual(back, baseline, 'Discounts must not change existing back/count/cost rules.');
              else baseline = back;
              cases++;
            } catch (error) {
              throw new Error(`${ref}: ${mode}, casts=${count}, total=${total}, receipts=${repeats}`, { cause: error });
            }
          }
        }
      }
      await check(gms, mode, 2, 50000, 1, true);
      cases++;
    }
    console.log(`${ref} ${commit.slice(0, 12)}: ${cases} cases passed (export, checksum, import, daily/monthly sales, cash, unchanged backs, legacy).`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
