# Hikari Blender Bridge for Windows

HikariのWeb画面から書き出した5ファイルを、ターミナル操作なしで`.blend`へ変換するWindows用の補助アプリです。Mac版と同じ`hikari-blender://open?case=<case-id>`を受け取ります。

## 利用者向け

1. `Hikari-Blender-Bridge-win-x64.zip`を右クリックして「すべて展開」する。
2. 展開したフォルダの`install.cmd`をダブルクリックする。
3. Hikariで`Blender用一式を書き出す`を押す。
4. `Blenderで開く（Windows）`を押し、通常はDownloadsを選ぶ。

インストールは`%LOCALAPPDATA%\Programs\Hikari Blender Bridge`と現在のユーザーのURLプロトコルだけを使い、管理者権限を必要としません。同名の`.blend`は上書きせず、時刻付きの別ファイルを作ります。初回はWindows Defender SmartScreenが表示される場合があります（現時点の配布物は未署名です）。

削除するときはWindowsの「インストールされているアプリ」から`Hikari Blender Bridge`を選びます。展開したフォルダの`uninstall.cmd`でも削除できます。

標準外の場所へBlenderを置いた場合は、ユーザー環境変数`HIKARI_BLENDER_PATH`へ`blender.exe`の完全パスを設定できます。

## Build

WindowsまたはWindowsをターゲットにできる.NET 8 SDK環境で実行します。

```powershell
.\build.ps1 -Runtime win-x64
```

ARM版Windows用は`win-arm64`を指定します。出力zipには単一の自己完結型exe、ユーザー単位installer、uninstallerが含まれます。Blender importerはexe内へ埋め込まれます。

## Security boundary

- URLから受け取るのはASCII英数、`_`、`-`だけのcase名です。
- 利用者が選んだフォルダ直下のsidecarと、sidecarが宣言した単純なファイル名のmeshだけを一時領域へコピーします。
- Blenderは一時領域だけを入力として使い、完成した`.blend`だけを選択フォルダへ戻します。
