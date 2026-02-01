import {parsePorcelain} from "../src/git";
import {describe, expect, it} from "vitest";

describe('test git blame porcelain', () => {
    it('base scenario', () => {
        const output = `
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1 1 1
author Alice Doe
author-mail <alice@example.com>
author-time 1700000000
author-tz +0000
committer Alice Doe
committer-mail <alice@example.com>
committer-time 1700000000
committer-tz +0000
summary Initial commit
filename example.txt
\tHello world
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 2 2 1
author Bob Smith
author-mail <bob@example.com>
author-time 1700100000
author-tz +0000
committer Bob Smith
committer-mail <bob@example.com>
committer-time 1700100000
committer-tz +0000
summary Update farewell line
filename example.txt
\tGoodbye world
        `.trim()
        const rows = parsePorcelain(output.split("\n"), ["author", "committer-time"]);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({author: "Alice Doe", time: 1700000000});
        expect(rows[1]).toMatchObject({author: "Bob Smith", time: 1700100000});
    });

    it('captures commit hash when requested', () => {
        const output = `
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1 1 2
author Alice Doe
committer-time 1700000000
filename example.txt
\tLine one
\tLine two
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 3 3 1
author Bob Smith
committer-time 1700100000
filename example.txt
\tLine three
        `.trim();

        const rows = parsePorcelain(output.split('\n'), ["commit", "author", "committer-time"]);
        expect(rows).toHaveLength(3);
        expect(rows[0]).toMatchObject({commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", author: "Alice Doe", time: 1700000000});
        expect(rows[1]).toMatchObject({commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", author: "Alice Doe", time: 1700000000});
        expect(rows[2]).toMatchObject({commit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", author: "Bob Smith", time: 1700100000});
    });

    it('marks boundary when present', () => {
        const output = `
^aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1 1 1
author Alice Doe
committer-time 1700000000
boundary
filename example.txt
\tRoot line
        `.trim();

        const rows = parsePorcelain(output.split('\n'), ["author", "committer-time", "boundary"]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({author: "Alice Doe", time: 1700000000, boundary: 1});
    });
});
