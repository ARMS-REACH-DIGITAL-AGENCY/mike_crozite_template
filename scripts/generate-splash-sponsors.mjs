// Index committed sponsor logos at build time. No runtime filesystem calls.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, parse } from 'node:path';

const root = join(process.cwd(), 'public', 'img', 'splash-sponsors');
const output = join(process.cwd(), 'src', 'generated', 'splash-sponsors.json');
const allowed = new Set(['.png', '.webp', '.jpg', '.jpeg', '.svg', '.avif']);
const pools = {};

if (existsSync(root)) {
  for (const folder of readdirSync(root, { withFileTypes: true })) {
    if (!folder.isDirectory() || !/^(global|[1-9]\d*)$/.test(folder.name)) continue;
    const images = readdirSync(join(root, folder.name), { withFileTypes: true })
      .filter((file) => file.isFile() && allowed.has(extname(file.name).toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ name }) => ({
        name: parse(name).name.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase()).trim(),
        logoUrl: '/img/splash-sponsors/' + encodeURIComponent(folder.name) + '/' + encodeURIComponent(name),
      }));
    if (images.length) pools[folder.name] = images;
  }
}
mkdirSync(join(process.cwd(), 'src', 'generated'), { recursive: true });
writeFileSync(output, JSON.stringify(pools, null, 2) + '\n');
console.log('[splash sponsors] ' + Object.values(pools).reduce((n, arr) => n + arr.length, 0) + ' logo(s) indexed');
