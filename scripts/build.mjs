import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'src');
const output = resolve(root, 'dist');
// Only the fixed generated folder inside this app may be replaced.
if (dirname(output) !== root || basename(output) !== 'dist' || !output.startsWith(root + sep)) throw Error('Unsafe build output path.');
if (existsSync(output) && lstatSync(output).isSymbolicLink()) throw Error('Build output must not be a symbolic link.');
for (const entry of readdirSync(source, { withFileTypes: true })) {
  if (!entry.isFile()) throw Error(`Unexpected source entry: ${entry.name}`);
}
if (existsSync(output)) rmSync(output, { recursive: true });
mkdirSync(output);
cpSync(source, output, { recursive: true });
writeFileSync(resolve(output, '.nojekyll'), '');
console.log('Built Free Gödel algebras dually into dist/. All assets use relative URLs.');
