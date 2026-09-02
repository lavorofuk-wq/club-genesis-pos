# POSアクセス制限の初期設定

Ver6.138では、Firebase Authenticationでログインし、Realtime Databaseの`access/authorizedUsers`で明示的に許可されたユーザーだけがPOSデータへアクセスできます。URLを知っているだけの第三者や、許可リストにないFirebaseユーザーはデータを読み書きできません。

## 初回設定（順番を変えないでください）

1. Firebase Consoleの「Authentication」→「Sign-in method」で「メール/パスワード」を有効にします。
2. 「Authentication」→「Users」でPOSを使うスタッフのユーザーを作成し、各ユーザーの`User UID`を控えます。アプリには新規登録機能を設けていません。
3. Realtime Databaseのデータ画面で、次のように許可ユーザーを登録します。値は文字列ではなくBooleanの`true`です。

   ```text
   access/
     authorizedUsers/
       ユーザーのUID: true
   ```

4. 許可ユーザーを最低1名登録したら、認証機能を含むVer6.138を先にdevへ公開し、ログインと通常操作を確認します。
5. Ver6.138をmainへ公開し、使用端末がログイン画面へ更新されたことを確認します。
6. 最後にプロジェクト直下で次を実行し、`database.rules.json`を反映します。

   ```powershell
   npx firebase-tools login
   npx firebase-tools deploy --only database
   ```

ルールを先に反映すると、認証機能を持たない旧バージョンのPOSはデータへ接続できなくなります。必ず認証版POSの公開と端末更新を先に完了してください。ただし、認証版公開からルール反映までの間はデータAPIがまだ公開状態なので、確認後は速やかにルールを反映します。

## 確認項目

- シークレットウィンドウでURLを開くと、POS画面ではなくログイン画面だけが表示される。
- 間違ったパスワードではログインできない。
- 許可リストにないユーザーでは「利用権限がありません」と表示される。
- 許可ユーザーは通常どおりPOSを利用できる。
- FirebaseのデータURLへ未認証でアクセスすると`Permission denied`になる。
- ブラウザまたはPWAを完全に閉じて開き直すと、再ログインが必要になる。

## ユーザーを無効化する方法

退職者などのアクセスを止める場合は、`access/authorizedUsers/{UID}`を削除し、Firebase Authentication側でも対象ユーザーを無効化または削除します。データ側の許可を削除した時点で、そのユーザーの読み書きはルールにより拒否されます。

## 注意

`database.rules.json`を反映する前は、ログイン画面だけ追加してもデータAPIを直接保護できません。必ず許可ユーザー登録とルール反映をセットで行ってください。また、FirebaseのAPIキーはクライアントアプリでは公開情報であり、秘密にする対象ではありません。実際の保護はAuthenticationとDatabase Rulesが担います。
