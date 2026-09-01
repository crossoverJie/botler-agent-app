.PHONY: all sync data web

all: web

sync:
	git pull                            # 构建前先拉取最新代码

data: sync
	python3 scripts/build.py --no-web   # 刷新/校验 data/（不触发 web 构建）

web: data
	@if [ ! -d web/node_modules ]; then echo "==> npm ci(首次)"; cd web && npm ci; fi
	cd web && npm run build             # 产物 web/dist/index.html
