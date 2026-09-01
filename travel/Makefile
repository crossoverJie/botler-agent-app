.PHONY: all sync web

all: web

sync:
	git pull                            # 构建前先拉取最新代码

web: sync
	python3 scripts/build.py          # 合并/校验 data/ + 刷新 web/timeline.html、web/map.html
