# POS Realtime Database 書き戻し防止ルール

古いiPadなどに残った旧POSコードが、キャッシュ済みの古い状態を `pos` / `pos-dev` に書き戻すことを防ぐための Realtime Database ルールです。

POS Ver6.65 以降は、POSデータを書き込むたびに `_writeGate` を同時更新します。Firebase側で `_writeGate` の更新を必須にすると、旧POSからの直接書き込みは拒否されます。

## ルール例

既存の Realtime Database ルールに認証条件がある場合は、下記を丸ごと置き換えず、`pos` / `pos-dev` の `.write` 条件部分を統合してください。

```json
{
  "rules": {
    ".read": true,
    "pos": {
      ".write": "newData.child('_writeGate/versionNum').val() >= 605 && newData.child('_writeGate/nonce').isString() && newData.child('_writeGate/nonce').val() != data.child('_writeGate/nonce').val()"
    },
    "pos-dev": {
      ".write": "newData.child('_writeGate/versionNum').val() >= 605 && newData.child('_writeGate/nonce').isString() && newData.child('_writeGate/nonce').val() != data.child('_writeGate/nonce').val()"
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
