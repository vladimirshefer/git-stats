rebuild: clear
	npm --prefix html-ui install
	npm --prefix cli install
	npm --prefix html-ui run build
	npm --prefix cli run build
	npm --prefix cli install -g

build:
	npm --prefix html-ui ci
	npm --prefix cli ci
	npm --prefix html-ui run build
	npm --prefix cli run build

test:
	npm --prefix html-ui run test
	npm --prefix cli run test

clear:
	rm -rf ./cli/node_modules
	rm -rf ./cli/dist
	rm -rf ./html-ui/node_modules
	rm -rf ./html-ui/dist

watch:
	npm --prefix cli run build; git-stats html out.jsonl;
	open .git-stats/report.html
	while true; do clear; npm --prefix cli run build; git-stats html out.jsonl; sleep 10; done
