import {RawLineStat} from "./base/RawLineStat";
import {execSync} from "child_process";
import path from "path";

/**
 * Executes git blame --line-porcelain for a file and returns the raw output as a string.
 *
 * @param file - relative path to the file within the repository
 * @param repoRoot - absolute path to the repository root
 * @returns plain string output from git blame --line-porcelain
 */
function executeGitBlamePorcelain(file: string, repoRoot: string): string {
    return execSync(`git blame --line-porcelain -- "${file}"`, {
        cwd: repoRoot,
        maxBuffer: 1024 * 1024 * 50
    }).toString();
}

/**
 * Extracts line-by-line authorship statistics from a file using git blame.
 *
 * Uses `git blame --line-porcelain` to get detailed commit information for each line.
 *
 * Example of git blame --line-porcelain output:
 * ```
 * a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0 1 1 1
 * author John Doe
 * author-mail <john.doe@example.com>
 * author-time 1609459200
 * author-tz +0000
 * committer Jane Smith
 * committer-mail <jane.smith@example.com>
 * committer-time 1609545600
 * committer-tz +0000
 * summary Initial commit
 * filename src/example.ts
 *    import { something } from './module';
 * a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0 2 2
 * author John Doe
 * author-mail <john.doe@example.com>
 * author-time 1609459200
 * author-tz +0000
 * committer Jane Smith
 * committer-mail <jane.smith@example.com>
 * committer-time 1609545600
 * committer-tz +0000
 * summary Initial commit
 * filename src/example.ts
 *
 * b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0a1 3 3 1
 * author Alice Johnson
 * author-mail <alice@example.com>
 * author-time 1612137600
 * author-tz +0000
 * committer Alice Johnson
 * committer-mail <alice@example.com>
 * committer-time 1612137600
 * committer-tz +0000
 * summary Add new feature
 * previous b1c2d3e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0 src/example.ts
 * filename src/example.ts
 *    export function newFeature() {
 * ```
 *
 * Each line of actual code is prefixed with a tab character.
 * The parser extracts the author name and committer-time for each code line.
 *
 * @param file - relative path to the file within the repository
 * @param repoName - name of the repository
 * @param repoRoot - absolute path to the repository root
 */
export function extractRawStatsForFile(file: string, repoName: string, repoRoot: string): RawLineStat[] {
    const blameOutput = executeGitBlamePorcelain(file, repoRoot);
    const blameLines = blameOutput.trim().split('\n');
    const lang = path.extname(file) || 'Other';

    const fields = ["author", "committer-time"];
    const includeAuthor = fields.includes("author")
    const includeCommitterTime = fields.includes("committer-time")

    let currentUser = '', currentTime = 0;
    const result: any[] = [];
    for (const line of blameLines) {
        if (line.startsWith('\t')) {
            result.push({repoName, filePath: file, lang, user: currentUser, time: currentTime});
            continue;
        }
        if (includeAuthor && line.startsWith('author ')) {
            currentUser = line.substring('author '.length).replace(/^<|>$/g, '');
            continue;
        }
        if (includeCommitterTime && line.startsWith('committer-time ')) {
            currentTime = parseInt(line.substring('committer-time '.length), 10);
            continue;
        }
    }

    return result;
}
