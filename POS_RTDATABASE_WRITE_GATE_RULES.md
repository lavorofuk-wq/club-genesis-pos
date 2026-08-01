# POS Realtime Database 書き戻し防止ルール

古いiPadなどに残った旧POSコードが、キャッシュ済みの古い状態を `pos` / `pos-dev` に書き戻すことを防ぐための Realtime Database ルールです。

POS Ver6.65 以降は、POSデータを書き込むたびに `_writeGate` を同時更新します。Firebase側で `_writeGate` の更新を必須にすると、旧POSからの直接書き込みは拒否されます。

POS Ver6.108 以降は、通常の注文保存に限り `sessions/{tableId}` を個別トランザクションで更新します。POS Ver6.109 以降は、単独の出退勤編集と付け回し種別編集も `shifts/{shiftId}` / `assignments/{assignmentId}` 単位で更新します。各保存で `_rev`、`_nodeWriteVersion`、`_nodeWriteNonce` を更新するため、古い画面が保持した値による上書きは拒否されます。会計・テーブル移動・付け回し開始・終了など複数データを同時更新する処理は、従来どおり `_writeGate` 付きの一括トランザクションを使用します。

下記ルールを適用する前でも、Ver6.109は個別保存の権限エラーを検出すると従来の安全なルートトランザクションへ自動的に戻ります。個別保存による競合削減を有効にするには、Realtime Databaseへ下記ルールを適用してください。

重要: `pos` の最低バージョンを `6109` に上げるルールは、Ver6.109をmainへ公開した後に適用してください。dev確認中は `pos-dev` だけを先に更新するか、`pos` の最低バージョンを現在値の `605` のままにしてください。

## ルール例

既存の Realtime Database ルールに認証条件がある場合は、下記を丸ごと置き換えず、`pos` / `pos-dev` の `.write` 条件部分を統合してください。

```json
{
  "rules": {
    ".read": true,
    "pos": {
      ".write": "newData.child('_writeGate/versionNum').val() >= 6109 && newData.child('_writeGate/nonce').isString() && newData.child('_writeGate/nonce').val() != data.child('_writeGate/nonce').val()",
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
      ".write": "newData.child('_writeGate/versionNum').val() >= 6109 && newData.child('_writeGate/nonce').isString() && newData.child('_writeGate/nonce').val() != data.child('_writeGate/nonce').val()",
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

1. POS Ver6.109をmainへ公開します。
2. Firebase Console の Realtime Database ルール画面を開きます。
3. `pos` と `pos-dev` に上記ルールを適用します。
4. 保存後、古いiPadからの更新が「permission_denied」になることを確認します。

このルールを保存するまでは、クライアント側の更新だけでは旧端末の書き戻しを完全には止められません。
