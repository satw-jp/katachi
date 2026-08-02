# Hikari Blender Bridge

HikariのWeb画面から書き出した5ファイルを、ターミナル操作なしで`.blend`へ変換するMac用の補助アプリです。

## Build

```sh
tools/blender-bridge/build-app.sh
```

生成先は`tools/blender-bridge/build/Hikari Blender Bridge.app`です。アプリは次の二つの入口を持ちます。

- アプリを開き、Hikari一式のあるフォルダと`*.blender-study.json`を選ぶ。
- Hikariの`Blenderで開く（Mac）`から`hikari-blender://open?case=<case-id>`を受け取る。最初にDownloadsなどの書き出し先フォルダを選び、同名のsidecarを開く。

フォルダ選択はmacOSのDownloads保護に対応するためのものです。Bridgeは必要なsidecarとmeshだけを一時領域へstageし、Blender子プロセスへ個人フォルダ全体の権限を渡しません。完成した`.blend`だけを書き出しフォルダへ戻します。

同名の`.blend`が既にある場合は上書きせず、時刻付きの`*-from-hikari-*.blend`を作成します。Blender importerはアプリ内へ同梱され、OBJ/STLのhash、座標、単位、光学sceneを従来どおり検証します。
