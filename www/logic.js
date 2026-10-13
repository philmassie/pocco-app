// Pure helpers for the POCCO display page. No DOM access, so they can be unit-tested in Node.
(function (root) {
  "use strict";

  const pad = (n, w) => String(n).padStart(w || 2, "0");

  // "2026-10-12 20:58:03" in the device's local time
  function fmtLocal(ms) {
    const d = new Date(ms);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
      pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }
  // "2026-10-12_20-58-03" (no colons: not allowed in Windows/Android file names)
  function fileStamp(ms) { return fmtLocal(ms).replace(" ", "_").replace(/:/g, "-"); }
  function fileName(startMs, endMs) { return fileStamp(startMs) + "--" + fileStamp(endMs) + ".csv"; }

  function createTripId() {
    const bytes = new Uint8Array(16);
    const cryptoApi = root.crypto;
    if (cryptoApi && typeof cryptoApi.getRandomValues === "function") cryptoApi.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" +
      hex.slice(16, 20) + "-" + hex.slice(20);
  }

  // CSV: empty/null/NaN -> empty cell; quote only when needed
  function csvCell(v) {
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
    const s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // [header, row key]. datetime_local is built from row.t (ms since epoch).
  const COLUMNS = [
    ["trip_id", "tripId"],
    ["datetime_local", "t"],
    ["session_clock_s", "clock"],
    ["coolant_C", "coolant"],
    ["oil_bar", "oil"],
    ["egt_C", "egt"],
    ["battery_V", "battery"],
    ["coolant_level", "level"],
    ["flags", "flags"],
    ["lat", "lat"],
    ["lon", "lon"],
    ["accuracy_m", "acc"],
    ["speed_kmh", "speed"],
    ["heading_deg", "heading"],
    ["altitude_m", "alt"],
    ["gps_age_s", "gpsAge"],
  ];

  function buildCsv(rows) {
    const lines = [COLUMNS.map(c => c[0]).join(",")];
    for (const r of rows) {
      lines.push(COLUMNS.map(([, k]) => csvCell(k === "t" ? fmtLocal(r.t) : r[k])).join(","));
    }
    return lines.join("\r\n") + "\r\n";
  }

  // seconds from a number, "m:ss" or "h:mm:ss"; NaN if unreadable
  function clockSeconds(v) {
    if (typeof v === "number") return v;
    const s = String(v).trim();
    if (s.indexOf(":") >= 0) {
      const p = s.split(":").map(Number);
      if (p.some(x => !isFinite(x))) return NaN;
      return p.reduce((a, x) => a * 60 + x, 0);
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : NaN;
  }

  // a "nice" tick step (1, 2, 5 x 10^n) giving about `target` ticks over `range`
  function niceStep(range, target) {
    const raw = range / (target || 5);
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }

  // Least-squares slope over a sliding window, returned per minute.
  class Trend {
    constructor(winMs, minSpanMs) { this.win = winMs || 30000; this.minSpan = minSpanMs || 10000; this.s = []; }
    add(t, v) {
      if (!isFinite(v)) return;
      this.s.push([t, v]);
      const cut = t - this.win;
      while (this.s.length && this.s[0][0] < cut) this.s.shift();
    }
    slopePerMin() {
      const s = this.s;
      if (s.length < 5 || s[s.length - 1][0] - s[0][0] < this.minSpan) return null;
      const t0 = s[0][0]; let n = s.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const [t, v] of s) { const x = (t - t0) / 1000; sx += x; sy += v; sxx += x * x; sxy += x * v; }
      const d = n * sxx - sx * sx;
      return d ? ((n * sxy - sx * sy) / d) * 60 : null;
    }
    reset() { this.s = []; }
  }

  // "Engine has started" detector for oil pressure. Arms once pressure has stayed at or above
  // `bar` for `sec` seconds (and coolant >= coolantC if that is set). Latches until reset().
  class OilArm {
    constructor(cfg) { this.cfg = cfg; this.reset(); }
    reset() { this.armed = false; this.since = null; }
    update(t, oil, coolant) {
      if (this.armed) return true;
      const c = this.cfg;
      const coolOk = c.coolantC == null || (isFinite(coolant) && coolant >= c.coolantC);
      if (isFinite(oil) && oil >= c.bar && coolOk) {
        if (this.since == null) this.since = t;
        if (t - this.since >= c.sec * 1000) this.armed = true;
      } else this.since = null;
      return this.armed;
    }
  }

  // Boolean that only changes after the new value has persisted for holdMs.
  class Debounce {
    constructor(holdMs) { this.hold = holdMs; this.state = null; this.cand = null; this.since = 0; }
    update(t, val) {
      if (this.state === null) { this.state = val; this.cand = val; this.since = t; return this.state; }
      if (val === this.state) { this.cand = val; return this.state; }
      if (val !== this.cand) { this.cand = val; this.since = t; }
      if (t - this.since >= this.hold) this.state = val;
      return this.state;
    }
    reset() { this.state = null; this.cand = null; }
  }

  const api = { fmtLocal, fileStamp, fileName, createTripId, csvCell, COLUMNS, buildCsv, clockSeconds, niceStep, Trend, OilArm, Debounce };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.POCCO_LOGIC = api;
})(typeof window !== "undefined" ? window : globalThis);
