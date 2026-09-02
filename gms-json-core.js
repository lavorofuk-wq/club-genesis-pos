(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GmsJsonCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CHECKSUM_ALGORITHM = "sha256";
  const CHECKSUM_CANONICALIZATION = "recursive-key-sort-v1";
  const VALID_CAST_TYPES = ["regular", "trial", "dispatch"];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function stableHash(text, seed) {
    let hash = seed === undefined ? 2166136261 : seed;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (`00000000${(hash >>> 0).toString(16)}`).slice(-8);
  }

  function stableId(prefix, parts) {
    const text = JSON.stringify(parts || []);
    return `${prefix}_${stableHash(text, 2166136261)}${stableHash(text, 2166136261 ^ 0x9e3779b9)}`;
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== "object") return value;
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }

  function utf8Bytes(text) {
    if (typeof TextEncoder !== "undefined") return Array.from(new TextEncoder().encode(text));
    const encoded = unescape(encodeURIComponent(text));
    return Array.from(encoded, (char) => char.charCodeAt(0));
  }

  function sha256Hex(text) {
    const constants = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    const words = new Int32Array(64);
    const hash = new Int32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);
    const bytes = utf8Bytes(String(text));
    const byteLength = bytes.length;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    const bitLengthHigh = Math.floor(byteLength / 0x20000000);
    const bitLengthLow = (byteLength << 3) >>> 0;
    bytes.push(
      (bitLengthHigh >>> 24) & 0xff, (bitLengthHigh >>> 16) & 0xff,
      (bitLengthHigh >>> 8) & 0xff, bitLengthHigh & 0xff,
      (bitLengthLow >>> 24) & 0xff, (bitLengthLow >>> 16) & 0xff,
      (bitLengthLow >>> 8) & 0xff, bitLengthLow & 0xff
    );
    const rotateRight = (value, amount) => (value >>> amount) | (value << (32 - amount));
    for (let offset = 0; offset < bytes.length; offset += 64) {
      for (let i = 0; i < 16; i += 1) {
        const index = offset + i * 4;
        words[i] = ((bytes[index] << 24) | (bytes[index + 1] << 16) | (bytes[index + 2] << 8) | bytes[index + 3]);
      }
      for (let i = 16; i < 64; i += 1) {
        const s0 = rotateRight(words[i - 15], 7) ^ rotateRight(words[i - 15], 18) ^ (words[i - 15] >>> 3);
        const s1 = rotateRight(words[i - 2], 17) ^ rotateRight(words[i - 2], 19) ^ (words[i - 2] >>> 10);
        words[i] = (words[i - 16] + s0 + words[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = hash;
      for (let i = 0; i < 64; i += 1) {
        const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
        const choice = (e & f) ^ (~e & g);
        const temp1 = (h + s1 + choice + constants[i] + words[i]) | 0;
        const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (s0 + majority) | 0;
        h = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      hash[0] = (hash[0] + a) | 0;
      hash[1] = (hash[1] + b) | 0;
      hash[2] = (hash[2] + c) | 0;
      hash[3] = (hash[3] + d) | 0;
      hash[4] = (hash[4] + e) | 0;
      hash[5] = (hash[5] + f) | 0;
      hash[6] = (hash[6] + g) | 0;
      hash[7] = (hash[7] + h) | 0;
    }
    return Array.from(hash, (value) => (`00000000${(value >>> 0).toString(16)}`).slice(-8)).join("");
  }

  function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
  }

  function closingChecksum(payload) {
    const copy = clone(payload);
    delete copy.checksum;
    return sha256Hex(canonicalJson(copy));
  }

  function contentHash(payload) {
    const copy = clone(payload);
    delete copy.checksum;
    delete copy.submissionId;
    delete copy.generatedAt;
    delete copy.supersedesSubmissionId;
    if (copy.source) {
      delete copy.source.submissionId;
      delete copy.source.posVersion;
    }
    return sha256Hex(canonicalJson(copy));
  }

  function normalizeCastType(value, isTrial, status) {
    if (VALID_CAST_TYPES.includes(value)) return value;
    return isTrial === true || status === "trial" ? "trial" : "regular";
  }

  function createRosterSnapshot(casts, capturedAt, complete) {
    const rows = (casts || []).map((cast) => {
      const castType = normalizeCastType(cast.castType, cast.isTrial, cast.status);
      return {
        castId: String(cast.castId ?? cast.id ?? ""),
        name: String(cast.name ?? cast.castName ?? ""),
        castName: String(cast.castName ?? cast.name ?? ""),
        internalNo: Number(cast.internalNo) || 0,
        status: castType === "trial" ? "trial" : cast.status || (cast.active === false ? "departed" : "active"),
        castType,
        isTrial: castType === "trial"
      };
    });
    return {
      complete: complete === true && rows.every((cast) => !!cast.castId),
      capturedAt: String(capturedAt || ""),
      casts: rows
    };
  }

  function prepareSubmission(basePayload, previous, options) {
    const base = clone(basePayload);
    const prev = previous || {};
    const opts = options || {};
    const hash = contentHash(base);
    if (prev.contentHash === hash && prev.payload) {
      return {
        payload: clone(prev.payload),
        meta: { contentHash: hash, isCorrection: false, requestedCorrection: opts.correction === true, previous: prev, reused: true }
      };
    }
    if (opts.correction === true && !prev.submissionId) return { payload: null, error: "訂正元の提出履歴がありません。" };
    const businessDate = String(base.businessDate || "");
    const submissionId = opts.correction === true
      ? stableId("pos", ["correction", businessDate, hash, prev.submissionId, opts.nonce])
      : stableId("pos", [businessDate, hash]);
    const payload = { ...base, submissionId, generatedAt: String(opts.generatedAt || "") };
    payload.source = { ...(payload.source || {}), submissionId };
    delete payload.source.posVersion;
    if (opts.correction === true) payload.supersedesSubmissionId = String(prev.submissionId);
    payload.checksum = closingChecksum(payload);
    return {
      payload,
      meta: { contentHash: hash, isCorrection: opts.correction === true, requestedCorrection: opts.correction === true, previous: prev, reused: false }
    };
  }

  function castDisplayName(row, id) {
    return String(row?.castName || row?.name || id || "不明なキャスト");
  }

  function registerCastType(claims, errors, row, path, forcedType) {
    const id = String(row?.castId ?? row?.id ?? "");
    if (!id) return;
    const name = castDisplayName(row, id);
    if (row?.castType != null && !VALID_CAST_TYPES.includes(row.castType)) {
      errors.push(`${name} (${id}) の ${path}.castType「${row.castType}」が不正です`);
      return;
    }
    const type = forcedType || normalizeCastType(row?.castType, row?.isTrial, row?.status);
    const expectedTrial = type === "trial";
    if (typeof row?.isTrial === "boolean" && row.isTrial !== expectedTrial) {
      errors.push(`${name} (${id}) の区分が不一致です: ${path}.castType=${type}, isTrial=${row.isTrial}`);
    }
    if (row?.status === "trial" && type !== "trial") errors.push(`${name} (${id}) の区分が不一致です: ${path}.status=trial, castType=${type}`);
    if (forcedType && row?.castType && row.castType !== forcedType) {
      errors.push(`${name} (${id}) の区分が不一致です: ${path}.castType=${row.castType}, 必須区分=${forcedType}`);
    }
    const previous = claims.get(id);
    if (previous && previous.type !== type) errors.push(`${name} (${id}) の区分が不一致です: ${previous.path}=${previous.type}, ${path}=${type}`);
    else if (!previous) claims.set(id, { type, path, name });
  }

  function parseMinutes(value) {
    if (!/^\d{2}:\d{2}$/.test(String(value || ""))) return null;
    const [hours, minutes] = String(value).split(":").map(Number);
    return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
  }

  function calculatedHours(startTime, endTime, breakMinutes) {
    const start = parseMinutes(startTime);
    let end = parseMinutes(endTime);
    if (start == null || end == null) return null;
    if (end < start) end += 1440;
    const breaks = Number(breakMinutes) || 0;
    if (breaks < 0 || breaks > end - start) return null;
    return Math.round(((end - start - breaks) / 60) * 100) / 100;
  }

  function validateBackTarget(item, path, errors, expectedType, label) {
    const ids = Array.isArray(item.backTargetCastIds) ? item.backTargetCastIds.map(String).filter(Boolean) : [];
    const names = Array.isArray(item.backTargetCastNames) ? item.backTargetCastNames.map(String) : [];
    if (!ids.length) {
      errors.push(`${path}「${item.label || label}」に${label}対象キャストがありません。POSの注文明細で対象キャストを設定してください`);
      return;
    }
    if (names.length !== ids.length || names.some((name) => !name.trim())) errors.push(`${path}「${item.label || label}」の対象キャスト名がIDと対応していません`);
    if (!String(item.castId || "")) errors.push(`${path}.castId が空です（${label}対象キャストを設定してください）`);
    if (!String(item.castName || "").trim()) errors.push(`${path}.castName が空です（${label}対象キャスト名を設定してください）`);
    if (ids.length === 1 && String(item.castId || "") !== ids[0]) errors.push(`${path}.castId と backTargetCastIds[0] が一致しません`);
    if (item.backType !== expectedType) errors.push(`${path}.backType は「${expectedType}」である必要があります`);
    if (ids.length === 1 && item.backAllocation !== "single") errors.push(`${path}.backAllocation は「single」である必要があります`);
    if (ids.length > 1 && item.backAllocation !== "equal") errors.push(`${path}.backAllocation は複数対象の均等分配を示す「equal」である必要があります`);
  }

  function uniqueCastIds(values) {
    return [...new Set((values || []).filter((value) => value != null && value !== "").map(String))];
  }

  function sameCastIdSet(left, right) {
    const a = uniqueCastIds(left);
    const b = uniqueCastIds(right);
    return a.length === b.length && a.every((id) => b.includes(id));
  }

  function bottleBackEligibleCastIds(items, itemIndex) {
    const source = (items || []).filter(Boolean);
    const honShimeiIds = uniqueCastIds(source.filter((item) => item.isHonShimei).map((item) => item.castId));
    if (honShimeiIds.length) return honShimeiIds;
    let currentIds = [];
    const end = Math.max(0, Math.min(source.length, Number(itemIndex) || 0));
    for (let index = 0; index < end; index += 1) {
      const item = source[index];
      if (item.isBanaiExtension) currentIds = uniqueCastIds([...(item.banaiExtCastIds || []), item.banaiExtCastId, item.castId]);
    }
    return currentIds;
  }

  function validatePayload(payload) {
    const errors = [];
    const validIso = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));
    if (!payload || typeof payload !== "object") return ["JSONデータを作成できませんでした"];
    if (payload.schema !== "club-genesis-pos-closing") errors.push("schema が不正です");
    if (payload.schemaVersion !== 3) errors.push("schemaVersion は 3 である必要があります");
    if (!String(payload.submissionId || "").trim()) errors.push("submissionId が空です");
    if (!validIso(payload.generatedAt)) errors.push("generatedAt がISO 8601形式ではありません");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.businessDate || "")) errors.push("businessDate がYYYY-MM-DD形式ではありません");
    if (payload.checksumAlgorithm !== CHECKSUM_ALGORITHM) errors.push(`checksumAlgorithm は「${CHECKSUM_ALGORITHM}」である必要があります`);
    if (payload.checksumCanonicalization !== CHECKSUM_CANONICALIZATION) errors.push(`checksumCanonicalization は「${CHECKSUM_CANONICALIZATION}」である必要があります`);
    ["staffWork", "expenses", "allowances", "cashReconciliation", "castSalesSummary"].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(payload, key)) errors.push(`${key} はGMS取込JSONに含めないでください`);
    });
    ["sales", "customers", "nominations", "rosterSnapshot", "source"].forEach((key) => {
      if (!payload[key] || typeof payload[key] !== "object" || Array.isArray(payload[key])) errors.push(`${key} が不正です`);
    });
    ["transactions", "castSales", "castWork", "enteredCasts", "exitedCasts", "trialCasts", "lifecycleEvents"].forEach((key) => {
      if (!Array.isArray(payload[key])) errors.push(`${key} は配列である必要があります`);
    });

    const totalSales = Number(payload.sales?.totalSales);
    const paymentSales = Number(payload.sales?.cashSales) + Number(payload.sales?.cardSales);
    if (Number.isFinite(totalSales) && Number.isFinite(paymentSales) && totalSales !== paymentSales) {
      errors.push(`売上合計 ${totalSales}円 と現金・カード合計 ${paymentSales}円が一致しません`);
    }

    const castClaims = new Map();
    (payload.castWork || []).forEach((row, index) => {
      const path = `castWork[${index}]`;
      if (!row.castId) errors.push(`${path}.castId が空です`);
      registerCastType(castClaims, errors, row, path);
      const expectedHours = calculatedHours(row.startTime, row.endTime, row.breakMinutes);
      if (expectedHours == null) errors.push(`${path}「${castDisplayName(row, row.castId)}」の開始・終了時刻または休憩時間が不正です`);
      else if (Math.abs(Number(row.hours) - expectedHours) > 0.001) errors.push(`${path}「${castDisplayName(row, row.castId)}」のhours=${row.hours}は開始・終了時刻から計算した${expectedHours}時間と一致しません`);
    });
    ["enteredCasts", "exitedCasts"].forEach((key) => {
      (payload[key] || []).forEach((row, index) => {
        if (!row.castId) errors.push(`${key}[${index}].castId が空です`);
        registerCastType(castClaims, errors, row, `${key}[${index}]`);
      });
    });
    (payload.trialCasts || []).forEach((row, index) => {
      if (!row.castId) errors.push(`trialCasts[${index}].castId が空です`);
      registerCastType(castClaims, errors, row, `trialCasts[${index}]`, "trial");
    });
    (payload.castSales || []).forEach((row, index) => {
      if (!row.castId) errors.push(`castSales[${index}].castId が空です`);
      if (row.castType != null || row.isTrial != null) registerCastType(castClaims, errors, row, `castSales[${index}]`);
    });

    if (payload.rosterSnapshot) {
      if (typeof payload.rosterSnapshot.complete !== "boolean") errors.push("rosterSnapshot.complete はbooleanである必要があります");
      if (!validIso(payload.rosterSnapshot.capturedAt)) errors.push("rosterSnapshot.capturedAt がISO 8601形式ではありません");
      if (!Array.isArray(payload.rosterSnapshot.casts)) errors.push("rosterSnapshot.casts は配列である必要があります");
      (payload.rosterSnapshot.casts || []).forEach((cast, index) => {
        if (!cast.castId) errors.push(`rosterSnapshot.casts[${index}].castId が空です`);
        registerCastType(castClaims, errors, cast, `rosterSnapshot.casts[${index}]`);
      });
    }

    const eventIds = new Set();
    (payload.lifecycleEvents || []).forEach((event, index) => {
      const path = `lifecycleEvents[${index}]`;
      if (!event.eventId) errors.push(`${path}.eventId が空です`);
      if (eventIds.has(event.eventId)) errors.push(`${path}.eventId が重複しています`);
      eventIds.add(event.eventId);
      if (!["entered", "departed", "trial"].includes(event.eventType)) errors.push(`${path}.eventType が不正です`);
      if (!event.castId) errors.push(`${path}.castId が空です`);
      if (!validIso(event.eventAt)) errors.push(`${path}.eventAt がISO 8601形式ではありません`);
      registerCastType(castClaims, errors, event, path, event.eventType === "trial" ? "trial" : undefined);
    });

    const knownCastIds = new Set([
      ...(payload.castWork || []), ...(payload.castSales || []),
      ...(payload.enteredCasts || []), ...(payload.exitedCasts || []), ...(payload.trialCasts || []),
      ...(payload.rosterSnapshot?.casts || []), ...(payload.lifecycleEvents || [])
    ].map((row) => String(row?.castId || "")).filter(Boolean));
    const transactionIds = new Set();
    (payload.transactions || []).forEach((transaction, transactionIndex) => {
      const transactionPath = `transactions[${transactionIndex}]`;
      const transactionId = String(transaction.transactionId || "");
      if (!transactionId) errors.push(`${transactionPath}.transactionId が空です`);
      if (transactionIds.has(transactionId)) errors.push(`${transactionPath}.transactionId「${transactionId}」が重複しています`);
      transactionIds.add(transactionId);
      if (!Array.isArray(transaction.splits)) errors.push(`${transactionPath}.splits は配列である必要があります`);
      else {
        const splitTotal = transaction.splits.reduce((sum, split) => sum + Number(split?.amount || 0), 0);
        if (splitTotal !== Number(transaction.total)) errors.push(`${transactionPath}「${transactionId}」のsplits合計 ${splitTotal}円 とtotal ${transaction.total}円が一致しません`);
      }
      if (!Array.isArray(transaction.items)) {
        errors.push(`${transactionPath}.items は配列である必要があります`);
        return;
      }
      transaction.items.forEach((item, itemIndex) => {
        const path = `${transactionPath}.items[${itemIndex}]`;
        if ((item.isHonShimei || item.isBanaiShimei || item.category === "castDrink") && !item.castId) errors.push(`${path}.castId が空です`);
        const referencedIds = [item.castId, ...(item.banaiExtCastIds || []), ...(item.backTargetCastIds || [])].map(String).filter(Boolean);
        referencedIds.forEach((id) => {
          if (!knownCastIds.has(id)) errors.push(`${path}「${item.label || item.itemId}」の参照キャストID「${id}」を出力データ内で識別できません`);
        });
        (item.banaiExtCastIds || []).forEach((id, index) => { if (!id) errors.push(`${path}.banaiExtCastIds[${index}] が空です`); });
        (item.backTargetCastIds || []).forEach((id, index) => { if (!id) errors.push(`${path}.backTargetCastIds[${index}] が空です`); });
        const amount = Number(item.price || 0) * Number(item.quantity || 0);
        if ((item.category === "champagneWine" || item.category === "keepBottle") && amount >= 1) {
          const eligibleCastIds = bottleBackEligibleCastIds(transaction.items, itemIndex);
          const targetCastIds = uniqueCastIds(item.backTargetCastIds || []);
          if (eligibleCastIds.length) {
            validateBackTarget(item, path, errors, item.category, "ボトルバック");
            if (!sameCastIdSet(targetCastIds, eligibleCastIds)) errors.push(`${path}「${item.label || item.itemId}」のボトルバック対象は本指名・場内延長の売上対象キャスト全員である必要があります`);
          } else if (targetCastIds.length || item.castId || item.castName || item.backType || item.backAllocation) {
            errors.push(`${path}「${item.label || item.itemId}」は本指名・場内延長の売上対象外のため、ボトルバック対象を設定できません`);
          }
        }
        if (item.category === "dohan") validateBackTarget(item, path, errors, "dohan", "同伴");
      });
    });
    validateFiniteNumbers(payload, "payload", errors);
    if (!/^[0-9a-f]{64}$/.test(String(payload.checksum || ""))) errors.push("checksum は64文字の小文字SHA-256形式である必要があります");
    else if (payload.checksum !== closingChecksum(payload)) errors.push("checksum がSHA-256再計算結果と一致しません");
    return [...new Set(errors)];
  }

  function validateFiniteNumbers(value, path, errors) {
    if (value == null) return;
    if (typeof value === "number" && !Number.isFinite(value)) errors.push(`${path} の数値が不正です`);
    else if (Array.isArray(value)) value.forEach((item, index) => validateFiniteNumbers(item, `${path}[${index}]`, errors));
    else if (typeof value === "object") Object.keys(value).forEach((key) => validateFiniteNumbers(value[key], `${path}.${key}`, errors));
  }

  return {
    CHECKSUM_ALGORITHM,
    CHECKSUM_CANONICALIZATION,
    clone,
    stableHash,
    stableId,
    canonicalize,
    canonicalJson,
    sha256Hex,
    closingChecksum,
    contentHash,
    normalizeCastType,
    createRosterSnapshot,
    prepareSubmission,
    validatePayload
  };
});
