#!/usr/bin/env bash
# 一键构建前端：在项目根目录执行 ./scripts/build-web.sh，无需进入 web/。
# 首次运行会自动 npm install，之后直接 vite build 产出 web/dist/index.html（单文件、内联数据）。
set -euo pipefail

# 先在项目根目录执行 git pull，保证代码是最新的
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
echo "[build-web] git pull 更新代码..."
git pull

WEB_DIR="$(cd "$(dirname "$0")/../web" && pwd)"
cd "$WEB_DIR"

if [ ! -d node_modules ]; then
  echo "[build-web] 首次构建，安装依赖..."
  npm install
fi

npm run build

echo "[build-web] 完成 → web/dist/index.html"

echo
echo "==> 预览地址："
echo "   file://$WEB_DIR/dist/index.html"
