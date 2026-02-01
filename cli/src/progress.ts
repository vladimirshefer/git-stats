import * as process from "node:process";

export class Progress {

    progress: Record<string, [number, number | undefined]> = {};
    messages: Record<string, string> = {};
    startTime: Record<string, number> = {};

    setProgress(name: string, current: number, max: number | undefined = undefined) {
        this.progress[name] = [current, max ?? this.progress[name]?.[1] ?? undefined];
        if (!this.startTime[name]) this.startTime[name] = Date.now();
    }

    setMessage(name: string, message: string) {
        this.messages[name] = message;
    }

    stop(name: string) {
        delete this.progress[name];
        delete this.messages[name];
        delete this.startTime[name];
    }

    destroy() {
        Object.keys(this.progress).forEach(key => this.stop(key));
        clearInterval(this.currentInterval);
    }

    currentInterval: any | undefined = undefined;

    showProgress(period: number) {
        this.currentInterval = setInterval(() => {
            // collect the progess "Progress: key1: [value/max], key2: [value/max], ..."
            const now = Date.now();
            const progress = Object.entries(this.progress).map(([key, [value, max]]) => {
                let eta = "?";
                const startTime = this.startTime[key];
                if (startTime && max !== undefined) {
                    const elapsed = (now - startTime) / 1000;
                    const rate = value / elapsed;
                    const remaining = max - value;
                    const etaSeconds = Math.round(remaining / rate);
                    eta = ` ETA: ${etaSeconds}s`;
                }
                return `${key}: [${value}/${max ?? "?"}]${eta} ${this.messages[key] ?? ""}`;
            }).join(", ");
            if (progress.length === 0) return;
            // reset the last error log line
            process.stderr.clearLine(0, () => {
                process.stderr.write("\r"+progress);
            })

        }, period);
    }

}
