import * as process from "node:process";

export class Progress {

    progress: Record<string, [number, number | undefined]> = {};
    messages: Record<string, string> = {};

    setProgress(name: string, current: number, max: number | undefined = undefined) {
        this.progress[name] = [current, max ?? this.progress[name]?.[1] ?? undefined];
    }

    setMessage(name: string, message: string) {
        this.messages[name] = message;
    }

    stop(name: string) {
        delete this.progress[name];
        delete this.messages[name];
    }

    showProgress(period: number) {
        setInterval(() => {
            // collect the progess "Progress: key1: [value/max], key2: [value/max], ..."
            const progress = Object.entries(this.progress).map(([key, [value, max]]) => `${key}: [${value}/${max ?? "?"}] ${this.messages[key]}`).join(", ");
            if (progress.length === 0) return;
            // reset the last error log line
            process.stderr.clearLine(0, () => {
                process.stderr.write("\r"+progress);
            })

        }, period);
    }

}
