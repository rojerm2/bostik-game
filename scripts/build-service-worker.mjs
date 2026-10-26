import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = process.env.BASE_PATH || '/bostik-game/';
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out;
}
const files = (await walk('dist')).filter(p => !p.endsWith('/sw.js'));
const digest = createHash('sha256');
for (const f of files) digest.update(await readFile(f));
const version = `bostik-${digest.digest('hex').slice(0, 16)}`;
const urls = files.map(p => base + p.slice(5));
await writeFile('dist/sw.js', `const CACHE=${JSON.stringify(version)}, URLS=${JSON.stringify(urls)};
self.addEventListener('install', e => e.waitUntil((async () => {
  try { const c=await caches.open(CACHE); await c.addAll(URLS); } catch(e) { await caches.delete(CACHE); throw e; }
})()));
self.addEventListener('activate', e => e.waitUntil((async () => {
  for(const key of await caches.keys()) if(key.startsWith('bostik-') && key!==CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==self.location.origin||!u.pathname.startsWith(${JSON.stringify(base)})) return;
  if(e.request.mode==='navigate') { e.respondWith(fetch(e.request).catch(()=>caches.match(${JSON.stringify(base + 'index.html')}))); return; }
  if(URLS.includes(u.pathname)) e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
`);
console.log(`Precache ${files.length} files, including pose model and WASM (${version}).`);
