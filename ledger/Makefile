.PHONY: all data web

all: web

data:
	python3 scripts/build.py            # 先刷新 data/ledger.json(合并/校验/聚合)

web: data
	@if [ ! -d web/node_modules ]; then echo "==> npm ci(首次)"; cd web && npm ci; fi
	cd web && npm run build             # 产物 web/dist/index.html
