import {describe, expect, it, vi} from "vitest";
import {runScan1} from "../src";

describe('test', () => {
    it('base scenario', () => {
        vi.doMock("../src/git.ts", () => ({git_ls_files: () => ["file1", "file2"]}))
        runScan1([resourcePath("test_project")])
        expect(true).toBe(true);
    });
});

function resourcePath(path: string) {
    return `${__dirname}/resources/${path}`;
}
