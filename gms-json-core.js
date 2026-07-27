(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GmsJsonCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

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

  function closingChecksum(payload) {
    const copy = { ...payload };
    delete copy.checksum;
    const text = JSON.stringify(copy);
    return stableHash(text, 2166136261);
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
    const text = JSON.stringify(copy);
    return `${stableHash(text, 2166136261)}${stableHash(text, 2166136261 ^ 0x9e3779b9)}`;
  }

  function createRosterSnapshot(casts, capturedAt, complete) {
    const rows = (casts || []).map((cast) => ({
      castId: String(cast.castId ?? cast.id ?? ""),
      name: String(cast.name ?? cast.castName ?? ""),
      castName: String(cast.castName ?? cast.name ?? ""),
      internalNo: Number(cast.internalNo) || 0,
      status: cast.status || (cast.castType === "trial" ? "trial" : cast.active === false ? "departed" : "active"),
      castType: cast.castType || "regular"
    }));
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
        meta: {
          contentHash: hash,
          isCorrection: false,
          requestedCorrection: opts.correction === true,
          previous: prev,
          reused: true
        }
      };
    }
    if (opts.correction === true && !prev.submissionId) {
      return { payload: null, error: "訂正元の提出履歴がありません。" };
    }
    const businessDate = String(base.businessDate || "");
    const submissionId = opts.correction === true
      ? stableId("pos", ["correction", businessDate, hash, prev.submissionId, opts.nonce])
      : stableId("pos", [businessDate, hash]);
    const payload = {
      ...base,
      submissionId,
      generatedAt: String(opts.generatedAt || "")
    };
    payload.source = { ...(payload.source || {}), submissionId };
    delete payload.source.posVersion;
    if (opts.correction === true) payload.supersedesSubmissionId = String(prev.submissionId);
    payload.checksum = closingChecksum(payload);
    return {
      payload,
      meta: {
        contentHash: hash,
        isCorrection: opts.correction === true,
        requestedCorrection: opts.correction === true,
        previous: prev,
        reused: false
      }
    };
  }

  function validatePayload(payload) {
    const errors = [];
    const validIso = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));
    if (!payload || typeof payload !== "object") return ["JSONデータを作成できませんでした"];
    if (payload.schema !== "club-genesis-pos-closing") errors.push("schema が不正です");
    if (payload.schemaVersion !== 2) errors.push("schemaVersion は 2 である必要があります");
    if (!String(payload.submissionId || "").trim()) errors.push("submissionId が空です");
    if (!validIso(payload.generatedAt)) errors.push("generatedAt がISO 8601形式ではありません");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.businessDate || "")) errors.push("businessDate がYYYY-MM-DD形式ではありません");
    ["sales", "customers", "nominations", "rosterSnapshot"].forEach((key) => {
      if (!payload[key] || typeof payload[key] !== "object" || Array.isArray(payload[key])) {
        errors.push(`${key} が不正です`);
      }
    });
    ["transactions", "castSales", "castWork", "enteredCasts", "exitedCasts", "trialCasts", "lifecycleEvents"].forEach((key) => {
      if (!Array.isArray(payload[key])) errors.push(`${key} は配列である必要があります`);
    });
    (payload.castSales || []).forEach((row, index) => {
      if (!row.castId) errors.push(`castSales[${index}].castId が空です`);
    });
    (payload.castWork || []).forEach((row, index) => {
      if (!row.castId) errors.push(`castWork[${index}].castId が空です`);
    });
    ["enteredCasts", "exitedCasts", "trialCasts"].forEach((key) => {
      (payload[key] || []).forEach((row, index) => {
        if (!row.castId) errors.push(`${key}[${index}].castId が空です`);
      });
    });
    (payload.transactions || []).forEach((transaction, transactionIndex) => {
      if (!Array.isArray(transaction.items)) {
        errors.push(`transactions[${transactionIndex}].items は配列である必要があります`);
        return;
      }
      transaction.items.forEach((item, itemIndex) => {
        const path = `transactions[${transactionIndex}].items[${itemIndex}]`;
        if ((item.isHonShimei || item.isBanaiShimei || item.category === "castDrink") && !item.castId) {
          errors.push(`${path}.castId が空です`);
        }
        (item.banaiExtCastIds || []).forEach((id, index) => {
          if (!id) errors.push(`${path}.banaiExtCastIds[${index}] が空です`);
        });
        (item.backTargetCastIds || []).forEach((id, index) => {
          if (!id) errors.push(`${path}.backTargetCastIds[${index}] が空です`);
        });
      });
    });
    if (payload.rosterSnapshot) {
      if (typeof payload.rosterSnapshot.complete !== "boolean") {
        errors.push("rosterSnapshot.complete はbooleanである必要があります");
      }
      if (!validIso(payload.rosterSnapshot.capturedAt)) {
        errors.push("rosterSnapshot.capturedAt がISO 8601形式ではありません");
      }
      if (!Array.isArray(payload.rosterSnapshot.casts)) {
        errors.push("rosterSnapshot.casts は配列である必要があります");
      }
      (payload.rosterSnapshot.casts || []).forEach((cast, index) => {
        if (!cast.castId) errors.push(`rosterSnapshot.casts[${index}].castId が空です`);
      });
    }
    const eventIds = new Set();
    (payload.lifecycleEvents || []).forEach((event, index) => {
      if (!event.eventId) errors.push(`lifecycleEvents[${index}].eventId が空です`);
      if (eventIds.has(event.eventId)) errors.push(`lifecycleEvents[${index}].eventId が重複しています`);
      eventIds.add(event.eventId);
      if (!["entered", "departed", "trial"].includes(event.eventType)) {
        errors.push(`lifecycleEvents[${index}].eventType が不正です`);
      }
      if (!event.castId) errors.push(`lifecycleEvents[${index}].castId が空です`);
      if (!validIso(event.eventAt)) errors.push(`lifecycleEvents[${index}].eventAt がISO 8601形式ではありません`);
    });
    validateFiniteNumbers(payload, "payload", errors);
    if (payload.checksum !== closingChecksum(payload)) errors.push("checksum が再計算結果と一致しません");
    return errors;
  }

  function validateFiniteNumbers(value, path, errors) {
    if (value == null) return;
    if (typeof value === "number" && !Number.isFinite(value)) {
      errors.push(`${path} の数値が不正です`);
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => validateFiniteNumbers(item, `${path}[${index}]`, errors));
    } else if (typeof value === "object") {
      Object.keys(value).forEach((key) => validateFiniteNumbers(value[key], `${path}.${key}`, errors));
    }
  }

  return {
    clone,
    stableHash,
    stableId,
    closingChecksum,
    contentHash,
    createRosterSnapshot,
    prepareSubmission,
    validatePayload
  };
});
