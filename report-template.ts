
import { LineBlame } from './blame-stats';
import htmlTemplate from './report-template.html';
import * as path from 'path';
import * as fs from 'fs';

export interface AggregatedStats {
    username: string;
    totalValue: number;
    bucketValues: number[];
}

/**
 * Aggregates raw blame records into per-user statistics for the HTML report.
 */
export function aggregateData(blameData: LineBlame[], dayBuckets: number[]): AggregatedStats[] {
    const userStats = new Map<string, AggregatedStats>();
    const now = Math.floor(Date.now() / 1000);
    
    // Create sorted time boundaries from largest to smallest
    const timeBoundaries = dayBuckets
        .sort((a, b) => a - b)
        .map(days => now - days * 24 * 60 * 60);

    for (const item of blameData) {
        if (!userStats.has(item.username)) {
            userStats.set(item.username, {
                username: item.username,
                totalValue: 0,
                bucketValues: Array(dayBuckets.length + 1).fill(0), // +1 for the "Older" bucket
            });
        }
        const stats = userStats.get(item.username)!;
        stats.totalValue++;

        let bucketed = false;
        for (let i = 0; i < timeBoundaries.length; i++) {
            if (item.time >= timeBoundaries[i]) {
                stats.bucketValues[i]++;
                bucketed = true;
                break;
            }
        }

        if (!bucketed) {
            stats.bucketValues[dayBuckets.length]++; // Belongs in the "Older" bucket
        }
    }

    // Convert map to array and sort
    return Array.from(userStats.values()).sort((a, b) => b.totalValue - a.totalValue);
}


function getBucketLabel(dayBuckets: number[], index: number): string {
    if (index === 0) {
        return `< ${dayBuckets[0]} days`;
    }
    if (index < dayBuckets.length) {
        return `${dayBuckets[index - 1] + 1} - ${dayBuckets[index]} days`;
    }
    return 'Older';
}

/**
 * Generates a self-contained HTML report file with charts.
 */
export function generateHtmlReport(data: AggregatedStats[], outputFile: string, originalCwd: string, dayBuckets: number[]) {
    const topN = 20; // Show top N users in charts
    const chartData = data.slice(0, topN);
    
    const bucketColors = [
        'rgba(214, 40, 40, 0.7)',  // Red
        'rgba(247, 127, 0, 0.7)',  // Orange
        'rgba(252, 191, 73, 0.7)', // Yellow
        'rgba(168, 218, 142, 0.7)',// Light Green
        'rgba(75, 192, 192, 0.7)', // Teal
        'rgba(54, 162, 235, 0.7)', // Blue
        'rgba(153, 102, 255, 0.7)',// Purple
        'rgba(201, 203, 207, 0.7)' // Grey
    ];

    const datasets = dayBuckets.map((_, i) => ({
        label: getBucketLabel(dayBuckets, i),
        data: chartData.map(d => d.bucketValues[i]),
        backgroundColor: bucketColors[i % bucketColors.length],
    }));
    // Add the "Older" dataset
    datasets.push({
        label: 'Older',
        data: chartData.map(d => d.bucketValues[dayBuckets.length]),
        backgroundColor: bucketColors[dayBuckets.length % bucketColors.length],
    });

    const tableHeaderLabel = 'Total';
    const chartTitle = `Contributions per Author (Top ${topN})`;

    const tableHeaders = `<th class="num">${tableHeaderLabel}</th>` + dayBuckets.map((_, i) => `<th class="num">${getBucketLabel(dayBuckets, i)}</th>`).join('') + `<th class="num">Older</th>`;

    const tableRows = data.map(u => {
        const bucketCells = u.bucketValues.map(val => `<td class="num">${val.toLocaleString()}</td>`).join('');
        return `
        <tr>
            <td>${u.username}</td>
            <td class="num">${u.totalValue.toLocaleString()}</td>
            ${bucketCells}
        </tr>
    `}).join('');
    
    const finalOutputPath = path.join(originalCwd, outputFile);

    let htmlContent = htmlTemplate;

    htmlContent = htmlContent
        .replace('__CHART_TITLE__', chartTitle)
        .replace('__TABLE_HEADERS__', tableHeaders)
        .replace('__TABLE_ROWS__', tableRows)
        .replace('__CHART_DATA_JSON__', JSON.stringify(chartData))
        .replace('__CHART_LABELS_JSON__', JSON.stringify(chartData.map(u => u.username)))
        .replace('__CHART_DATASETS_JSON__', JSON.stringify(datasets));

    fs.writeFileSync(finalOutputPath, htmlContent);
}
