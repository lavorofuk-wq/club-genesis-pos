# POS Realtime Database 書き戻し防止ルール

古いiPadなどに残った旧POSコードが、キャッシュ済みの古い状態を `pos` / `pos-dev` に書き戻すことを防ぐための Realtime Database ルールです。

POS Ver6.65 以降は、POSデータを書き込むたびに `_writeGate` を同時更新します。POS Ver6.108 以降は注文を `sessions/{tableId}` 単位、Ver6.109 以降は出退勤と付け回しを `shifts/{shiftId}` / `assignments/{assignmentId}` 単位で競合検出付き保存します。

POS Ver6.133 以降は、`menus`、`tables`、`casts`、`config` の設定保存を小さいマルチパス更新へ分離します。各保存で `_settingsRevisions` と `_settingsWriteMeta` を同時更新し、同じrevisionを元にした二台目の保存をルール側で拒否します。

重要: Ver6.133の確認中は、最初に `pos-dev` だけ最低バージョンを `6133` へ更新してください。`pos` を `6133` へ上げるのは、Ver6.133をmainへ公開し、使用端末の更新を確認した後です。先に本番ルールを上げると旧バージョンからの保存が拒否されます。

## ルール例

既存ルールに認証条件がある場合は丸ごと置き換えず、条件を統合してください。`_settingsRevisions/$key` の検証は、nonceが変わる設定保存ではrevisionが必ず1増えること、同じnonceの再送では値が変わらないことを要求します。

```json
{
  "rules": {
    ".read": true,
    "pos": {
      ".write": "newData.child('_writeGate/versionNum').val() >= 6133 && newData.child('_writeGate/nonce').isString() && newData.child('_writeGate/nonce').val() != data.child('_writeGate/nonce').val()",
      "_settingsRevisions": {
        "$key": {
          ".validate": "newData.isNumber() && ((newData.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').val() == data.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').val() && newData.val() == data.val()) || (newData.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').isString() && newData.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').val() != data.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').val() && newData.val() == (data.isNumber() ? data.val() + 1 : 1)))"
        }
      },
      "sessions": {
        "$tableId": {
          ".write": "newData.exists() && newData.child('_nodeWriteVersion').val() >= 6108 && newData.child('_nodeWriteNonce').isString() && newData.child('_nodeWriteNonce').val() != data.child('_nodeWriteNonce').val() && newData.child('_rev').val() == (data.exists() && data.child('_rev').isNumber() ? data.child('_rev').val() + 1 : 1)"
        }
      },
      "shifts": {
        "$shiftId": {
          ".write": "newData.exists() && newData.child('_nodeWriteVersion').val() >= 6109 && newData.child('_nodeWriteNonce').isString() && newData.child('_nodeWriteNonce').val() != data.child('_nodeWriteNonce').val() && newData.child('_rev').val() == (data.exists() && data.child('_rev').isNumber() ? data.child('_rev').val() + 1 : 1)"
        }
      },
      "assignments": {
        "$assignmentId": {
          ".write": "newData.exists() && newData.child('_nodeWriteVersion').val() >= 6109 && newData.child('_nodeWriteNonce').isString() && newData.child('_nodeWriteNonce').val() != data.child('_nodeWriteNonce').val() && newData.child('_rev').val() == (data.exists() && data.child('_rev').isNumber() ? data.child('_rev').val() + 1 : 1)"
        }
      }
    },
    "pos-dev": {
      ".write": "newData.child('_writeGate/versionNum').val() >= 6133 && newData.child('_writeGate/nonce').isString() && newData.child('_writeGate/nonce').val() != data.child('_writeGate/nonce').val()",
      "_settingsRevisions": {
        "$key": {
          ".validate": "newData.isNumber() && ((newData.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').val() == data.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').val() && newData.val() == data.val()) || (newData.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').isString() && newData.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').val() != data.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').val() && newData.val() == (data.isNumber() ? data.val() + 1 : 1)))"
        }
      },
      "sessions": {
        "$tableId": {
          ".write": "newData.exists() && newData.child('_nodeWriteVersion').val() >= 6108 && newData.child('_nodeWriteNonce').isString() && newData.child('_nodeWriteNonce').val() != data.child('_nodeWriteNonce').val() && newData.child('_rev').val() == (data.exists() && data.child('_rev').isNumber() ? data.child('_rev').val() + 1 : 1)"
        }
      },
      "shifts": {
        "$shiftId": {
          ".write": "newData.exists() && newData.child('_nodeWriteVersion').val() >= 6109 && newData.child('_nodeWriteNonce').isString() && newData.child('_nodeWriteNonce').val() != data.child('_nodeWriteNonce').val() && newData.child('_rev').val() == (data.exists() && data.child('_rev').isNumber() ? data.child('_rev').val() + 1 : 1)"
        }
      },
      "assignments": {
        "$assignmentId": {
          ".write": "newData.exists() && newData.child('_nodeWriteVersion').val() >= 6109 && newData.child('_nodeWriteNonce').isString() && newData.child('_nodeWriteNonce').val() != data.child('_nodeWriteNonce').val() && newData.child('_rev').val() == (data.exists() && data.child('_rev').isNumber() ? data.child('_rev').val() + 1 : 1)"
        }
      }
    },
    "backup": {
      ".write": true
    },
    "backup-dev": {
      ".write": true
    }
  }
}
```

## 適用手順

1. Ver6.133をdevへ公開し、dev端末を更新します。
2. Firebase Consoleで `pos-dev` の最低バージョンと `_settingsRevisions` 検証を適用します。`pos` は変更しません。
3. devで設定保存、連続編集、二端末競合、オフライン復帰を確認します。
4. Ver6.133をmainへ公開し、本番端末の更新を確認します。
5. 最後に `pos` へ同じルールを適用します。

クライアント実装だけでも通常の競合確認は行いますが、読み取り直後に二端末が同時保存する競合を完全に拒否するには、このルールの適用が必要です。
