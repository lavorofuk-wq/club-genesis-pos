# トランザクション調査 (Ver6.143 / 2026-09-08)

## TCの原因と今回の変更

変更前は `tableChange` が未保存注文を待った後、移動元と移動先を順番に読んでから `guardedSessionUpdate` を呼んでいた。この関数は `guardedRootTransaction` を使い、`pos` / `pos-dev` 全体を一度読み、全体をトランザクションで送信する。対象外の `bizDays`、会計履歴、名簿、設定なども取得・送信・競合判定の対象になる。データ量と無関係な他端末更新の両方が待ち時間を増やす構造。

また、待機前に移動元セッションを複製していたため、キューの保存完了でrevisionが進むとTC側のデータが古くなる。

Ver6.143では以下へ変更した。

- 移動元・移動先の未保存注文の完了後に最新セッションを複製。保存失敗が残る場合は移動しない。
- 対象2卓のセッション、付け回し追加番号、営業日IDを並列取得。その後、`assignments`を`tableId`で絞って取得。
- 対象2卓、現在の来店に属する付け回し、操作証跡、追加番号だけを1回のatomic multipath updateで保存。
- 移動元の来店ID・開始時刻・revision、移動先の空席、付け回し各件のrevision、営業日をFirebaseルールで照合。
- 付け回しの新規追加・終了取消時は卓単位の追加番号を同時更新。TC確認中の追加を検出し、移動先に漏れるレコードを防止。
- 保存中はスピナーを表示し、再押下・キャンセル・画面移動を抑止。保存ACK後に「同期済み」を表示。
- `window.POS_PERF = true` でTCのキュー待ち、検証完了、保存開始・完了、旧処理使用を計測できる。注文内容や氏名はログに含めない。

`_capabilities/tableChangeAtomicValidationVersion >= 614300` が軽量処理の利用条件。ルール適用前は従来の競合検出付き保存を残し、新しい保存が拒否された場合には旧処理で再送しない。

## 全体トランザクションが残る操作

| 優先度 | 操作 / 関数 | 現在の範囲 | 改善方針 |
| --- | --- | --- | --- |
| 高・小規模 | 場内指名の明細削除 / `remItem` | セッションと付け回し種別変更でPOS全体 | 追加時と同じ `guardedSessionNodeUpdate` と既存の場内指名ルールを再利用できる。追加・削除双方の競合テストが必要。 |
| 高 | 会計確定 / `checkout` | セッション削除・現在営業日のhistory・付け回し終了・出勤状態変更でPOS全体 | 会計IDをキーにした履歴保存と、会計証跡・各revision検証を伴う小さい一括更新に分離。現状の「一括で確定する」整合性は必要だが、過去営業日や設定の読み書きは不要。 |
| 中 | テーブル削除 / `execDeleteSession` | 対象セッション・付け回し削除・出勤状態変更でPOS全体 | 対象卓だけの削除証跡とrevision検証へ分離。確認中の付け回し追加にも対応が必要。 |
| 中 | 付け回し履歴削除 / `deleteAssign` | 1件の削除、稼働中なら出勤状態変更でPOS全体 | `guardedShiftDelete` と同様の削除証跡を用意。稼働中の削除では関連出勤も一括検証する。 |
| 中 | 付け回し時刻変更 / `saveAssignTimeEdit` | 1件変更と同キャストの重複確認でPOS全体 | 対象付け回しと同キャストだけに限定。終了取消で同時に二重配席にならないサーバー側検証が必要。 |
| 中 | 過去営業日の削除・編集 / `guardedReplaceClosedBizDay` | 対象営業日・summary変更でPOS全体 | 対象営業日のrevision、営業中でないこと、summaryを操作証跡でまとめて検証する。 |
| 中 | 過去営業日の日付変更 / `guardedMoveClosedBizDay` | 元日付・先日付・summary変更でPOS全体 | 対象2日と空き日付確認を一括検証。ほかの日付のデータは不要。 |
| 低・保守 | バックアップ復旧 / `guardedRootUpdateIfActive` | 復旧対象に加えてPOS全体を読んで送信 | 複数データを一括復旧する必要はある。非営業状態の操作証跡と復旧対象のみの更新へ縮小可能。 |

## 条件付きで全体処理へ戻る箇所

- `guardedCheckedUpdateOptimistic` は、軽量保存の権限エラーだけでなく `record changed` / `record conflict` / `record create conflict` でも全体トランザクションを再試行する。本当の競合は停止すべきで、旧ルールとの互換性による拒否と区別する改修が候補。
- `guardedQueuedSessionSave` / `guardedRecordSet` は一度の権限拒否で軽量処理未対応として記憶するため、その後の操作も再読込まで全体処理へ戻り得る。対応可否をcapabilityで明示し、実競合を未対応と誤判定しない設計が候補。
- 場内指名追加・営業開始・営業終了・営業再読込は、該当capability未設定時だけ旧ルート処理を使う。現時点の運用値は別途Firebaseで確認する必要がある。
- `guardedSetIfUnchanged` は現在 `bizDays` 用の汎用保存経路に残るが、直接の画面操作からの呼び出しは確認できない。`guardedSessionSet` も定義のみ。実際に頻繁に走る処理とは分けて扱う。

## 混同しない点

`ref('/').update({ 'pos-dev/sessions/t1': value, ... })` は、指定したパスだけの一括更新であり、ルート全体の送信ではない。全体を読む `ref(FB_ROOT).once('value')` と、全体を対象にする `ref(FB_ROOT).transaction(...)` が今回の調査対象。

通常の注文は卓単位、GMS対象修正は会計単位、設定は設定項目単位の保存になっている。これらまで無条件更新へ置き換える必要はない。

公式仕様: [Firebaseの一括更新](https://firebase.google.com/docs/database/web/read-and-write#update_specific_fields)、[Firebaseルールの検証](https://firebase.google.com/docs/database/security/rules-conditions)。

## 検証と公開

`tests/table-change-sync.test.js` は本体関数を実行する単体テストと、ローカルFirebase Emulatorによる競合テストを持つ。後者は127.0.0.1:9017の専用namespaceのみを使用し、本番へは接続しない。

PowerShellでエミュレーターを起動した後、`$env:POS_RULES_EMULATOR='1'` を設定して `node --test tests/*.test.js` を実行する。

公開順序はdevのルール適用、Ver6.143のdev公開、dev端末更新、`pos-dev/_capabilities/tableChangeAtomicValidationVersion=614300`。mainは利用確認後に別途公開し、本番のcapabilityを有効化する。新ルール有効時に旧版dev端末から付け回しを追加すると拒否されるため、dev端末も更新する。

実店舗回線での完了時間は未計測。コード上の全体読み書きは除去できても、通信往復・未保存注文待ち・回線断の時間は残る。
