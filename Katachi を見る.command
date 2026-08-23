#!/bin/bash
# Katachi をダブルクリックで開くランチャー。
# ターミナルの知識は不要 — このファイルを Finder でダブルクリックするだけ。
# 見終わったら、開いた黒い窓を閉じれば止まります。
#
# ★ポート番号は docs/launcher-spec.md の「ポート台帳」で一意に決めています。
#   ここを勝手に変えると別のアプリと衝突します。台帳を見て直してください。

APP_NAME="Katachi"
PORT=5174
TITLE_MARKER="Katachi"   # このアプリだけが持つ <title> の目印
PROJECT_DIR="/Users/atsushisato/Projects/active/Katachi"
OPTIMIZER_CONTROL="/Users/atsushisato/Projects/active/Optimizer/scripts/server-control.sh"

cd "$PROJECT_DIR" || { echo "プロジェクトが見つかりません: $PROJECT_DIR"; read -r; exit 1; }
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
# 通常入口は、造形→分割→印刷確認が一画面で完結する統合Workbench。
# ルート `/` はHikariの3D入口で、Chromeでは黒い画面だけに見えるため開かない。
URL="http://localhost:${PORT}/skin.html"

# 「つくる→印刷確認」を同じ画面で完結させるため、Optimizerの計算
# エンジンだけを裏で起動する（Optimizerの別画面は開かない）。
if [ -x "$OPTIMIZER_CONTROL" ]; then
  "$OPTIMIZER_CONTROL" start-engine || echo "⚠️ 印刷確認エンジンを起動できませんでした。造形は続けられます。"
fi

echo "──────────────────────────────────────────"
echo "  ${APP_NAME}   ( ${URL} )"
echo "  ブラウザが自動で開きます。少しお待ちください…"
echo "  （見終わったら、この窓を閉じれば止まります）"
echo "──────────────────────────────────────────"

# すでにこのポートで何かが動いていたら、それが本当に ${APP_NAME} か確かめる。
# 別のアプリ（Yomu / Morpho など）が同じポートを掴んでいたら、
# 間違って別物を開かないよう、ここで止める。
existing="$(curl -s --max-time 2 "$URL" 2>/dev/null || true)"
if [ -n "$existing" ]; then
  if printf '%s' "$existing" | grep -q "$TITLE_MARKER"; then
    echo "すでに起動中の ${APP_NAME} を開きます。"
    open "$URL"
    echo "この窓は閉じて構いません。"
    exit 0
  else
    echo "⚠️  ポート ${PORT} が ${APP_NAME} 以外のアプリに使われています。"
    echo "    先にそのアプリの黒い窓を閉じてから、もう一度このファイルを開いてください。"
    echo "    （${APP_NAME} を間違って別アプリとして開かないよう、ここで止めました）"
    read -r
    exit 1
  fi
fi

# 初回だけ依存関係を入れる（node_modules が無いときのみ）
if [ ! -d node_modules ]; then
  echo "初回準備中（少し時間がかかります）…"
  npm install || { echo "準備に失敗しました。"; read -r; exit 1; }
fi

# サーバーが立ち上がったらブラウザを開く
(
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null "$URL" 2>/dev/null; then
      open "$URL"
      break
    fi
    sleep 0.5
  done
) &

# --port + --strictPort でポートを固定。設定ファイル(.ts/.js)より CLI が優先されるので確実。
# ポートが他アプリに取られていたら strictPort が起動を止める（黙って別ポートに逃げない）。
exec npm run dev -- --port "${PORT}" --strictPort
