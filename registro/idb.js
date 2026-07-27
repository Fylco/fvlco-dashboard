'use strict';

/* ═══════════════════════════════════════════════════════
   COLA OFFLINE — IndexedDB
   Guarda registros (producción/paro/calidad/ops especiales) cuando no
   hay internet. Se sincronizan solos al restablecerse la conexión.
═══════════════════════════════════════════════════════ */
var IDB_NAME = 'fvl-registro';
var IDB_STORE = 'cola';

function abrirDB(){
  return new Promise(function(res, rej){
    var req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = function(){
      req.result.createObjectStore(IDB_STORE, { keyPath:'id', autoIncrement:true });
    };
    req.onsuccess = function(){ res(req.result); };
    req.onerror = function(){ rej(req.error); };
  });
}

function encolar(registro){
  return abrirDB().then(function(db){
    return new Promise(function(res, rej){
      var tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).add(registro);
      tx.oncomplete = function(){ res(); };
      tx.onerror = function(){ rej(tx.error); };
    });
  });
}

function obtenerPendientes(){
  return abrirDB().then(function(db){
    return new Promise(function(res, rej){
      var tx = db.transaction(IDB_STORE, 'readonly');
      var req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = function(){ res(req.result); };
      req.onerror = function(){ rej(req.error); };
    });
  });
}

function eliminarDeCola(id){
  return abrirDB().then(function(db){
    return new Promise(function(res, rej){
      var tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = function(){ res(); };
      tx.onerror = function(){ rej(tx.error); };
    });
  });
}
