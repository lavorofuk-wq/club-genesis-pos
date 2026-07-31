# POS Realtime Database 書き戻し防止ルール

古いiPadなどに残った旧POSコードが、キャッシュ済みの古い状態を `pos` / `pos-dev` に書き戻すことを防ぐための Realtime Database ルールです。

POS Ver6.65 以降は、POSデータを書き込むたびに `_writeGate` を同時更新します。Firebase側で `_writeGate` の更新を必須にすると、旧POSからの直接書き込みは拒否されます。

POS Ver6.108 以降は、通常の注文保存に限り `sessions/{tableId}` を個別トランザクションで更新します。各保存で `_nodeWriteVersion` と `_nodeWriteNonce` を更新するため、古い画面が保持した値による上書きは拒否されます。会計・テーブル移動・付け回しなど複数データを同時更新する処理は、従来どおり `_writeGate` 付きの一括トランザクションを使用します。

下記ルールを適用する前でも、Ver6.108は権限エラーを検出すると従来方式へ自動的に戻るため、注文保存が停止することはありません。テーブル間の競合削減を有効にするには、Realtime Databaseへ下記ルールを適用してください。

## ルール例

既存の Realtime Database ルールに認証条件がある場合は、下記を丸ごと置き換えず、`pos` / `pos-dev` の `.write` 条件部分を統合してください。

```json
{
  "rules": {
    ".read": true,
    "pos": {
      ".write": "newData.child('_writeGate/versionNum').val() >= 605 && newData.child('_writeGate/nonce').isString() && newData.child('_writeGate/nonce').val() != data.child('_writeGate/nonce').val()",
      "sessions": {
        "$tableId": {
          ".write": "newData.exists() && newData.child('_nodeWriteVersion').val() >= 6108 && newData.child('_nodeWriteNonce').isString() && newData.child('_nodeWriteNonce').val() != data.child('_nodeWriteNonce').val()"
        }
      }
    },
    "pos-dev": {
      ".write": "newData.child('_writeGate/versionNum').val() >= 605 && newData.child('_writeGate/nonce').isString() && newData.child('_writeGate/nonce').val() != data.child('_writeGate/nonce').val()",
      "sessions": {
        "$tableId": {
          ".write": "newData.exists() && newData.child('_nodeWriteVersion').val() >= 6108 && newData.child('_nodeWriteNonce').isString() && newData.child('_nodeWriteNonce').val() != data.child('_nodeWriteNonce').val()"
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

1. POS Ver6.65 以降を公開します。
2. Firebase Console の Realtime Database ルール画面を開きます。
3. `pos` と `pos-dev` の書き込み条件に、上記の `_writeGate` 条件を適用します。
4. 保存後、古いiPadからの更新が「permission_denied」になることを確認します。

このルールを保存するまでは、クライアント側の更新だけでは旧端末の書き戻しを完全には止められません。
