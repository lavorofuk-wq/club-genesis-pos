# POS Realtime Database 書き戻し防止ルール

古いiPadなどに残った旧POSコードが、キャッシュ済みの古い状態を `pos` / `pos-dev` に書き戻すことを防ぐための Realtime Database ルールです。

POS Ver6.65 以降は、POSデータを書き込むたびに `_writeGate` を同時更新します。POS Ver6.108 以降は注文を `sessions/{tableId}` 単位、Ver6.109 以降は出退勤と付け回しを `shifts/{shiftId}` / `assignments/{assignmentId}` 単位で競合検出付き保存します。

POS Ver6.133 以降は、`menus`、`tables`、`casts`、`config` の設定保存を小さいマルチパス更新へ分離します。各保存で `_settingsRevisions` と `_settingsWriteMeta` を同時更新し、同じrevisionを元にした二台目の保存をルール側で拒否します。

POS Ver6.136 以降は、場内指名追加時の`session`と`assignment`を小さいマルチパス更新へ分離します。`_banaiOperations/{tableId}`の検証で、同じ更新内の両レコードが現在値からそれぞれ1revisionだけ進むことを保証します。ルール適用前は`_capabilities/banaiAtomicValidationVersion`が存在しないため、POSは従来のルートトランザクションを使用します。

POS Ver6.140.4 以降は、営業終了後の同伴・ボトルバック対象修正を `gmsTargetCorrections/{dayId}/{transactionId}` へ分離します。対象会計1件を読み直した後、この小さいノードだけをrevision付きトランザクションで保存します。`database.rules.json`では認証・許可ユーザー・営業終了済み・スキーマ・アプリバージョン・revisionを検証します。

POS Ver6.140.5 以降は、履歴画面の表示順とFirebase上の配列番号が異なっても誤競合にならないよう、`bizDays/{dayId}/history`を会計IDで検索します。検索用に`id`と`startTime`へインデックスを設定します。

POS Ver6.140.6 以降は、出勤削除でPOSルート全体のトランザクションを使用しません。対象の`shifts/{shiftId}`だけを読み、付け回し中でないことを確認した後、削除と`_shiftDeleteOperations/{shiftId}`を1回のマルチパス更新で確定します。削除証跡には読み取ったrevisionとキャストIDを含め、ルール側で現在の出勤記録と一致しなければ削除を拒否します。

POS Ver6.141 以降は、営業開始・過去営業日の再読込・営業終了を `_bizDayOperation` 付きのatomic multipath updateへ分離します。営業終了時は`bizDays/{dayId}`、現在営業データの削除、`bizDaySummaries/{dayId}`、Firebaseバックアップを1回の更新で確定します。`_capabilities/bizDayAtomicValidationVersion=614100`が有効な場合、ルールは更新前後の`activeBizDay`、操作種別、対象営業日、終了バックアップを照合し、二端末の同時開始・同時終了を拒否します。ルール適用前は従来処理へフォールバックします。

過去の営業履歴は`bizDaySummaries`を24件ずつ取得し、詳細を開いた営業日だけ`bizDays/{dayId}`を読み込みます。既存営業日にsummaryがない場合は、該当ページだけ旧データから生成してバックフィルします。GMS提出履歴と対象修正も対象日単位で読み込みます。

重要: Ver6.133の確認中は、最初に `pos-dev` だけ最低バージョンを `_verNum("6.133")` の実値である `613300` へ更新してください。`pos` を `613300` へ上げるのは、Ver6.133をmainへ公開し、使用端末の更新を確認した後です。先に本番ルールを上げると旧バージョンからの保存が拒否されます。

## Ver6.143 TC

TCの詳細と残存する全体トランザクションは [TRANSACTION_AUDIT.md](TRANSACTION_AUDIT.md) を参照してください。`_tableChangeOperations/{fromTableId}`で対象セッション・移動先・付け回しrevisionを照合し、`_tableAssignmentRevisions/{tableId}`でTC確認中の付け回し追加を検出します。`assignments`には`tableId`と`castId`のインデックスを設定します。

ルール適用とdev端末のVer6.143への更新後に、`pos-dev/_capabilities/tableChangeAtomicValidationVersion=614300`を有効化します。main公開と本番端末の更新前に`pos`側を有効化しないでください。

## ルール例

既存ルールに認証条件がある場合は丸ごと置き換えず、条件を統合してください。`_settingsRevisions/$key` の検証は、nonceが変わる設定保存ではrevisionが必ず1増えること、同じnonceの再送では値が変わらないことを要求します。

```json
{
  "rules": {
    ".read": true,
    "pos": {
      ".write": "newData.child('_writeGate/versionNum').val() >= 613300 && newData.child('_writeGate/nonce').isString() && newData.child('_writeGate/nonce').val() != data.child('_writeGate/nonce').val()",
      "_settingsRevisions": {
        "$key": {
          ".validate": "newData.isNumber() && ((newData.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').val() == data.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').val() && newData.val() == data.val()) || (newData.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').isString() && newData.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').val() != data.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').val() && newData.val() == (data.isNumber() ? data.val() + 1 : 1)))"
        }
      },
      "sessions": {
        "$tableId": {
          ".write": "newData.exists() && newData.child('_nodeWriteVersion').val() >= 610800 && newData.child('_nodeWriteNonce').isString() && newData.child('_nodeWriteNonce').val() != data.child('_nodeWriteNonce').val() && newData.child('_rev').val() == (data.exists() && data.child('_rev').isNumber() ? data.child('_rev').val() + 1 : 1)"
        }
      },
      "shifts": {
        "$shiftId": {
          ".write": "newData.exists() && newData.child('_nodeWriteVersion').val() >= 610900 && newData.child('_nodeWriteNonce').isString() && newData.child('_nodeWriteNonce').val() != data.child('_nodeWriteNonce').val() && newData.child('_rev').val() == (data.exists() && data.child('_rev').isNumber() ? data.child('_rev').val() + 1 : 1)"
        }
      },
      "assignments": {
        "$assignmentId": {
          ".write": "newData.exists() && newData.child('_nodeWriteVersion').val() >= 610900 && newData.child('_nodeWriteNonce').isString() && newData.child('_nodeWriteNonce').val() != data.child('_nodeWriteNonce').val() && newData.child('_rev').val() == (data.exists() && data.child('_rev').isNumber() ? data.child('_rev').val() + 1 : 1)"
        }
      },
      "_banaiOperations": {
        "$tableId": {
          ".validate": "newData.child('nonce').val() == data.child('nonce').val() || (newData.child('version').val() >= 613600 && newData.child('nonce').isString() && newData.child('nonce').val() != data.child('nonce').val() && newData.child('assignmentId').isString() && newData.child('sessionRev').val() == newData.parent().parent().child('sessions').child($tableId).child('_rev').val() && newData.child('sessionRev').val() == root.child('pos').child('sessions').child($tableId).child('_rev').val() + 1 && newData.child('assignmentRev').val() == newData.parent().parent().child('assignments').child(newData.child('assignmentId').val()).child('_rev').val() && newData.child('assignmentRev').val() == root.child('pos').child('assignments').child(newData.child('assignmentId').val()).child('_rev').val() + 1)"
        }
      }
    },
    "pos-dev": {
      ".write": "newData.child('_writeGate/versionNum').val() >= 613300 && newData.child('_writeGate/nonce').isString() && newData.child('_writeGate/nonce').val() != data.child('_writeGate/nonce').val()",
      "_settingsRevisions": {
        "$key": {
          ".validate": "newData.isNumber() && ((newData.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').val() == data.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').val() && newData.val() == data.val()) || (newData.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').isString() && newData.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').val() != data.parent().parent().child('_settingsWriteMeta').child($key).child('nonce').val() && newData.val() == (data.isNumber() ? data.val() + 1 : 1)))"
        }
      },
      "sessions": {
        "$tableId": {
          ".write": "newData.exists() && newData.child('_nodeWriteVersion').val() >= 610800 && newData.child('_nodeWriteNonce').isString() && newData.child('_nodeWriteNonce').val() != data.child('_nodeWriteNonce').val() && newData.child('_rev').val() == (data.exists() && data.child('_rev').isNumber() ? data.child('_rev').val() + 1 : 1)"
        }
      },
      "shifts": {
        "$shiftId": {
          ".write": "newData.exists() && newData.child('_nodeWriteVersion').val() >= 610900 && newData.child('_nodeWriteNonce').isString() && newData.child('_nodeWriteNonce').val() != data.child('_nodeWriteNonce').val() && newData.child('_rev').val() == (data.exists() && data.child('_rev').isNumber() ? data.child('_rev').val() + 1 : 1)"
        }
      },
      "assignments": {
        "$assignmentId": {
          ".write": "newData.exists() && newData.child('_nodeWriteVersion').val() >= 610900 && newData.child('_nodeWriteNonce').isString() && newData.child('_nodeWriteNonce').val() != data.child('_nodeWriteNonce').val() && newData.child('_rev').val() == (data.exists() && data.child('_rev').isNumber() ? data.child('_rev').val() + 1 : 1)"
        }
      },
      "_banaiOperations": {
        "$tableId": {
          ".validate": "newData.child('nonce').val() == data.child('nonce').val() || (newData.child('version').val() >= 613600 && newData.child('nonce').isString() && newData.child('nonce').val() != data.child('nonce').val() && newData.child('assignmentId').isString() && newData.child('sessionRev').val() == newData.parent().parent().child('sessions').child($tableId).child('_rev').val() && newData.child('sessionRev').val() == root.child('pos-dev').child('sessions').child($tableId).child('_rev').val() + 1 && newData.child('assignmentRev').val() == newData.parent().parent().child('assignments').child(newData.child('assignmentId').val()).child('_rev').val() && newData.child('assignmentRev').val() == root.child('pos-dev').child('assignments').child(newData.child('assignmentId').val()).child('_rev').val() + 1)"
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

1. `database.rules.json`を適用します。capabilityが未設定の間は旧営業処理も許可されます。
2. Ver6.141をdevへ公開します。
3. `pos-dev/_capabilities/bizDayAtomicValidationVersion`を`614100`に設定します。
4. devで履歴の追加読込、二端末の同時開始、再編集、営業終了、終了バックアップを確認します。
5. Ver6.141をmainへ公開し、本番端末の強制更新を確認します。
6. 最後に`pos/_capabilities/bizDayAtomicValidationVersion`を`614100`に設定します。

クライアント実装だけでも通常の競合確認は行いますが、読み取り直後に二端末が同時保存する競合を完全に拒否するには、このルールの適用が必要です。
