import {DataRow} from "../base/types";

/**
 * Counts distinct rows in an async generator and appends the count to each row.
 */
export async function* distinctCount(
    source: AsyncGenerator<DataRow>
): AsyncGenerator<DataRow> {
    // Map to store counts of serialized rows
    const map = new Map<string, { row: DataRow; count: number }>();

    for await (const row of source) {
        // Serialize the row to use as a Map key
        const key = JSON.stringify(row);

        if (map.has(key)) {
            map.get(key)!.count += 1;
        } else {
            map.set(key, {row, count: 1});
        }
    }

    // Yield each distinct row with its count appended
    for (const {row, count} of map.values()) {
        yield [...row, count];
    }
}

