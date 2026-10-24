export function makeIdbStore(dbName) {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error("no indexedDB"));
    const r = indexedDB.open(dbName, 1);
    r.onupgradeneeded = () => { const db = r.result; db.createObjectStore("sessions", { keyPath: "id", autoIncrement: true }); db.createObjectStore("rows", { autoIncrement: true }).createIndex("sid", "sid"); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error("db blocked"));
  }));
  const run = (stores, mode, fn) => open().then(db => new Promise((res, rej) => {
    const t = db.transaction(stores, mode); let out;
    try { out = fn(t); } catch (e) { try { t.abort(); } catch (_) {} return rej(e); }
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error("aborted"));
  }));
  return {
    probe: () => open().then(() => true),
    newSession: (start, tripId) => run(["sessions"], "readwrite", t => t.objectStore("sessions").add({ start, end: start, rows: 0, tripId })).then(rq => rq.result),
    appendRows: (sid, rows) => run(["sessions", "rows"], "readwrite", t => {
      const rs = t.objectStore("rows"); rows.forEach(r => rs.add(Object.assign({ sid }, r)));
      const ss = t.objectStore("sessions"), g = ss.get(sid);
      g.onsuccess = () => { const s = g.result; if (s) { s.end = rows[rows.length - 1].t; s.rows += rows.length; ss.put(s); } };
    }),
    markSaved: (sid, name) => run(["sessions"], "readwrite", t => { const ss = t.objectStore("sessions"), g = ss.get(sid); g.onsuccess = () => { const x = g.result; if (x) { x.saved = name; ss.put(x); } }; }),
    listSessions: () => run(["sessions"], "readonly", t => t.objectStore("sessions").getAll()).then(rq => rq.result.sort((a, b) => b.id - a.id)),
    getRows: sid => run(["rows"], "readonly", t => t.objectStore("rows").index("sid").getAll(sid)).then(rq => rq.result),
    prune: () => Promise.resolve(),
    clear: () => run(["sessions", "rows"], "readwrite", t => { t.objectStore("sessions").clear(); t.objectStore("rows").clear(); }),
  };
}

export function makeMemStore() {
  let sessions = [], rows = {}, nid = 1; const P = value => Promise.resolve(value);
  return {
    probe: () => P(true),
    newSession: (start, tripId) => { const id = nid++; sessions.push({ id, start, end: start, rows: 0, tripId }); rows[id] = []; return P(id); },
    appendRows: (sid, rs) => { rs.forEach(r => rows[sid].push(Object.assign({ sid }, r))); const s = sessions.find(x => x.id === sid); if (s) { s.end = rs[rs.length - 1].t; s.rows += rs.length; } return P(); },
    markSaved: (sid, name) => { const x = sessions.find(v => v.id === sid); if (x) x.saved = name; return P(); },
    listSessions: () => P(sessions.slice().sort((a, b) => b.id - a.id)),
    getRows: sid => P(rows[sid] || []),
    prune: () => P(),
    clear: () => { sessions = []; rows = {}; return P(); },
  };
}
