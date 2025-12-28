// idb.js — wrapper simples IndexedDB (offline-first)
const DB_NAME = "btx_premium_db";
const DB_VER = 1;
const STORE = "kv";

function idbOpen(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE, "readonly");
    const st = tx.objectStore(STORE);
    const rq = st.get(key);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}

async function idbSet(key, value){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE, "readwrite");
    const st = tx.objectStore(STORE);
    st.put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDel(key){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDump(){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const out = {};
    const tx = db.transaction(STORE, "readonly");
    const st = tx.objectStore(STORE);
    const rq = st.openCursor();
    rq.onsuccess = () => {
      const cur = rq.result;
      if (cur){
        out[cur.key] = cur.value;
        cur.continue();
      }else resolve(out);
    };
    rq.onerror = () => reject(rq.error);
  });
}

async function idbClearAll(){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
