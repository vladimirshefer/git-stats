build:
	npm run build
	npm run test

watch:
	while true; do npm run build; git-stats html out.jsonl; sleep 10; done
