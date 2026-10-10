import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const file of ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'assets']) {
  await cp(file, `dist/${file}`, { recursive: true });
}
console.log('Static PWA built in dist/');
