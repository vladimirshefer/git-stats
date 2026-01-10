/**
 * Git Blame Statistics Analyzer (Streaming Refactor)
 *
 * This script analyzes Git repository blame information using a memory-efficient
 * streaming data pipeline to generate statistics on code authorship.
 *
 * --- Pipeline Stages ---
 * 1.  **File Discovery:** Locates all relevant files.
 * 2.  **Raw Data Extraction:** Streams `git blame` output line-by-line.
 * 3.  **Aggregation:** Consumes the stream to group stats based on configurable dimensions.
 * 4.  **Output Formatting:** Renders the aggregated data as an HTML report or a CSV file.
 */

import {execSync} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {generateHtmlReport} from './output/report_template';
import {RawLineStat} from "./base/RawLineStat";
import {isGitRepo} from "./base/utils";
import {streamToCsv} from './output/csv';
import {AggregatedData, CliArgs, parseArgs} from './cli/parseArgs';
import {Config, loadConfig} from './input/config';

// --- General Types ---
let sigintCaught = false;

// Types moved to src/cli/parseArgs.ts

// --- Utility Functions ---

function getDirectories(source: string): string[] {
    if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) return [];
    const ignoredDirs = new Set(['.git', 'node_modules']);
    try {
        return fs.readdirSync(source, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory() && !ignoredDirs.has(dirent.name))
            .map(dirent => path.join(source, dirent.name));
    } catch (error) {
        console.error(`Could not read directory: ${source}`);
        return [];
    }
}

// --- Pipeline Stage Implementations ---

/**
 * Stage 1 & 2 combined: Discover files and stream raw blame statistics.
 * This is the main generator function for the pipeline.
 */
async function* readCacheForRepo(repoRoot: string, repoName: string, cacheFileName: string): AsyncGenerator<RawLineStat> {
    const cachePath = path.isAbsolute(cacheFileName) ? cacheFileName : path.join(repoRoot, cacheFileName);
    if (!fs.existsSync(cachePath)) {
        console.error(`Cache file not found: ${cachePath}. Skipping.`);
        return;
    }
    const content = fs.readFileSync(cachePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            const obj = JSON.parse(line);
            // Basic validation of required fields
            if (obj && obj.repoName && obj.filePath && obj.user && obj.time) {
                yield obj as RawLineStat;
            }
        } catch {/* ignore bad lines */}
    }
}

async function* discoverAndExtract(repoPaths: string[], config: Config): AsyncGenerator<RawLineStat> {
    for (const repoPath of repoPaths) {
        if (sigintCaught) break;
        console.error(`\nProcessing repository: ${repoPath || '.'}`);

        const originalCwd = process.cwd();
        const discoveryPath = path.resolve(originalCwd, repoPath);
        if (!fs.existsSync(discoveryPath)) {
            console.error(`Error: Path does not exist: ${discoveryPath}. Skipping.`);
            continue;
        }

        const gitCommandPath = fs.statSync(discoveryPath).isDirectory() ? discoveryPath : path.dirname(discoveryPath);

        let repoRoot: string;
        try {
            repoRoot = execSync('git rev-parse --show-toplevel', { cwd: gitCommandPath, stdio: 'pipe' }).toString().trim();
        } catch (e) {
            console.error(`Error: Could not find git repository at ${gitCommandPath}. Skipping.`);
            continue;
        }

        const repoName = path.basename(repoRoot);

        // If reading from cache, prefer that path and skip extraction
        if (config.cache.read) {
            yield* readCacheForRepo(repoRoot, repoName, config.cache.fileName || '.gitstats-cache.jsonl');
            continue;
        }

        // Stage 1: File Discovery
        const finalTargetPath = path.relative(repoRoot, discoveryPath);
        const includePathspecs = (config.filenameGlobs && config.filenameGlobs.length > 0) ? config.filenameGlobs.map(g => `'${g}'`).join(' ') : '';
        const excludePathspecs = (config.excludeGlobs && config.excludeGlobs.length > 0) ? config.excludeGlobs.map(g => `':!${g}'`).join(' ') : '';
        const filesCommand = `git ls-files -- "${finalTargetPath || '.'}" ${includePathspecs} ${excludePathspecs}`;
        const filesOutput = execSync(filesCommand, { cwd: repoRoot, maxBuffer: 1024 * 1024 * 50 }).toString().trim();
        const files = filesOutput ? filesOutput.split('\n') : [];

        console.error(`Found ${files.length} files to analyze in '${repoName}'...`);

        // Stage 2: Raw Data Extraction (Streaming)
        // Optional cache writer
        const maybeCachePath = config.cache.fileName ? (path.isAbsolute(config.cache.fileName) ? config.cache.fileName : path.join(repoRoot, config.cache.fileName)) : undefined;
        const cacheStream = config.cache.write && maybeCachePath ? fs.createWriteStream(maybeCachePath, { flags: 'w' }) : null;
        try {
            for (let i = 0; i < files.length; i++) {
                if (sigintCaught) break;
                const file = files[i];
                const progressMessage = `[${i + 1}/${files.length}] Analyzing: ${file}`;
                process.stderr.write(progressMessage.padEnd(process.stderr.columns || 80, ' ') + '\r');

                if (!file) continue;
                const absPath = path.join(repoRoot, file);
                let stat: fs.Stats | null = null;
                try { stat = fs.statSync(absPath); } catch { stat = null; }
                if (!stat || !stat.isFile() || stat.size === 0) continue;

                try {
                    for (const item of extractRawStatsForFile(file, repoName, repoRoot)) {
                        if (cacheStream) {
                            try { cacheStream.write(JSON.stringify(item) + '\n'); } catch {/* ignore write errors */}
                        }
                        yield item;
                    }
                } catch (e: any) {
                    if (e.signal === 'SIGINT') sigintCaught = true;
                    // Silently skip files that error
                }
            }
        } finally {
            if (cacheStream) cacheStream.end();
        }
        process.stderr.write(' '.repeat(process.stderr.columns || 80) + '\r');
        console.error(`Analysis complete for '${repoName}'.`);
    }
}

function* extractRawStatsForFile(file: string, repoName: string, repoRoot: string): Generator<RawLineStat> {
    const blameOutput = execSync(`git blame --line-porcelain -- "${file}"`, { cwd: repoRoot, maxBuffer: 1024 * 1024 * 50 }).toString();
    const blameLines = blameOutput.trim().split('\n');
    const lang = path.extname(file) || 'Other';
    
    let currentUser = '', currentTime = 0;

    for (const line of blameLines) {
        if (line.startsWith('author ')) {
            currentUser = line.substring('author '.length).replace(/^<|>$/g, '');
        } else if (line.startsWith('committer-time ')) {
            currentTime = parseInt(line.substring('committer-time '.length), 10);
        } else if (line.startsWith('\t') && currentUser && currentTime) {
            yield { repoName, filePath: file, lang, user: currentUser, time: currentTime };
        }
    }
}

/**
 * Stage 3: Aggregate raw stats from the stream based on grouping dimensions.
 */
async function aggregateRawStats(statStream: AsyncGenerator<RawLineStat>, config: Config): Promise<AggregatedData> {
    const { groupBy, thenBy, dayBuckets } = config;
    const stats: AggregatedData = {};
    const now = Date.now() / 1000;

    const getSecondaryKey = (item: RawLineStat): string => {
        switch (thenBy) {
            case 'repo': return item.repoName;
            case 'lang': return item.lang;
            case 'date':
                const ageInDays = (now - item.time) / (60 * 60 * 24);
                for (const d of dayBuckets) {
                    if (ageInDays <= d) return `Last ${d} days`;
                }
                return 'Older';
        }
    };

    for await (const item of statStream) {
        const primaryKey: string = item[groupBy];
        const secondaryKey = getSecondaryKey(item);

        if (!stats[primaryKey]) stats[primaryKey] = {};
        if (!stats[primaryKey][secondaryKey]) stats[primaryKey][secondaryKey] = 0;

        stats[primaryKey][secondaryKey]++;
    }
    return stats;
}

// --- Argument Parsing ---
// parseArgs moved to src/cli/parseArgs.ts

// --- Main Application Controller ---
async function main() {
    process.on('SIGINT', () => {
        if (sigintCaught) { console.error("\nForcing exit."); process.exit(130); }
        sigintCaught = true;
        console.error("\nSignal received. Finishing current file then stopping. Press Ctrl+C again to exit immediately.");
    });

    const args = parseArgs();
    const config: Config = loadConfig(args);
    const originalCwd = process.cwd();
    let repoPathsToProcess: string[] = [...config.additionalRepoPaths];

    // --- Repo Discovery ---
    const targetFullPath = path.resolve(originalCwd, config.targetPath);
    if (!fs.existsSync(targetFullPath)) {
        console.error(`Error: Path does not exist: ${targetFullPath}`);
        process.exit(1);
    }
    if (isGitRepo(targetFullPath)) {
        repoPathsToProcess.push(config.targetPath);
    } else if (fs.statSync(targetFullPath).isDirectory()) {
        console.error(`'${config.targetPath}' is not a git repository. Searching for git repositories within...`);
        const foundRepos = getDirectories(targetFullPath)
            .flatMap(dir => isGitRepo(dir) ? [dir] : getDirectories(dir).filter(isGitRepo))
            .map(repoPath => path.relative(originalCwd, repoPath));
        repoPathsToProcess.push(...foundRepos);
    }
    repoPathsToProcess = [...new Set(repoPathsToProcess)].sort();

    if (repoPathsToProcess.length === 0) {
        console.error("No git repositories found to analyze.");
        process.exit(0);
    }

    console.error(`Found ${repoPathsToProcess.length} repositories to analyze:`);
    repoPathsToProcess.forEach(p => console.error(`- ${p || '.'}`));

    // --- Pipeline Execution ---
    const statStream = discoverAndExtract(repoPathsToProcess, config);

    if (config.outputFormat === 'html') {
        const aggregatedData = await aggregateRawStats(statStream, config); // Stage 3
        if (sigintCaught) console.error("\nAnalysis was interrupted. HTML report may be incomplete.");

        // Stage 4 for HTML
        const htmlFile = config.htmlOutputFile || 'git-stats.html';
        // NOTE: generateHtmlReport expects CliArgs; passing config as it's compatible on used fields
        generateHtmlReport(aggregatedData, htmlFile, originalCwd, config as unknown as CliArgs);
        console.log(`\nHTML report generated: ${path.resolve(originalCwd, htmlFile)}`);
    } else {
        await streamToCsv(
            ["repositoryName", "filePath", "language", "username", "commitTimestamp"],
            statStream
        );
        if (sigintCaught) console.error("\nAnalysis was interrupted. CSV output may be incomplete.");
    }
}

// --- Entry Point ---
main().catch(console.error);
