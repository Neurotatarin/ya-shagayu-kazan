import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';

let files = 0, saved = 0;
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (['.js', '.css', '.html', '.json', '.svg'].includes(extname(path))) {
      const source = await readFile(path);
      if (source.length < 1024) continue;
      const compressed = gzipSync(source, { level: 9 });
      if (compressed.length < source.length * .9) { await writeFile(path + '.gz', compressed); files++; saved += source.length - compressed.length; }
    }
  }
}
await walk('dist');
console.log(`Precompressed ${files} static files locally; ${saved} bytes saved without VPS compression.`);
