'use strict';

var CACHE_NAME = 'fvl-registro-v24';
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

  /* RED PRIMERO, caché solo como respaldo.
     Antes era "cache || fresh": servía lo cacheado y refrescaba de fondo, así
     que el equipo corría SIEMPRE la versión anterior y solo veía la nueva en
     la siguiente apertura. Con código de captura eso es peligroso: el
     2026-09-03 el operario reportó cajas con un app.js viejo cuyo selector de
     máquina traía causas de calidad, y "CONTAMINACION" quedó escrito en la
     columna MAQUINA de la hoja.
     Ahora, con red, siempre corre el código recién desplegado. Sin red sigue
     funcionando con lo cacheado, que es lo que la planta necesita. */
  event.respondWith(
    caches.match(req).then(function(cached){
      var red = fetch(req).then(function(res){
        var copia = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copia); });
        return res;
      });
      // Tope de espera: en planta la señal a veces va lenta, y "red primero"
      // sin límite colgaría el arranque de la app. Si la red no contesta en
      // 3 s se abre con lo cacheado (y la copia nueva queda guardada para el
      // siguiente arranque). Sin conexión, lo cacheado gana de inmediato.
      if (!cached) return red;
      return Promise.race([
        red,
        new Promise(function(r){ setTimeout(function(){ r(cached); }, 3000); })
      ]).catch(function(){ return cached; });
    })
  );
});
