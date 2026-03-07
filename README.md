# gitstats

`gitstats` is a small CLI + HTML report tool for understanding code ownership in Git repositories.

It scans repository history with `git blame`, aggregates results by author/time/language/cluster, and generates an interactive HTML report.

## What this repository contains

- `cli/`: the `git-stats` command (`scan`, `html`)
- `html-ui/`: frontend bundle used inside the generated HTML report

## User Quick Start

Prerequisites:
- Node.js + npm
- Git

Install CLI globally:
```bash
npm install -g @vladimirshefer/git-stats
```

Scan current directory (and nested repos up to depth 3):

```bash
git-stats scan .
```

Generate HTML report from collected data:

```bash
git-stats html
```

Open report:

- `./.git-stats/report.html`

Default files:

- Scan output: `./.git-stats/data.jsonl`
- HTML report: `./.git-stats/report.html`

## Developer Guide

Build and install CLI globally:

```bash
make install
```
