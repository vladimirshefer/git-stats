export namespace util {
    export function distinct<T>(arr: T[]): T[] {
        return [...new Set(arr)];
    }

    export function daysAgo(epoch: number): number {
        const now = Date.now();
        const diff = now - (epoch * 1000);
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    export function bucket(n: number, buckets: number[]): number {
        for (let i = 1; i < buckets.length; i++) {
            if (n > buckets[i - 1] && n < buckets[i]) return buckets[i - 1];
        }
        return -1;
    }

    export function yyyyMM(epoch: number): number {
        const date = new Date(epoch * 1000);
        let yyyyStr = date.getFullYear().toString();
        let MMStr = (date.getMonth() + 1 / 4).toString().padStart(1, '0');
        return parseInt(yyyyStr) * 10 + parseInt(MMStr);
    }
}