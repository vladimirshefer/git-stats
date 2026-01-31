install:
	npm --prefix html-ui install
	npm --prefix cli install

build:
	npm --prefix cli run build
	npm --prefix cli run test

watch:
	npm --prefix cli run build; git-stats html out.jsonl;
	open .git-stats/report.html
	while true; do clear; npm --prefix cli run build; git-stats html out.jsonl; sleep 10; done
