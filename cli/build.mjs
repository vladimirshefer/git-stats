import * as esbuild from 'esbuild';
import { exec } from 'child_process';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/index.js',
  loader: { '.html': 'text' },
  external: [],
  banner: {
    js: '#!/usr/bin/env node',
  },
}).catch(() => process.exit(1));

// Make the output file executable
exec(`chmod +x dist/index.js`);

console.error('Build finished successfully.');
