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
import * as fs from 'fs';
import * as path from 'path';
import {generateHtmlReport} from './output/report_template';
import {findRevision, git_blame_porcelain, git_ls_files} from "./git";
import {AsyncGeneratorUtil, stream, streamOf} from "./util/AsyncGeneratorUtil";
import {clusterFiles} from "./util/file_tree_clustering";
import {DataRow, Dto} from "./base/types";
import {distinctCount} from "./util/dataset";
import {getRepoPathsToProcess} from "./discovery";
import {Progress} from "./progress";

let sigintCaught = false;
const progress = new Progress();
progress.showProgress(300);

async function* getRepositoryFiles(repoRelativePath: string): AsyncGenerator<Dto> {
    console.error(`\nProcessing repository: ${repoRelativePath || '.'}`);

    const absoluteRepoPath = path.resolve(process.cwd(), repoRelativePath);
    const repoName = path.basename(absoluteRepoPath);

    let revisionBoundary = await findRevision(absoluteRepoPath, 5000);

    const files = await git_ls_files(absoluteRepoPath, ".");
    let minClusterSize = Math.floor(Math.max(2, files.length / 100));
    let maxClusterSize = Math.round(Math.max(20, files.length / 30));
    console.error(`Clustering ${files.length} into ${minClusterSize}..${maxClusterSize}+ sized chunks`);
    const filesClustered = clusterFiles(
        files,
        maxClusterSize,
        minClusterSize
    );
    console.error(filesClustered.map(it => `${it.path} (${it.weight})`));
    let clusterPaths = filesClustered.map(it => it.path);

    console.error(`Found ${files.length} files to analyze in '${repoName}'...`);

    let filesShuffled = [...files].sort(() => Math.random() - 0.5);

    for (let i = 0; i < files.length; i++) {
        if (sigintCaught) break;
        const file = filesShuffled[i];
        progress.setProgress("File", i+1, files.length)
        progress.setMessage("File", file)

        try {
            let clusterPath = clusterPaths.find(it => file.startsWith(it)) ?? "$$$unknown$$$";
            yield {
                repo: absoluteRepoPath,
                file: file,
                rev: revisionBoundary,
                cluster: clusterPath
            }
        } catch (e: any) {
            if (e.signal === 'SIGINT') sigintCaught = true;
            // Silently skip files that error
        }
    }

    process.stderr.write(' '.repeat(process.stderr.columns || 80) + '\r');
    console.error(`Analysis complete for '${repoName}'.`);
}

async function doProcessFile(absoluteRepoRoot: string, repoRelativeFilePath: string, revisionBoundary?: string): Promise<Dto[]> {
    if (!repoRelativeFilePath) return [];
    const absoluteFilePath = path.join(absoluteRepoRoot, repoRelativeFilePath);
    let stat: fs.Stats | null = null;
    try {
        stat = fs.statSync(absoluteFilePath);
    } catch (e: any) {
        console.error(`Fail get stats for file ${absoluteFilePath}`, e.stack || e.message || e);
    }
    if (!stat || !stat.isFile() || stat.size === 0) return [];

    const result: Dto[] = []
    for (const item of await git_blame_porcelain(repoRelativeFilePath, absoluteRepoRoot, ["author", "committer-time", "commit"], (!!revisionBoundary ? revisionBoundary + "..HEAD" : undefined))) {
        if (revisionBoundary === item.commit) {
            item.author = "Legacy"
            item.time = 0
            item.commit = "0".repeat(40)
        }
        result.push({
            repo: absoluteRepoRoot,
            file: repoRelativeFilePath,
            author: item.author,
            commit: item.commit,
            year: new Date(item.time! * 1000).getFullYear(),
            month: new Date(item.time! * 1000).getMonth() + 1,
            lang: path.extname(repoRelativeFilePath) || 'Other',
        });
    }
    return result;
}

function runScan1(args: string[]): AsyncGenerator<[any, number]> {
    const inputPaths = (args && args.length > 0) ? args : ['.'];
    let repoPathsToProcess = getRepoPathsToProcess(inputPaths);

    let dataSet = streamOf(AsyncGeneratorUtil.of(repoPathsToProcess))
        .flatMap(repoRelativePath => getRepositoryFiles(repoRelativePath))
        .flatMap(fileInfo => {
            return stream.ofArrayPromise(doProcessFile(fileInfo.repo, fileInfo.file, fileInfo.rev)).get();
        })
        .map(it => {
            return {
                ...it,
                filename: path.basename(it.file)
            } as Dto
        })
        .map(it => [it.author, it.time, it.lang, it.cluster, it.repo])
        .get();

    return distinctCount(dataSet);
}

async function runScan(args: string[]) {
    process.on('SIGINT', () => {
        if (sigintCaught) {
            console.error("\nForcing exit.");
            process.exit(130);
        }
        sigintCaught = true;
        console.error("\nSignal received. Finishing current file then stopping. Press Ctrl+C again to exit immediately.");
    });

    let aggregatedData1 = runScan1(args);
    let aggregatedData = await AsyncGeneratorUtil.collect(aggregatedData1);

    progress.destroy()
    aggregatedData.forEach(it => console.log(JSON.stringify(it)));
}

async function runHtml(args: string[]) {
    const absoluteInputPath = args[0] || path.resolve('./.git-stats/data.jsonl');
    const absoluteOutHtml = path.resolve('./.git-stats/report.html');

    if (!fs.existsSync(absoluteInputPath)) {
        console.error(`Input data file not found: ${absoluteInputPath}`);
        process.exitCode = 1;
        return;
    }

    const lines = fs.readFileSync(absoluteInputPath, 'utf8').split(/\r?\n/).filter(Boolean);
    const aggregatedData = lines.map(line => {
        try {
            return JSON.parse(line);
        } catch {
            return null;
        }
    }).filter(Boolean) as DataRow[];

    generateHtmlReport(aggregatedData, absoluteOutHtml);
    console.error(`HTML report generated: ${absoluteOutHtml}`);
}

// --- Main Application Controller ---
async function main() {
    const argv = process.argv.slice(2);
    let subcommand = argv[0];

    let subcommandsMenu = {
        "html": {
            description: "Generates an HTML report from the aggregated data.",
            usage: "git-stats html [input-data-file]"
        },
        "scan": {
            description: "Scans a directory tree for Git repositories and generates aggregated data.",
            usage: "git-stats scan [input-dir] > {output-file}.jsonl"
        }
    }

    if (subcommand === 'scan') {
        await runScan(argv.slice(1));
        return;
    }

    if (subcommand === 'html') {
        await runHtml(argv.slice(1));
        return;
    }

    console.error(`Usage: git-stats <subcommand> [args]\n\nAvailable subcommands:`);
    for (const [name, {description, usage}] of Object.entries(subcommandsMenu)) {
        console.error(`- ${name}: ${description}\n    Usage: ${usage}`);
    }
}

// --- Entry Point ---
main().catch(console.error);
