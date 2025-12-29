/**
 * Git Blame Statistics Analyzer
 *
 * This script analyzes a Git repository's blame information to generate statistics
 * on code authorship. It can process a specific directory or file within a repo
 * and output the results in either CSV format to the console or as a self-contained
 * HTML report.
 *
 * --- CLI Usage ---
 *
 * To run the script, use the following command structure from your terminal:
 *
 *   npx ts-node blame-stats.ts [path] [--html [output_filename]] [--filename <glob>]...
 *
 *   or if compiled to javascript
 *
 *   node blame-stats.js [path] [--html [output_filename]] [--filename <glob>]... [--exclude-filename <glob>]...
 *
 *
 * Parameters:
 *
 *   [path] (optional)
 *     - The relative or absolute path to the directory or file you want to analyze.
 *     - If omitted, it defaults to the current directory (`.`).
 *
 *   --html [output_filename] (optional)
 *     - If this flag is present, the script will generate a visual HTML report.
 *     - If `[output_filename]` is provided, the report will be saved to that file.
 *     - If the filename is omitted, it defaults to 'git-blame-stats-report.html'.
 * 
 *   --filename <glob> (optional, repeatable)
 *     - Filters the files to be analyzed, including only files that match the glob pattern.
 *     - To use wildcards, enclose the pattern in quotes (e.g., `'*.ts'`).
 *     - You can use this option multiple times to include multiple patterns.
 *     - Example: --filename '*.ts' --filename '*.js'
 *
 *   --exclude-filename <glob> (optional, repeatable)
 *     - Excludes files matching the glob pattern from the analysis.
 *     - To use wildcards, enclose the pattern in quotes (e.g., `'*.json'`).
 *     - This is processed after any `--filename` filters.
 *     - Example: --exclude-filename '*.json' --exclude-filename 'dist/*'
 *
 * --- Behavior ---
 *
 * 1.  CSV Output (Default):
 *     - If the `--html` flag is not used, the script will print blame statistics
 *       in CSV format directly to the standard output.
 *     - Each row represents a committer's contribution to a single file.
 *     - The columns are: `repository_name,file_path,file_name,username,lines_for_committer,total_lines`.
 *
 * 2.  HTML Report Output (`--html`):
 *     - Generates a single, self-contained HTML file with interactive charts and a
 *       detailed table of all author statistics.
 *     - The report includes bar charts for "Lines of Code per Author" and "Files
 *       Touched per Author" for the top 20 contributors.
 *     - A full table lists every author, their total lines owned, and the number
 *       of files they've contributed to.
 *
 * --- Examples ---
 *
 *   - Analyze the entire repository and print CSV to console:
 *     npx ts-node blame-stats.ts
 *
 *   - Analyze a specific subdirectory and generate an HTML report with a default name:
 *     npx ts-node blame-stats.ts ./src --html
 *
 *   - Analyze a single file and save the HTML report with a custom name:
 *     npx ts-node blame-stats.ts ./src/index.js --html my-report.html
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { generateHtmlReport, aggregateData } from './report-template';

let sigintCaught = false;

// --- Interfaces for Data Structures ---
export interface LineBlame {
    repositoryName: string;
    username: string;
    time: number;
    filePath: string;
    totalLinesInFile: number;
}

interface BlameRecord {
    repositoryName: string;
    filePath: string;
    fileName: string;
    username: string;
    linesForCommitter: number;
    totalLines: number;
}


interface CliArgs {
    targetPath: string;
    additionalRepoPaths: string[];
    outputFormat: 'csv' | 'html';
    htmlOutputFile?: string;
    filenameGlobs?: string[];
    excludeGlobs?: string[];
    granularity: 'line' | 'file';
    dayBuckets: number[];
}

// --- Main Application Logic ---

function isGitRepo(dir: string): boolean {
    return fs.existsSync(path.join(dir, '.git'));
}

function getDirectories(source: string): string[] {
    if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
        return [];
    }
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

function main() {
    process.on('SIGINT', () => {
        if (sigintCaught) {
            console.error("\nForcing exit.");
            process.exit(130);
        }
        sigintCaught = true;
        console.error("\nSignal received. Will skip to the next repository after the current operation. Press Ctrl+C again to exit immediately.");
    });

    const args = parseArgs();
    const originalCwd = process.cwd();
    let repoPathsToProcess: string[] = [...args.additionalRepoPaths];

    const targetFullPath = path.resolve(originalCwd, args.targetPath);
    if (!fs.existsSync(targetFullPath)) {
        console.error(`Error: Path does not exist: ${targetFullPath}`);
        process.exit(1);
    }
    
    if (isGitRepo(targetFullPath)) {
        repoPathsToProcess.push(args.targetPath);
    } else if (fs.statSync(targetFullPath).isDirectory()) {
        console.error(`'${args.targetPath}' is not a git repository. Searching for git repositories within (depth=2)...`);
        const foundRepos: string[] = [];
        // depth 1
        const depth1Dirs = getDirectories(targetFullPath);
        for (const dir of depth1Dirs) {
            if (isGitRepo(dir)) {
                foundRepos.push(path.relative(originalCwd, dir));
            } else {
                // depth 2
                const depth2Dirs = getDirectories(dir);
                for (const subDir of depth2Dirs) {
                    if (isGitRepo(subDir)) {
                        foundRepos.push(path.relative(originalCwd, subDir));
                    }
                }
            }
        }
        repoPathsToProcess.push(...foundRepos);
    }

    // Remove duplicates and sort
    repoPathsToProcess = [...new Set(repoPathsToProcess)].sort();

    if (repoPathsToProcess.length === 0) {
        console.error("No git repositories found to analyze.");
        process.exit(0);
    }
    
    console.error(`Found ${repoPathsToProcess.length} repositories to analyze:`);
    repoPathsToProcess.forEach(p => console.error(`- ${p || '.'}`));

    let allData: LineBlame[] = [];

    for (const p of repoPathsToProcess) {
        sigintCaught = false; // Reset for each repo
        console.error(`\nProcessing repository: ${p || '.'}`);
        const { data, skipped } = gatherStatsForRepo(p || '.', args);
        if (skipped) {
            console.error(`\nSkipped repository: ${p || '.'}`);
            continue;
        }
        allData = allData.concat(data);
    }

    process.chdir(originalCwd);

    if (sigintCaught) {
        console.error("\nAnalysis was interrupted. The results may be incomplete.");
    }

    if (args.outputFormat === 'html') {
        const aggregatedData = aggregateData(allData, args.dayBuckets);
        const htmlFile = args.htmlOutputFile || 'git-blame-stats-report.html';
        generateHtmlReport(aggregatedData, htmlFile, originalCwd, args.dayBuckets);
        console.log(`HTML report generated: ${path.resolve(originalCwd, htmlFile)}`);
    } else {
        // Note: CSV output does not use dynamic day buckets in this version.
        const records = aggregateForCsv(allData);
        printCsv(records);
    }
}

/**
 * Aggregates line-level blame info into the legacy per-file record format for CSV output.
 */
function aggregateForCsv(blameData: LineBlame[]): BlameRecord[] {
    const fileUserLines = new Map<string, {
        userLines: Map<string, number>,
        totalLines: number,
        repoName: string,
        filePath: string,
    }>();
    
    const getFileId = (filePath: string, repoName: string) => `${repoName}#${filePath}`;
    
    for (const item of blameData) {
        const fileId = getFileId(item.filePath, item.repositoryName);
        if (!fileUserLines.has(fileId)) {
            fileUserLines.set(fileId, {
                userLines: new Map<string, number>(),
                totalLines: item.totalLinesInFile,
                repoName: item.repositoryName,
                filePath: item.filePath,
            });
        }
        const fileInfo = fileUserLines.get(fileId)!;
        fileInfo.userLines.set(item.username, (fileInfo.userLines.get(item.username) || 0) + 1);
    }

    const records: BlameRecord[] = [];
    for (const [, fileInfo] of fileUserLines.entries()) {
        for (const [username, linesForCommitter] of fileInfo.userLines.entries()) {
            records.push({
                repositoryName: fileInfo.repoName,
                filePath: fileInfo.filePath,
                fileName: path.basename(fileInfo.filePath),
                username,
                linesForCommitter,
                totalLines: fileInfo.totalLines
            });
        }
    }
    return records;
}


/**
 * Parses command-line arguments to determine the target path and output mode.
 */
function parseArgs(): CliArgs {
    const cliArgs = process.argv.slice(2);
    const result: Partial<CliArgs> = {
        filenameGlobs: [],
        excludeGlobs: [],
        outputFormat: 'csv', // Default to CSV
        granularity: 'line', // Default granularity
        dayBuckets: [7, 30, 180, 365, 730, 1825], // Default buckets
        additionalRepoPaths: [],
    };
    
    for (let i = 0; i < cliArgs.length; i++) {
        const arg = cliArgs[i];
        if (arg === '--html') {
            result.outputFormat = 'html';
            const nextArg = cliArgs[i + 1];
            if (nextArg && !nextArg.startsWith('-')) {
                result.htmlOutputFile = nextArg;
                i++; // Consume the filename argument
            }
        } else if (arg.startsWith('--granularity=')) {
            const value = arg.split('=')[1] as 'line' | 'file';
            if (value === 'line' || value === 'file') {
                result.granularity = value;
            } else {
                console.error(`Invalid granularity: ${value}. Must be 'line' or 'file'.`);
                process.exit(1);
            }
        } else if (arg.startsWith('--days=')) {
            const values = arg.split('=')[1];
            const parsedBuckets = values.split(',').map(d => parseInt(d.trim(), 10)).filter(d => !isNaN(d) && d > 0);
            if (parsedBuckets.length > 0) {
                result.dayBuckets = parsedBuckets.sort((a, b) => a - b); // Ensure buckets are sorted
            } else {
                console.error('Invalid --days format. Must be a comma-separated list of positive numbers.');
                process.exit(1);
            }
        }
        else if (arg === '--filename') {
            const nextArg = cliArgs[i + 1];
            if (nextArg && !nextArg.startsWith('-')) {
                result.filenameGlobs!.push(nextArg);
                i++;
            }
        } else if (arg === '--exclude-filename') {
            const nextArg = cliArgs[i + 1];
            if (nextArg && !nextArg.startsWith('-')) {
                result.excludeGlobs!.push(nextArg);
                i++;
            }
        } else if (arg === '--path') {
            const nextArg = cliArgs[i + 1];
            if (nextArg && !nextArg.startsWith('-')) {
                result.additionalRepoPaths!.push(nextArg);
                i++;
            }
        }
        else if (!arg.startsWith('-')) {
            if (!result.targetPath) result.targetPath = arg;
        }
    }
    
    result.targetPath = result.targetPath || '.';
    return result as CliArgs;
}

/**
 * Gathers statistics based on the specified granularity.
 * @param args - CLI arguments.
 * @returns An object containing the collected data, repo root, and original CWD.
 */
function gatherStatsForRepo(target: string, args: CliArgs): { data: LineBlame[], repoRoot: string, skipped: boolean } {
    const { filenameGlobs, excludeGlobs, granularity } = args;
    const originalCwd = process.cwd();
    const discoveryPath = path.resolve(originalCwd, target);

    if (sigintCaught) return { data: [], repoRoot: '', skipped: true };

    if (!fs.existsSync(discoveryPath)) {
        console.error(`Error: Path does not exist: ${discoveryPath}`);
        return { data: [], repoRoot: '', skipped: true }; // Skip this repo
    }

    const gitCommandPath = fs.statSync(discoveryPath).isDirectory() ? discoveryPath : path.dirname(discoveryPath);

    let repoRoot: string;
    try {
        repoRoot = execSync('git rev-parse --show-toplevel', { cwd: gitCommandPath, stdio: 'pipe' }).toString().trim();
    } catch (e: any) {
        if (e.signal === 'SIGINT' || sigintCaught) return { data: [], repoRoot: '', skipped: true };
        console.error(`Error: Could not find a git repository at or above the path: ${gitCommandPath}. Skipping.`);
        return { data: [], repoRoot: '', skipped: true };
    }

    const repoName = path.basename(repoRoot);
    process.chdir(repoRoot);

    try {
        if (sigintCaught) return { data: [], repoRoot, skipped: true };

        const finalTargetPath = path.relative(repoRoot, discoveryPath);
        const includePathspecs = (filenameGlobs && filenameGlobs.length > 0)
            ? filenameGlobs.map(g => `'${g}'`).join(' ')
            : '';
        const excludePathspecs = (excludeGlobs && excludeGlobs.length > 0)
            ? excludeGlobs.map(g => `':!${g}'`).join(' ')
            : '';

        let files: string[];
        try {
            const filesCommand = `git ls-files -- "${finalTargetPath || '.'}" ${includePathspecs} ${excludePathspecs}`;
            const filesOutput = execSync(filesCommand, { maxBuffer: 1024 * 1024 * 50 }).toString().trim();
            files = filesOutput ? filesOutput.split('\n') : [];
        } catch (e: any) {
            if (e.signal === 'SIGINT' || sigintCaught) return { data: [], repoRoot, skipped: true };
            throw e;
        }

        const allData: LineBlame[] = [];
        const totalFiles = files.length;
        let processedCount = 0;

        console.error(`Found ${totalFiles} files to analyze in '${repoName}' with '${granularity}' granularity...`);

        for (const file of files) {
            if (sigintCaught) return { data: [], repoRoot, skipped: true };

            processedCount++;
            const progressMessage = `[${processedCount}/${totalFiles}] Analyzing: ${file}`;
            process.stderr.write(progressMessage.padEnd(process.stderr.columns || 80, ' ') + '\r');
            
            if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) {
                continue;
            }

            try {
                let fileData: LineBlame[] = [];
                if (granularity === 'line') {
                    fileData = getLineBlameForFile(file, repoName);
                } else if (granularity === 'file') {
                    let blameForFile = getLineBlameForFile(file, repoName);
                    let resultMap: {[username: string]: LineBlame} = {}
                    blameForFile.forEach(lineBlame => {
                        if (!resultMap[lineBlame.username] || resultMap[lineBlame.username].time<lineBlame.time) {
                            resultMap[lineBlame.username] = lineBlame
                        }
                    })
                    fileData.push(...Object.values(resultMap));
                }
                allData.push(...fileData);
            } catch (e: any) {
                if (e.signal === 'SIGINT' || sigintCaught) return { data: [], repoRoot, skipped: true };
                // Silently skip files that error
            }
        }

        process.stderr.write(' '.repeat(process.stderr.columns || 80) + '\r');
        console.error(`Analysis complete for '${repoName}'. Processed ${totalFiles} files.`);
        
        return { data: allData, repoRoot, skipped: false };

    } finally {
        process.chdir(originalCwd);
    }
}

/**
 * Gets blame information for every line in a file.
 */
function getLineBlameForFile(file: string, repoName: string): LineBlame[] {
    const blameOutput = execSync(`git blame --line-porcelain -- "${file}"`, { maxBuffer: 1024 * 1024 * 50 }).toString();
    const blameLines = blameOutput.trim().split('\n');
    const lineInfos: { username: string; time: number }[] = [];
    let currentInfo: Partial<{ username: string; time: number }> = {};
    const totalLinesInFile = fs.readFileSync(file, 'utf-8').split('\n').length;

    for (const line of blameLines) {
        if (/^[0-9a-f]{40}/.test(line)) {
            if (currentInfo.username && currentInfo.time) {
                lineInfos.push(currentInfo as { username: string; time: number });
            }
            currentInfo = {};
        } else if (line.startsWith('author ')) {
            currentInfo.username = line.substring('author '.length).replace(/^<|>$/g, '');
        } else if (line.startsWith('committer-time ')) {
            currentInfo.time = parseInt(line.substring('committer-time '.length), 10);
        }
    }
    if (currentInfo.username && currentInfo.time) {
        lineInfos.push(currentInfo as { username: string; time: number });
    }
    
    return lineInfos.map(info => ({ ...info, filePath: file, repositoryName: repoName, totalLinesInFile }));
}

/**
 * Prints the collected data in CSV format to the console.
 */
function printCsv(records: BlameRecord[]) {
    console.log('repository_name,file_path,file_name,username,lines_for_committer,total_lines');
    for (const record of records) {
        console.log(`${record.repositoryName},"${record.filePath}","${record.fileName}",${record.username},${record.linesForCommitter},${record.totalLines}`);
    }
}

// --- Entry Point ---

main();
