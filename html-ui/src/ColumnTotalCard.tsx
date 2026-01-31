import {useMemo} from "preact/hooks";
import {COLUMNS_AMOUNT, RAW_DATASET_SCHEMA} from "./data";
import {h} from "preact";
import Chart from "./Chart";

export function ColumnTotalCard(
    {
        columnName,
        columnIdx,
        keys,
        values,
        totals,
        contributions
    }: {
        columnName: string;
        columnIdx: number;
        keys: unknown[];
        values: number[];
        totals: Map<unknown, number>;
        contributions: Map<
            unknown,
            Map<number, Map<unknown, number>>
        >;
    }
) {
    const {labels, hoverText} = useMemo(() => {
        const labels: string[] = [];
        const hoverText: string[] = [];

        keys.forEach((k) => {
            const total = totals.get(k) || 0;
            const keyContribs = contributions.get(k);
            const topContribs: string[] = [];

            for (let otherIdx = 0; otherIdx < COLUMNS_AMOUNT; otherIdx++) {
                if (otherIdx === columnIdx) continue;
                const otherColMap = keyContribs?.get(otherIdx);
                if (otherColMap) {
                    const top3 = Array.from(otherColMap.entries())
                        .sort((a, b) => (b[1] as number) - (a[1] as number))
                        .slice(0, 3)
                        .map(
                            ([val, cnt]) =>
                                `${val}(${((cnt as number) / total * 100.0).toFixed(1)}%)`
                        )
                        .join("<br>-");
                    if (top3) {
                        topContribs.push(`${RAW_DATASET_SCHEMA[otherIdx]}<br>-` + top3);
                    }
                }
            }

            const label = `${String(k)} (${total})`;
            labels.push(label);
            hoverText.push(
                topContribs.length > 0
                    ? `${label}<br>${topContribs.join("<br>")}`
                    : label
            );
        });

        return {labels, hoverText};
    }, [columnName, columnIdx, keys, totals, contributions]);

    const data = useMemo(() => {
        return [{
            type: "sunburst",
            labels: labels,
            parents: labels.map(() => ""),
            values: values,
            hovertext: hoverText,
            hovertemplate: "%{hovertext}<extra></extra>",
            branchvalues: "total"
        }];
    }, [labels, hoverText, values]);

    const layout = useMemo(() => {
        return {
            margin: {l: 0, r: 0, t: 10, b: 10},
            sunburstcolorway: [
                "#4F46E5",
                "#10B981",
                "#F59E0B",
                "#EF4444",
                "#06B6D4",
                "#8B5CF6",
                "#F43F5E"
            ],
            extendsunburstcolors: true,
            height: 300
        };
    }, []);

    const config = useMemo(() => {
        return {responsive: true, displayModeBar: false};
    }, []);

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h3 className="text-lg font-semibold mb-3 text-gray-800">
                {columnName} - Total
            </h3>
            {!labels.length ? (
                <div className="text-gray-500 py-6 text-center">No data to display</div>
            ) : (
                <Chart data={data} layout={layout} config={config}/>
            )}
        </div>
    );
}