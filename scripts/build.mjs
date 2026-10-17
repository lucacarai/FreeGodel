import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'src');
const output = resolve(root, 'dist');
// Only the fixed generated folder inside this app may be replaced.
if (dirname(output) !== root || basename(output) !== 'dist' || !output.startsWith(root + sep)) throw Error('Unsafe build output path.');
if (existsSync(output) && lstatSync(output).isSymbolicLink()) throw Error('Build output must not be a symbolic link.');
const entries = readdirSync(source, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
const hash = createHash('sha256');
for (const entry of entries) {
  if (!entry.isFile()) throw Error(`Unexpected source entry: ${entry.name}`);
  hash.update(entry.name).update('\0').update(readFileSync(resolve(source, entry.name))).update('\0');
}
const revision = hash.digest('hex').slice(0, 12);
if (existsSync(output)) rmSync(output, { recursive: true });
mkdirSync(output);
cpSync(source, output, { recursive: true });
// Change every browser-facing asset URL whenever any source file changes.
// Version the imported module too: a fresh app.mjs must not reuse old core.mjs.
const entryPath = resolve(output, 'index.html'), appPath = resolve(output, 'app.mjs');
const html = readFileSync(entryPath, 'utf8');
const app = readFileSync(appPath, 'utf8');
if (!html.includes('href="style.css"') || !html.includes('src="app.mjs"') || !app.includes("from './core.mjs'")) throw Error('Asset entry points changed; update the build versioning rules.');
writeFileSync(entryPath, html.replace('href="style.css"', `href="style.css?v=${revision}"`).replace('src="app.mjs"', `src="app.mjs?v=${revision}"`));
writeFileSync(appPath, app.replace("from './core.mjs'", `from './core.mjs?v=${revision}'`));
writeFileSync(resolve(output, '.nojekyll'), '');
console.log('Built Free Gödel algebras dually into dist/. All assets use relative URLs.');
