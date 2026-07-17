#!/bin/bash
# Katachi を「同じ Wi-Fi にいる別の PC（Windows など）」から見るためのランチャー。
# この Mac でダブルクリック → 表示された URL を Windows の Chrome に打ち込むだけ。
# Windows 側には何もインストールしない。計算は Windows のブラウザの中で走る。
#
# ★ポート番号は docs/launcher-spec.md の「ポート台帳」で一意に決めています（Katachi = 5174）。
# ★普段の「Katachi を見る.command」と同時には使えません（同じポートのため）。
#   先にそちらの黒い窓を閉じてから、これを開いてください。

APP_NAME="Katachi"
PORT=5174
TITLE_MARKER="Katachi"
PROJECT_DIR="/Users/atsushisato/Projects/active/Katachi"

cd "$PROJECT_DIR" || { echo "プロジェクトが見つかりません: $PROJECT_DIR"; read -r; exit 1; }
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# この Mac の LAN アドレスを調べる（Wi-Fi = en0 が普通。だめなら en1）
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)"
if [ -z "$IP" ]; then
  echo "⚠️  LAN アドレスが見つかりません。Wi-Fi に繋がっているか確認してください。"
  read -r; exit 1
fi

URL_LOCAL="https://localhost:${PORT}"
URL_LAN="https://${IP}:${PORT}"

echo "──────────────────────────────────────────"
echo "  ${APP_NAME} を LAN に公開します"
echo ""
echo "  Windows の Chrome でこれを開く:"
echo ""
echo "      ${URL_LAN}/mpm.html   ← S2c 本物を混ぜる (MPM)"
echo "      ${URL_LAN}            ← S1 雲をこねる（他の Study へのリンクあり）"
echo ""
echo "  ※ HTTPS(自己署名)なので、初回はブラウザが警告を出します →"
echo "    「詳細設定」→「〜にアクセスする(安全ではありません)」で進んでください（一度だけ）"
echo "  ※ WebGPU はセキュア接続でしか有効にならないため、HTTPS で配信しています"
echo "  ※ 初回は macOS が「ネットワーク接続を許可しますか」と聞くことがあります → 許可"
echo "  ※ 見終わったら、この窓を閉じれば公開ごと止まります"
echo "──────────────────────────────────────────"

# すでにこのポートで何かが動いていたら止める（localhost 限定の普段用サーバーとは共存できない）
# -k: 自己署名証明書を許容。旧 HTTP サーバーが残っている場合も検知する
existing="$(curl -sk --max-time 2 "$URL_LOCAL" 2>/dev/null || curl -s --max-time 2 "http://localhost:${PORT}" 2>/dev/null || true)"
if [ -n "$existing" ]; then
  echo "⚠️  ポート ${PORT} はすでに使われています。"
  echo "    普段用の「Katachi を見る.command」の黒い窓を閉じてから、もう一度開いてください。"
  read -r; exit 1
fi

if [ ! -d node_modules ]; then
  echo "初回準備中（少し時間がかかります）…"
  npm install || { echo "準備に失敗しました。"; read -r; exit 1; }
fi

# --host で LAN に公開（0.0.0.0 バインド）。ポートは台帳どおり固定
# --mode https: vite.config.ts が自己署名証明書の HTTPS を有効化（WebGPU のセキュアコンテキスト要件）
exec npm run dev -- --host --port "${PORT}" --strictPort --mode https
