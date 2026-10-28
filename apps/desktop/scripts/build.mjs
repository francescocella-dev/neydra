import { rm } from 'node:fs/promises';
import { build as bundle } from 'esbuild';
import { build as viteBuild } from 'vite';

await rm('dist', { recursive: true, force: true });
await Promise.all([
  bundle({ entryPoints: ['src/main/index.ts'], outfile: 'dist/main/index.cjs',
    bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['electron'] }),
  bundle({ entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload/index.cjs',
    bundle: true, platform: 'browser', format: 'cjs', target: 'es2022', external: ['electron'] }),
  bundle({ entryPoints: ['src/preload/companion.ts'], outfile: 'dist/preload/companion.cjs',
    bundle: true, platform: 'browser', format: 'cjs', target: 'es2022', external: ['electron'] }),
  viteBuild({ configFile: false, root: 'src/companion', base: './',
    build: { outDir: '../../dist/companion', emptyOutDir: true, sourcemap: false } }),
  viteBuild(),
]);
