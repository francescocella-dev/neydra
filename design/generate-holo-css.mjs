// Regenerate / verify Holo CSS tokens. Built-in Node APIs only.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(join(dir, 'holo.tokens.json'), 'utf8'));
const kebab = s => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const lines = [
  '/* GENERATED from design/holo.tokens.json — do not edit by hand.',
  ' * Regenerate: node design/generate-holo-css.mjs',
  ' * Verify:     node design/generate-holo-css.mjs --check',
  ' * Scoped: applying Holo does not change Mini. */',
  '.theme-holo,',
  '[data-neydra-theme="holo"] {',
  ...Object.entries(tokens.palette).map(([key, value]) => `  --holo-${kebab(key)}: ${value};`),
  ...Object.entries(tokens.motion.durationsMs).map(([key, value]) => `  --holo-motion-${kebab(key)}: ${value}ms;`),
  ...Object.entries(tokens.motion.easing).map(([key, value]) => `  --holo-ease-${kebab(key)}: ${value};`),
  ...Object.entries(tokens.radiusPx).map(([key, value]) => `  --holo-radius-${kebab(key)}: ${value}px;`),
  '}',
  '',
];
const output = lines.join('\n');
const target = join(dir, 'holo.tokens.css');
if (process.argv.includes('--check')) {
  const current = readFileSync(target, 'utf8');
  if (current !== output) {
    console.error('Holo CSS differs from design/holo.tokens.json. Run node design/generate-holo-css.mjs');
    process.exitCode = 1;
  } else {
    console.log('Holo tokens: PASS');
  }
} else {
  writeFileSync(target, output, 'utf8');
  console.log('Regenerated design/holo.tokens.css');
}
