rebuild: clear
	npm install
	npm run build
	npm --prefix cli install -g

build:
	npm ci --workspaces
	npm run build

test:
	npm test --workspaces

clear:
	rm -rf ./cli/node_modules
	rm -rf ./cli/dist
	rm -rf ./html-ui/node_modules
	rm -rf ./html-ui/dist

watch:
	npm --prefix cli run build; git-stats html out.jsonl;
	open .git-stats/report.html
	while true; do clear; npm --prefix cli run build; git-stats html out.jsonl; sleep 10; done
