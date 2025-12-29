#!/usr/bin/env node
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

// --- Interfaces for Data Structures ---
interface LineBlame {
    username: string;
    time: number;
    filePath: string;
}

interface AggregatedStats {
    username: string;
    last7Days: number;
    last30Days: number;
    last365Days: number;
    last5Years: number;
    last10Years: number;
    older: number;
    totalValue: number;
}

// Kept for CSV output compatibility
interface BlameRecord {
    filePath: string;
    fileName: string;
    username: string;
    linesForCommitter: number;
    totalLines: number;
}


interface CliArgs {
    targetPath: string;
    outputFormat: 'csv' | 'html';
    htmlOutputFile?: string;
    filenameGlobs?: string[];
    excludeGlobs?: string[];
    granularity: 'line' | 'file';
}

// --- Main Application Logic ---

function main() {
    const args = parseArgs();
    const { data, repoRoot, originalCwd } = gatherStats(args);

    if (args.outputFormat === 'html') {
        const aggregatedData = aggregateData(data);
        const htmlFile = args.htmlOutputFile || 'git-blame-stats-report.html';
        generateHtmlReport(aggregatedData, htmlFile, originalCwd);
        console.log(`HTML report generated: ${path.resolve(originalCwd, htmlFile)}`);
    } else {
        // Note: CSV output is not granularity-aware in this version.
        const records = aggregateForCsv(data);
        printCsv(records, repoRoot);
    }
}

/**
 * Aggregates line-level blame info into the legacy per-file record format for CSV output.
 */
function aggregateForCsv(blameData: LineBlame[]): BlameRecord[] {
    const fileUserLines = new Map<string, Map<string, number>>();
    const fileTotalLines = new Map<string, number>();

    for (const item of blameData) {
        if (!fileUserLines.has(item.filePath)) {
            fileUserLines.set(item.filePath, new Map<string, number>());
        }
        const userLines = fileUserLines.get(item.filePath)!;
        userLines.set(item.username, (userLines.get(item.username) || 0) + 1);
    }

    // Get total line counts for each file that has blame info
    for (const filePath of fileUserLines.keys()) {
        try {
            const totalLines = fs.readFileSync(filePath, 'utf-8').split('\n').length;
            fileTotalLines.set(filePath, totalLines);
        } catch (e) {
            fileTotalLines.set(filePath, 0); // File might not be accessible anymore
        }
    }

    const records: BlameRecord[] = [];
    for (const [filePath, userLines] of fileUserLines.entries()) {
        for (const [username, linesForCommitter] of userLines.entries()) {
            records.push({
                filePath,
                fileName: path.basename(filePath),
                username,
                linesForCommitter,
                totalLines: fileTotalLines.get(filePath) || 0
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
function gatherStats(args: CliArgs): { data: LineBlame[], repoRoot: string, originalCwd: string } {
    const { targetPath, filenameGlobs, excludeGlobs, granularity } = args;
    const originalCwd = process.cwd();
    const discoveryPath = path.resolve(originalCwd, targetPath);

    if (!fs.existsSync(discoveryPath)) {
        console.error(`Error: Path does not exist: ${discoveryPath}`);
        process.exit(1);
    }

    const gitCommandPath = fs.statSync(discoveryPath).isDirectory() ? discoveryPath : path.dirname(discoveryPath);

    let repoRoot: string;
    try {
        repoRoot = execSync('git rev-parse --show-toplevel', { cwd: gitCommandPath, stdio: 'pipe' }).toString().trim();
    } catch (e) {
        console.error(`Error: Could not find a git repository at or above the path: ${gitCommandPath}`);
        process.exit(1);
    }

    process.chdir(repoRoot);

    const finalTargetPath = path.relative(repoRoot, discoveryPath);
    const includePathspecs = (filenameGlobs && filenameGlobs.length > 0)
        ? filenameGlobs.map(g => `'${g}'`).join(' ')
        : '';
    const excludePathspecs = (excludeGlobs && excludeGlobs.length > 0)
        ? excludeGlobs.map(g => `':!${g}'`).join(' ')
        : '';

    const filesCommand = `git ls-files -- "${finalTargetPath || '.'}" ${includePathspecs} ${excludePathspecs}`;
    const filesOutput = execSync(filesCommand).toString().trim();
    const files = filesOutput ? filesOutput.split('\n') : [];

    const allData: LineBlame[] = [];
    const totalFiles = files.length;
    let processedCount = 0;

    console.error(`Found ${totalFiles} files to analyze with '${granularity}' granularity...`);

    for (const file of files) {
        processedCount++;
        const progressMessage = `[${processedCount}/${totalFiles}] Analyzing: ${file}`;
        process.stderr.write(progressMessage.padEnd(process.stderr.columns || 80, ' ') + '\r');
        
        if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) {
            continue;
        }

        try {
            let fileData: LineBlame[] = [];
            if (granularity === 'line') {
                fileData = getLineBlameForFile(file);
            } else if (granularity === 'file') {
                let blameForFile = getLineBlameForFile(file);
                let resultMap: {[username: string]: LineBlame} = {}
                blameForFile.forEach(lineBlame => {
                    if (!resultMap[lineBlame.username] || resultMap[lineBlame.username].time<lineBlame.time) {
                        resultMap[lineBlame.username] = lineBlame
                    }
                })
                fileData.push(...Object.values(resultMap));
            }
            allData.push(...fileData);
        } catch (e) {
            // Silently skip files that error
        }
    }

    process.stderr.write(' '.repeat(process.stderr.columns || 80) + '\r');
    console.error(`Analysis complete. Processed ${totalFiles} files.`);

    return { data: allData, repoRoot, originalCwd };
}

/**
 * Gets blame information for every line in a file.
 */
function getLineBlameForFile(file: string): LineBlame[] {
    const blameOutput = execSync(`git blame --line-porcelain -- "${file}"`, { maxBuffer: 1024 * 1024 * 50 }).toString();
    const blameLines = blameOutput.trim().split('\n');
    const lineInfos: { username: string; time: number }[] = [];
    let currentInfo: Partial<{ username: string; time: number }> = {};

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
    
    return lineInfos.map(info => ({ ...info, filePath: file }));
}

// --- Output Generation ---

/**
 * Aggregates raw blame records into per-user statistics for the HTML report.
 */
function aggregateData(blameData: LineBlame[]): AggregatedStats[] {
    const userStats = new Map<string, AggregatedStats>();
    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - 7 * 24 * 60 * 60;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60;
    const oneYearAgo = now - 365 * 24 * 60 * 60;
    const fiveYearsAgo = now - 5 * 365 * 24 * 60 * 60;
    const tenYearsAgo = now - 10 * 365 * 24 * 60 * 60;

    for (const item of blameData) {
        if (!userStats.has(item.username)) {
            userStats.set(item.username, {
                username: item.username,
                last7Days: 0,
                last30Days: 0,
                last365Days: 0,
                last5Years: 0,
                last10Years: 0,
                older: 0,
                totalValue: 0, 
            });
        }
        const stats = userStats.get(item.username)!;
        stats.totalValue++;

        if (item.time >= sevenDaysAgo) {
            stats.last7Days++;
        } else if (item.time >= thirtyDaysAgo) {
            stats.last30Days++;
        } else if (item.time >= oneYearAgo) {
            stats.last365Days++;
        } else if (item.time >= fiveYearsAgo) {
            stats.last5Years++;
        } else if (item.time >= tenYearsAgo) {
            stats.last10Years++;
        } else {
            stats.older++;
        }
    }

    // Convert map to array and sort
    return Array.from(userStats.values()).sort((a, b) => b.totalValue - a.totalValue);
}

/**
 * Prints the collected data in CSV format to the console.
 */
function printCsv(records: BlameRecord[], repoRoot: string) {
    console.log('repository_name,file_path,file_name,username,lines_for_committer,total_lines');
    const repoName = path.basename(repoRoot);
    for (const record of records) {
        console.log(`${repoName},"${record.filePath}","${record.fileName}",${record.username},${record.linesForCommitter},${record.totalLines}`);
    }
}

/**
 * Generates a self-contained HTML report file with charts.
 */
function generateHtmlReport(data: AggregatedStats[], outputFile: string, originalCwd: string) {
    const topN = 20; // Show top N users in charts
    const chartData = data.slice(0, topN);
    const labels = JSON.stringify(chartData.map(u => u.username));
    
    const last7 = JSON.stringify(chartData.map(d => d.last7Days));
    const last30 = JSON.stringify(chartData.map(d => d.last30Days));
    const last365 = JSON.stringify(chartData.map(d => d.last365Days));
    const last5Years = JSON.stringify(chartData.map(d => d.last5Years));
    const last10Years = JSON.stringify(chartData.map(d => d.last10Years));
    const older = JSON.stringify(chartData.map(d => d.older));

    const tableHeaderLabel = 'Total';
    const chartTitleLabel = 'Contributions';

    const tableRows = data.map(u => `
        <tr>
            <td>${u.username}</td>
            <td class="num">${u.totalValue.toLocaleString()}</td>
            <td class="num">${u.last7Days.toLocaleString()}</td>
            <td class="num">${u.last30Days.toLocaleString()}</td>
            <td class="num">${u.last365Days.toLocaleString()}</td>
            <td class="num">${u.last5Years.toLocaleString()}</td>
            <td class="num">${u.last10Years.toLocaleString()}</td>
            <td class="num">${u.older.toLocaleString()}</td>
        </tr>
    `).join('');
    
    const finalOutputPath = path.join(originalCwd, outputFile);

    const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Git Blame Statistics</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; background-color: #f8f9fa; color: #212529; }
        .container { max-width: 900px; margin: 20px auto; padding: 20px; background-color: #fff; border-radius: 8px; box-shadow: 0 0 15px rgba(0,0,0,0.05); }
        h1, h2 { border-bottom: 1px solid #dee2e6; padding-bottom: 10px; }
        .chart-container { margin-top: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 30px; }
        th, td { padding: 12px; border: 1px solid #dee2e6; text-align: left; }
        th.num, td.num { text-align: right; }
        thead { background-color: #e9ecef; }
        tbody tr:nth-child(odd) { background-color: #f8f9fa; }
        tbody tr:hover { background-color: #e9ecef; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Git Contribution Statistics</h1>
        <div class="chart-container">
            <h2>${chartTitleLabel} per Author (Top ${topN})</h2>
            <canvas id="mainChart"></canvas>
        </div>
        <h2>All Author Stats</h2>
        <table>
            <thead>
                <tr>
                    <th>Author</th>
                    <th class="num">${tableHeaderLabel}</th>
                    <th class="num">< 7 days</th>
                    <th class="num">8-30 days</th>
                    <th class="num">< 1 year</th>
                    <th class="num">Last 5 Years</th>
                    <th class="num">Last 10 Years</th>
                    <th class="num">Older</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    </div>
    <script>
        const chartData = ${JSON.stringify(chartData)};
        const userMap = new Map(chartData.map(u => [u.username, u]));

        const ctx = document.getElementById('mainChart').getContext('2d');
        const mainChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ${labels},
                datasets: [
                    { label: '< 7 days', data: ${last7}, backgroundColor: 'rgba(214, 40, 40, 0.7)' },
                    { label: '8-30 days', data: ${last30}, backgroundColor: 'rgba(247, 127, 0, 0.7)' },
                    { label: '< 1 year', data: ${last365}, backgroundColor: 'rgba(252, 191, 73, 0.7)' },
                    { label: 'Last 5 Years', data: ${last5Years}, backgroundColor: 'rgba(54, 162, 235, 0.7)' },
                    { label: 'Last 10 Years', data: ${last10Years}, backgroundColor: 'rgba(153, 102, 255, 0.7)' },
                    { label: 'Older', data: ${older}, backgroundColor: 'rgba(201, 203, 207, 0.7)' }
                ]
            },
            options: { 
                indexAxis: 'y', 
                scales: { 
                    x: { stacked: true, beginAtZero: true },
                    y: { 
                        stacked: true,
                        ticks: { autoSkip: false }
                    } 
                },
                plugins: {
                    legend: {
                        onClick: (e, legendItem, legend) => {
                            // Default behavior to toggle visibility
                            Chart.defaults.plugins.legend.onClick(e, legendItem, legend);

                            const chart = legend.chart;
                            const visibilities = chart.data.datasets.map((_, i) => chart.isDatasetVisible(i));
                            const usersToSort = chart.data.labels.map(label => userMap.get(label));

                            usersToSort.sort((a, b) => {
                                let totalA = 0;
                                let totalB = 0;
                                if (visibilities[0]) totalA += a.last7Days;
                                if (visibilities[1]) totalA += a.last30Days;
                                if (visibilities[2]) totalA += a.last365Days;
                                if (visibilities[3]) totalA += a.last5Years;
                                if (visibilities[4]) totalA += a.last10Years;
                                if (visibilities[5]) totalA += a.older;

                                if (visibilities[0]) totalB += b.last7Days;
                                if (visibilities[1]) totalB += b.last30Days;
                                if (visibilities[2]) totalB += b.last365Days;
                                if (visibilities[3]) totalB += b.last5Years;
                                if (visibilities[4]) totalB += b.last10Years;
                                if (visibilities[5]) totalB += b.older;

                                return totalB - totalA;
                            });
                            
                            chart.data.labels = usersToSort.map(u => u.username);
                            chart.data.datasets[0].data = usersToSort.map(u => u.last7Days);
                            chart.data.datasets[1].data = usersToSort.map(u => u.last30Days);
                            chart.data.datasets[2].data = usersToSort.map(u => u.last365Days);
                            chart.data.datasets[3].data = usersToSort.map(u => u.last5Years);
                            chart.data.datasets[4].data = usersToSort.map(u => u.last10Years);
                            chart.data.datasets[5].data = usersToSort.map(u => u.older);
                            
                            chart.update();
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.x !== null) {
                                    label += context.parsed.x.toLocaleString();
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    </script>
</body>
</html>`;

    fs.writeFileSync(finalOutputPath, htmlTemplate);
}

// --- Entry Point ---

main();
