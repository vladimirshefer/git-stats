import fs from "fs";
import path from "path";
import {isGitRepo} from "./git";

import {util} from "./util/util";

export function getDirectories(absoluteDirPath: string): string[] {
    if (!fs.existsSync(absoluteDirPath) || !fs.statSync(absoluteDirPath).isDirectory()) return [];
    const ignoredDirs = new Set(['.git', 'node_modules']);
    try {
        return fs.readdirSync(absoluteDirPath, {withFileTypes: true})
            .filter(dirent => dirent.isDirectory() && !ignoredDirs.has(dirent.name))
            .map(dirent => path.join(absoluteDirPath, dirent.name));
    } catch (error) {
        console.error(`Could not read directory: ${absoluteDirPath}`);
        return [];
    }
}

export function findRepositories(absolutePath: string, depth: number): string[] {
    if (depth <= 0) return [];
    if (!path.isAbsolute(absolutePath)) throw new Error(`Path must be absolute: ${absolutePath}`);
    if (!fs.existsSync(absolutePath)) throw new Error(`Path does not exist: ${absolutePath}`);
    if (!fs.statSync(absolutePath).isDirectory()) throw new Error(`Path is not a directory: ${absolutePath}`);
    if (isGitRepo(absolutePath)) return [absolutePath];
    let result = getDirectories(absolutePath).flatMap(dir => findRepositories(dir, depth - 1));
    return util.distinct(result).sort();
}

export function getRepoPathsToProcess(inputPaths: string[]): string[] {
    let repos = inputPaths
        .map(it => path.resolve(it))
        .flatMap(it => findRepositories(it, 3));
    return util.distinct(repos).sort();
}