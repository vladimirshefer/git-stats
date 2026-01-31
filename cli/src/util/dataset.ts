/**
 * Counts distinct rows in an async generator and appends the count to each row.
 */
export async function* distinctCount<T>(
    source: AsyncGenerator<T>
): AsyncGenerator<[T, number]> {
    // Map to store counts of serialized rows
    const map = new Map<string, { row: T; count: number }>();

    for await (const row of source) {
        // Serialize the row to use as a Map key
        const key = JSON.stringify(row);

        let count = ((row as any)?.count ?? 1);
        if (map.has(key)) {
            map.get(key)!.count += count;
        } else {
            map.set(key, {row, count: count});
        }
    }

    // Yield each distinct row with its count appended
    for (const {row, count} of map.values()) {
        yield [row, count];
    }
}

