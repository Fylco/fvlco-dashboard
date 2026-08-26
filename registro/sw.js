'use strict';

var CACHE_NAME = 'fvl-registro-v18';
var ASSETS = [
  './',
  './index.html',
  './app.js',
  './idb.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function(event){
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){ return cache.addAll(ASSETS); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

/* Solo cachea el shell de la app (GET, mismo origen).
   Las llamadas al backend (Apps Script) pasan de largo sin tocar —
   así el bridge de sincronización offline (paso 3/4) las maneja él mismo. */
self.addEventListener('fetch', function(event){
  var req = event.request;
  if(req.method !== 'GET') return;

  var url = new URL(req.url);
  if(url.origin !== self.location.origin) return;

  var isAppShell = ASSETS.some(function(a){
    var clean = a.replace('./', '');
    return url.pathname.endsWith(clean) || (clean === '' && url.pathname.endsWith('/registro/'));
  });
  if(!isAppShell) return;

  event.respondWith(
    caches.match(req).then(function(cached){
      var fresh = fetch(req).then(function(res){
        caches.open(CACHE_NAME).then(function(cache){ cache.put(req, res.clone()); });
        return res;
      }).catch(function(){ return cached; });
      return cached || fresh;
    })
  );
});
