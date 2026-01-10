import fs from "fs";
import path from "path";

export function isGitRepo(dir: string): boolean {
    return fs.existsSync(path.join(dir, '.git'));
}

