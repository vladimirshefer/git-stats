import fs from 'fs';
import path from 'path';
import { CliArgs } from '../cli/parseArgs';

export type CacheConfig = {
  read: boolean;
  write: boolean;
  fileName?: string; // per-repo relative file name or absolute path override
};

export type Config = {
  targetPath: string;
  additionalRepoPaths: string[];
  outputFormat: 'csv' | 'html';
  htmlOutputFile?: string;
  filenameGlobs: string[];
  excludeGlobs: string[];
  groupBy: string;
  thenBy: 'repo' | 'lang' | 'date';
  dayBuckets: number[];
  cache: CacheConfig;
};

export type FileConfig = Partial<Omit<Config, 'cache'>> & { cache?: Partial<CacheConfig> };

/**
 * Loads a JSON config from the provided path, if it exists; otherwise returns undefined.
 */
function readJsonConfig(filePath: string | undefined): FileConfig | undefined {
  if (!filePath) return undefined;
  try {
    const json = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

/**
 * Try to locate a repo-local config file if not explicitly provided.
 * Looks for `.gitstats.config.json` in the resolved target path (repo root or directory).
 */
function findImplicitConfigPath(resolvedTargetPath: string): string | undefined {
  const candidates = [
    path.join(resolvedTargetPath, '.gitstats.config.json'),
    path.join(resolvedTargetPath, 'gitstats.config.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return undefined;
}

/**
 * Build the runtime Config from CLI args and optional JSON config file. CLI takes precedence.
 */
export function loadConfig(args: CliArgs): Config {
  const originalCwd = process.cwd();
  const resolvedTarget = path.resolve(originalCwd, args.targetPath);

  const explicitConfigPath = args.configPath
    ? path.resolve(originalCwd, args.configPath)
    : undefined;
  const implicitConfigPath = explicitConfigPath || findImplicitConfigPath(resolvedTarget);
  const fileCfg = readJsonConfig(implicitConfigPath) || {};

  const merged: Config = {
    targetPath: args.targetPath,
    additionalRepoPaths: args.additionalRepoPaths ?? fileCfg.additionalRepoPaths ?? [],
    outputFormat: (args.outputFormat ?? fileCfg.outputFormat ?? 'csv') as 'csv' | 'html',
    htmlOutputFile: args.htmlOutputFile ?? fileCfg.htmlOutputFile,
    filenameGlobs: args.filenameGlobs?.length ? args.filenameGlobs : (fileCfg.filenameGlobs ?? []),
    excludeGlobs: args.excludeGlobs?.length ? args.excludeGlobs : (fileCfg.excludeGlobs ?? []),
    groupBy: (args.groupBy ?? fileCfg.groupBy ?? 'user'),
    thenBy: (args.thenBy ?? fileCfg.thenBy ?? 'date'),
    dayBuckets: args.dayBuckets?.length ? args.dayBuckets : (fileCfg.dayBuckets ?? [7, 30, 180, 365]),
    cache: {
      read: args.useCache ?? fileCfg.cache?.read ?? false,
      write: args.writeCache ?? fileCfg.cache?.write ?? false,
      fileName: args.cacheFile ?? fileCfg.cache?.fileName ?? '.gitstats-cache.jsonl',
    },
  } as Config;

  return merged;
}