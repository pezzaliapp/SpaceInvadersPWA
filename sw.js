self.addEventListener('install', e=>{
  e.waitUntil(caches.open('invaders-v1').then(c=>c.addAll([
    './','./index.html','./style.css','./app.js','./manifest.json',
    './icons/icon-192.png','./icons/icon-512.png'
  ])));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>{ if(k!=='invaders-v1') return caches.delete(k); }))));
});
self.addEventListener('fetch', e=>{
  e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request)));
});