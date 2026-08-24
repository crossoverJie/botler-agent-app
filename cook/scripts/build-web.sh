#!/usr/bin/env bash
# 拉取最新代码并重新构建 web 仪表盘，然后打印预览地址。
# 用法：bash scripts/update-web.sh   （或先 chmod +x 后直接 ./scripts/update-web.sh）
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/web"

echo "==> git pull（项目根目录）"
cd "$ROOT_DIR"
git pull

echo "==> 构建 web（vite build → dist/index.html）"
cd "$WEB_DIR"
npm run build

echo
echo "==> 构建完成，预览地址："
echo "   file://$WEB_DIR/dist/index.html"
echo
echo "（单文件产物，可直接在浏览器打开；开发热更新用 npm run dev）"
