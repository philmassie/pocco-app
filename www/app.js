import { createAppConfig } from "./modules/config.mjs";
import { makeIdbStore, makeMemStore } from "./modules/log-storage.mjs";
import { createMenu } from "./modules/menu.mjs";
import { applySeverity } from "./modules/severity.mjs";
import { createWifiController } from "./modules/wifi.mjs";

(function () {
  "use strict";

  const L = window.POCCO_LOGIC;
  const $ = id => document.getElementById(id);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  // ================================================================ storage helpers
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const {
    demo, DEFAULT_URL, url, DEFAULT_SSID, wifiSsid,
    IDS, KNOWN, G, GAUGES, FIELDS, LABELS, SET, OTHER, levelBad,
  } = createAppConfig(store, location.search);

  // ================================================================ dials (Copilot layout, unchanged)
  const SW = 240, A0 = -120;               // 240 degree sweep, 0 deg = straight up
  const polar = (cx, cy, r, d) => { const a = (d - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const arc = (cx, cy, r, d0, d1, sweepFlag = 1) => {
    const [x0, y0] = polar(cx, cy, r, d0), [x1, y1] = polar(cx, cy, r, d1);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${Math.abs(d1 - d0) > 180 ? 1 : 0} ${sweepFlag} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const ang = (g, v) => A0 + Math.min(1, Math.max(0, (v - g.min) / (g.max - g.min))) * SW;

  function level(g, n) {
    if (g.alarmLo != null && n <= g.alarmLo) return 2;
    if (g.alarmHi != null && n >= g.alarmHi) return 2;
    if (g.cautionLo != null && n <= g.cautionLo) return 1;
    if (g.cautionHi != null && n >= g.cautionHi) return 1;
    return 0;
  }

  const grid = $("grid"), combinedIds = [2, 3];
  const gaugeScale = 1.08;
  const comboSpecs = {
    2: { cy: 96, radius: 70, start: -65, sweep: 130, sweepFlag: 1, valueY: 84.5, unitY: 93.5, needleInner: 39, labelOffset: 3 },
    3: { cy: 104, radius: 70, start: 245, sweep: -130, sweepFlag: 0, valueY: 120.5, unitY: 129.5, needleInner: 39, labelOffset: 3, labelInset: 15 },
    5: { cy: 100, radius: 70, start: -65, sweep: 130, sweepFlag: 1, valueY: 84.5, unitY: 93.5, needleInner: 39, labelOffset: 3, labelInset: 15 },
  };
  const gaugeAngle = (g, v) => {
    const spec = comboSpecs[g.id];
    return spec ? spec.start + Math.min(1, Math.max(0, (v - g.min) / (g.max - g.min))) * spec.sweep : ang(g, v);
  };
  function gaugeTickStep(g) {
    const span = g.max - g.min;
    if (!(span > 0) || !(g.tickStep > 0)) return null;
    let factor = 1, exponent = 0, step = g.tickStep;
    while (span / step > 8) {
      if (factor === 1) factor = 2;
      else if (factor === 2) factor = 5;
      else { factor = 1; exponent++; }
      step = g.tickStep * factor * (10 ** exponent);
    }
    return step;
  }
  function updateGaugeLimits(g) {
    g.minEl.textContent = g.min;
    g.maxEl.textContent = g.max;
    const tickStep = gaugeTickStep(g);
    g.tickEls.replaceChildren();
    if (tickStep) {
      const firstTick = Math.floor(g.min / tickStep) + 1;
      const lastTick = Math.ceil(g.max / tickStep) - 1;
      for (let tick = firstTick; tick <= lastTick; tick++) {
        const [x1, y1] = polar(100, g.cy, g.radius - 5, gaugeAngle(g, tick * tickStep));
        const [x2, y2] = polar(100, g.cy, g.radius - 11, gaugeAngle(g, tick * tickStep));
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x1.toFixed(2));
        line.setAttribute("y1", y1.toFixed(2));
        line.setAttribute("x2", x2.toFixed(2));
        line.setAttribute("y2", y2.toFixed(2));
        g.tickEls.appendChild(line);
      }
    }
    const ranges = {
      alarmLo: [g.min, g.alarmLo],
      cautionLo: [g.alarmLo == null ? g.min : g.alarmLo, g.cautionLo],
      alarmHi: [g.alarmHi, g.max],
      cautionHi: [g.cautionHi, g.alarmHi == null ? g.max : g.alarmHi],
    };
    Object.entries(ranges).forEach(([field, [a, b]]) => {
      const zone = g.zoneEls[field];
      zone.setAttribute("d", a != null && b != null && b > a
        ? arc(100, g.cy, g.radius, gaugeAngle(g, a), gaugeAngle(g, b), g.sweepFlag)
        : "");
    });
    if (g.coolTick) {
      const inRange = SET.cooldownC >= g.min && SET.cooldownC <= g.max;
      g.coolTick.setAttribute("visibility", inRange ? "visible" : "hidden");
      if (inRange) g.coolTick.setAttribute("transform", `rotate(${gaugeAngle(g, SET.cooldownC).toFixed(1)} 100 ${g.cy})`);
    }
  }
  const comboTile = document.createElement("div");
  comboTile.className = "tile combo";
  comboTile.innerHTML = '<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet"><g class="indicator unknown" id="levelIndicator" transform="translate(24 98)"><svg x="-12" y="-12" width="24" height="24" viewBox="0 0 24 24"><use href="icons/coolant-level.svg#art"/></svg></g><g class="indicator unknown" id="batteryIndicator" transform="translate(176 98)"><svg x="-12" y="-8" width="24" height="16" viewBox="-12 -8 24 16"><use href="icons/battery.svg#art"/><use href="icons/battery.svg#terminals"/></svg><text class="battery-voltage" id="batteryVoltage" y="16">--.- V</text></g><line class="combo-divider" x1="58" y1="100" x2="142" y2="100"/></svg>';
  grid.appendChild(comboTile);
  const comboSvg = comboTile.querySelector("svg");
  const levelIndicator = comboSvg.querySelector("#levelIndicator");
  const batteryIndicator = comboSvg.querySelector("#batteryIndicator");
  const batteryVoltage = comboSvg.querySelector("#batteryVoltage");
  let egtTile = null;
  GAUGES.forEach(g => {
    const combined = combinedIds.includes(g.id);
    const spec = comboSpecs[g.id] || null;
    const cy = spec ? spec.cy : 100;
    const radius = spec ? spec.radius : 78;
    const gaugeAng = value => gaugeAngle(g, value);
    const sweepFlag = spec ? spec.sweepFlag : 1;
    g.cy = cy; g.radius = radius; g.sweepFlag = sweepFlag;
    const zones = '<path class="z al" data-zone="alarmLo"/><path class="z ca" data-zone="cautionLo"/><path class="z al" data-zone="alarmHi"/><path class="z ca" data-zone="cautionHi"/>';
    const labelRadius = spec ? radius - (spec.labelInset || 11) : radius;
    const [lx, ly] = polar(100, cy, labelRadius, gaugeAng(g.min)), [rx, ry] = polar(100, cy, labelRadius, gaugeAng(g.max));
    const el = combined ? document.createElementNS("http://www.w3.org/2000/svg", "g") : document.createElement("div");
    if (combined) el.setAttribute("class", "combo-gauge");
    else el.className = g.id === 5 ? "tile egt" : "tile";
    if (combined) el.setAttribute("transform", `translate(100 100) scale(${gaugeScale}) translate(-100 -100)`);
    const startAngle = gaugeAng(g.min), endAngle = gaugeAng(g.max);
    const path = spec
      ? arc(100, cy, radius, startAngle, endAngle, sweepFlag)
      : arc(100, cy, radius, A0, A0 + SW, 1);
    const valueY = spec ? spec.valueY : 146;
    const unitY = spec ? spec.unitY : 162;
    const labelOffset = spec ? spec.labelOffset : 14;
    const needleTip = spec ? cy - radius + 12 : 34;
    const needleStart = spec ? cy - spec.needleInner : cy;
    // --- added: markers sit just outside the track, pointing at it; rotated about the dial centre like the needle
    const tri = `M100 ${cy - radius - 5.5}l-4.2 -8h8.4z`;
    const hid = `visibility="hidden" transform="rotate(${startAngle.toFixed(1)} 100 ${cy})"`;
    let marks = `<g class="mk pk" ${hid}><path d="${tri}"/></g>`;
    if (g.key === "oil") marks += `<g class="mk mn" ${hid}><path d="${tri}"/></g>`;
    if (g.key === "egt")
      marks += `<line class="cooltick" x1="100" y1="${cy - radius - 7}" x2="100" y2="${cy - radius + 7}" visibility="hidden"/>`;
    const trend = g.trendThr ? `<g class="trend" visibility="hidden" transform="translate(${100 + 25} ${valueY - 6})"><polygon points="0,-4.5 4.5,3.5 -4.5,3.5"/></g>` : "";
    const dialLabelY = g.key === "coolant" ? 148 : 55;
    const dialLabelMarkup = g.key === "coolant"
      ? `<svg class="dial-coolant-icon" x="85" y="${dialLabelY - 15}" width="30" height="30" viewBox="-15 -15 30 30"><use href="icons/coolant.svg#art"/></svg>`
      : g.key === "oil"
        ? `<svg class="dial-oil-icon" x="81" y="46" width="44" height="20.3" viewBox="0 0 732 338" aria-hidden="true"><use href="icons/oil.svg#art"/></svg>`
        : `<text class="nm" x="100" y="${combined ? dialLabelY : 60}">${g.name}</text>`;
    const markup =
      dialLabelMarkup +
      `<g class="ticks" aria-hidden="true"></g><path class="trk" d="${path}"/>${zones}${marks}` +
      `<g class="needle" transform="rotate(${startAngle} 100 ${cy})"><line class="nd" x1="100" y1="${needleStart}" x2="100" y2="${needleTip}"/></g>` +
      `${spec ? "" : `<circle cx="100" cy="${cy}" r="6" fill="#fff"/>`}` +
      `<text class="lim min-label" x="${lx.toFixed(1)}" y="${(ly + labelOffset).toFixed(1)}">${g.min}</text>` +
      `<text class="lim max-label" x="${rx.toFixed(1)}" y="${(ry + labelOffset).toFixed(1)}">${g.max}</text>` +
      `<text class="val" x="100" y="${valueY}">--</text>` +
      `<text class="unit" x="100" y="${unitY}">${g.unit}</text>${trend}`;
    const singleGaugeMarkup = spec
      ? `<g transform="translate(0 -14)"><g transform="translate(100 55) scale(${gaugeScale}) translate(-100 -55)">${markup}</g></g>`
      : markup;
    // --- added: "safe to shut down" strip in the free space below the EGT dial
    const coolStrip = g.key === "egt"
      ? `<g id="cool"><rect class="cool-bg" x="22" y="100" width="156" height="36" rx="9"/><text class="cool-main" id="coolMain" x="100" y="115.5">EGT: waiting</text><text class="cool-sub" id="coolSub" x="100" y="128"></text></g>` : "";
    el.innerHTML = combined ? markup : `<svg viewBox="0 0 200 170" preserveAspectRatio="xMidYMid meet">${singleGaugeMarkup}${coolStrip}</svg>`;
    (combined ? comboSvg : grid).appendChild(el);
    g.el = el; g.needle = el.querySelector(".needle"); g.valEl = el.querySelector(".val");
    g.pkEl = el.querySelector(".pk"); g.mnEl = el.querySelector(".mn"); g.trEl = el.querySelector(".trend");
    g.minEl = el.querySelector(".min-label"); g.maxEl = el.querySelector(".max-label"); g.coolTick = el.querySelector(".cooltick");
    g.tickEls = el.querySelector(".ticks");
    g.zoneEls = Object.fromEntries(Array.from(el.querySelectorAll("[data-zone]"), zone => [zone.dataset.zone, zone]));
    updateGaugeLimits(g);
    if (g.key === "egt") egtTile = el;
  });

  // ================================================================ state
  const latest = {}, unknown = {}, cmds = {}, rawLog = [];
  const status = { coolant: 0, oil: 0, egt: 0, battery: 0, level: 0 };
  const ext = { coolant: { max: null }, egt: { max: null }, oil: { max: null, min: null } };
  const trends = { coolant: new L.Trend(), egt: new L.Trend() };
  const oilArm = new L.OilArm({ bar: SET.oilArmBar, sec: SET.oilArmSec, coolantC: SET.oilArmCoolantC });
  const levelDb = new L.Debounce(SET.levelHoldSec * 1000);
  let lastRx = 0, clockSec = NaN, connected = false, paused = false;
  const num = id => parseFloat(latest[id]);

  // A "session" = one log file. It starts with the first frame (or when the timer starts moving again) and ends when
  // no data arrives, or the session clock stops moving, for autoEndSec seconds (default 30), or when the clock restarts.
  // Short drops (under that time) stay in the same session.
  let sessionOpen = false, waitClock = false, clockAtEnd = NaN, lastClockMove = 0;
  function beginSession() {
    for (const k in ext) { ext[k].max = null; if ("min" in ext[k]) ext[k].min = null; }
    trends.coolant.reset(); trends.egt.reset(); oilArm.reset(); levelDb.reset();
    for (const k in status) status[k] = 0;
    sessionOpen = true; waitClock = false; lastClockMove = Date.now();
    renderAll(Date.now());
  }
  function finishSession(reason) {
    if (!sessionOpen) return;
    sessionOpen = false;
    log.boundary(reason); log.flush();
  }
  function restartSession(reason) { finishSession(reason); beginSession(); }

  // ================================================================ rendering
  function setMarker(el, g, n) {
    if (!el) return;
    if (n == null || !isFinite(n)) { el.setAttribute("visibility", "hidden"); return; }
    el.setAttribute("transform", `rotate(${gaugeAngle(g, n).toFixed(1)} 100 ${comboSpecs[g.id].cy})`);
    el.setAttribute("visibility", "visible");
  }
  function renderTrend(g) {
    if (!g.trEl) return;
    const s = trends[g.key].slopePerMin();
    if (s == null || Math.abs(s) < g.trendThr) { g.trEl.setAttribute("visibility", "hidden"); return; }
    g.trEl.querySelector("polygon").setAttribute("transform", s > 0 ? "" : "rotate(180)");
    g.trEl.setAttribute("visibility", "visible");
  }
  function renderGauge(gauge) {
    const raw = latest[gauge.id];
    if (raw === undefined) return;
    const value = parseFloat(raw);
    if (!isFinite(value)) {
      gauge.valEl.textContent = String(raw);
      return;
    }

    gauge.valEl.textContent = value.toFixed(gauge.dp);
    const spec = comboSpecs[gauge.id];
    gauge.needle.setAttribute("transform", `rotate(${gaugeAngle(gauge, value).toFixed(1)} 100 ${spec.cy})`);

    const alarmsEnabled = gauge.key !== "oil" || oilArm.armed;
    const severity = alarmsEnabled ? level(gauge, value) : 0;
    status[gauge.key] = severity;
    applySeverity(gauge.el, severity, {
      clear: ["ca", "al", "na"],
      extras: alarmsEnabled ? [] : ["na"],
    });

    setMarker(gauge.pkEl, gauge, ext[gauge.key].max);
    if (gauge.mnEl) setMarker(gauge.mnEl, gauge, ext.oil.min);
    renderTrend(gauge);
  }

  function renderBattery() {
    const gauge = G.battery;
    const raw = latest[gauge.id];
    if (raw === undefined) return;

    const value = parseFloat(raw);
    batteryVoltage.textContent = isFinite(value) ? value.toFixed(1) + " V" : "--.- V";
    const severity = isFinite(value) ? level(gauge, value) : 0;
    status.battery = severity;
    applySeverity(batteryIndicator, severity, {
      clear: ["ok", "ca", "al", "unknown", "flash"],
      unavailable: !isFinite(value),
      extras: severity === 2 ? ["flash"] : [],
    });
  }

  function renderLevel(now) {
    const raw = latest[IDS.level];
    if (raw === undefined) return;

    const value = parseFloat(raw);
    const lowCoolant = levelDb.update(now, isFinite(value) && levelBad(value));
    status.level = lowCoolant ? 2 : 0;
    applySeverity(levelIndicator, lowCoolant ? 2 : 0, {
      clear: ["ok", "ca", "al", "unknown", "flash"],
      unavailable: !isFinite(value),
      extras: lowCoolant ? ["flash"] : [],
    });
  }

  function renderCool(stale) {
    const strip = $("cool");
    const egt = num(IDS.egt);
    if (!strip) return;

    if (stale || !isFinite(egt)) {
      strip.setAttribute("class", "");
      $("coolMain").textContent = stale ? "NO DATA" : "EGT: waiting";
      $("coolSub").textContent = "";
      return;
    }

    const tooHotToStop = egt >= SET.cooldownC;
    strip.setAttribute("class", tooHotToStop ? "hot" : "safe");
    $("coolMain").textContent = tooHotToStop ? "HOT – IDLE TO COOL" : "SAFE TO SHUT DOWN";
    $("coolSub").textContent = "EGT limit " + SET.cooldownC + " °C";
  }

  function renderAll(now) {
    GAUGES.forEach(renderGauge);
    renderBattery();
    renderLevel(now);
    renderCool(false);
    // The combo tile border follows the worst reading shown on it.
    const sev = Math.max(status.coolant, status.oil, status.level, status.battery);
    applySeverity(comboTile, sev, {
      clear: ["alert-ca", "alert-al"],
      classes: { normal: "", caution: "alert-ca", alarm: "alert-al" },
    });
    if (egtTile) applySeverity(egtTile, status.egt, { clear: ["ca", "al"] });
  }
  function fmtClock(v) {
    const s = String(v); if (s.indexOf(":") >= 0) return s;
    const n = parseFloat(s); if (!isFinite(n)) return s;
    const m = Math.floor(n / 60), r = Math.floor(n % 60); return m + ":" + (r < 10 ? "0" : "") + r;
  }

  // ================================================================ frames
  // ASSUMPTION: the clock is either a ready-made "m:ss" string or a number of seconds. A drop of more than 5 s
  // is taken as "the POCCO+ restarted its session" and starts a new log file and clears peaks.
  function handleClock(value) {
    const seconds = L.clockSeconds(value);
    if (isFinite(seconds)) {
      if (isFinite(clockSec) && seconds < clockSec - 5) restartSession("timer restarted");
      if (!isFinite(clockSec) || seconds !== clockSec) {
        lastClockMove = Date.now();
        if (waitClock && seconds !== clockAtEnd) waitClock = false;
      }
      clockSec = seconds;
    }
    $("clock").textContent = fmtClock(value);
  }

  function onFrame(frame) {
    const now = Date.now();
    lastRx = now;
    connected = true;
    setStatus(demo ? "DEMO" : "connected", true);
    document.body.classList.remove("stale");
    if (!paused) {
      rawLog.push(new Date().toISOString().slice(11, 23) + "  " + JSON.stringify(frame));
      if (rawLog.length > 40) rawLog.shift();
    }
    if (frame && frame.command === "update:components" && Array.isArray(frame.widgets)) {
      let hasClock = false;
      frame.widgets.forEach(widget => {
        latest[widget.id] = widget.v;
        if (widget.id === IDS.clock) hasClock = true;
        if (!KNOWN.has(widget.id)) unknown[widget.id] = widget.v;
      });
      if (hasClock) handleClock(latest[IDS.clock]);
      if (!sessionOpen && !waitClock) beginSession();
      oilArm.update(now, num(IDS.oil), num(IDS.coolant));
      ["coolant", "oil", "egt"].forEach(key => {
        const value = num(G[key].id);
        if (!isFinite(value)) return;

        const extremes = ext[key];
        if (extremes.max == null || value > extremes.max) extremes.max = value;
        if (key === "oil" && oilArm.armed && (extremes.min == null || value < extremes.min)) {
          extremes.min = value;
        }
        if (trends[key]) trends[key].add(now, value);
      });
      renderAll(now);
    } else if (frame && frame.command && !cmds[frame.command]) {
      cmds[frame.command] = JSON.stringify(frame);
    }
  }

  // ================================================================ GPS
  let fix = null, gpsState = "starting", gpsWatch = null, gpsMsg = "";
  function startGps() {
    if (demo) {
      gpsState = "demo";
      return;
    }
    if (!navigator.geolocation) {
      gpsState = "unsupported";
      return;
    }

    try {
      if (gpsWatch != null) navigator.geolocation.clearWatch(gpsWatch);
      gpsState = "starting";
      gpsWatch = navigator.geolocation.watchPosition(position => {
        const coordinates = position.coords;
        fix = {
          lat: coordinates.latitude,
          lon: coordinates.longitude,
          acc: coordinates.accuracy,
          speed: coordinates.speed,
          heading: coordinates.heading,
          alt: coordinates.altitude,
          ts: position.timestamp,
        };
        gpsState = "fix";
      }, error => {
        gpsState = error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "nofix";
        gpsMsg = error.message || "";
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    } catch (error) {
      gpsState = "error";
      gpsMsg = String(error.message || error);
    }
  }

  function gpsChipText(now) {
    if (gpsState === "demo") return ["GPS demo", "good"];
    if (gpsState === "fix") {
      return now - fix.ts > 10000
        ? ["GPS stale", "warn"]
        : ["GPS ±" + Math.round(fix.acc) + " m", "good"];
    }

    const labels = {
      starting: "GPS …",
      unsupported: "GPS n/a",
      denied: "GPS denied",
      timeout: "GPS no fix",
      nofix: "GPS no fix",
      error: "GPS error",
    };
    return [labels[gpsState] || "GPS ?", "warn"];
  }

  // ================================================================ logging (IndexedDB, falls back to memory)
  let logStore = null, logBackend = "starting…";
  const storeReady = (async () => {
    try { const s = makeIdbStore(demo ? "pocco-log-demo" : "pocco-log"); await s.probe(); logStore = s; logBackend = "Saved in this browser" + (demo ? " (demo logs are kept separate from real ones)" : "") + "."; }
    catch (e) { logStore = makeMemStore(); logBackend = "Browser storage unavailable (" + e.message + "): logs are kept in memory only and vanish on reload."; }
  })();

  const log = { pending: [], needNew: true, sid: null, tripId: null, flushing: false, lastRow: 0, err: "" };
  log.add = row => { log.pending.push(row); log.lastRow = row.t; };
  log.boundary = reason => { log.pending.push({ boundary: true, reason, onEnd: sid => autoSave(sid, reason) }); };
  log.flush = async function () {
    if (log.flushing) return; log.flushing = true;
    try {
      await storeReady;
      const write = async rows => {
        if (!rows.length) return;
        if (log.needNew || log.sid == null) {
          log.tripId = L.createTripId();
          log.sid = await logStore.newSession(rows[0].t, log.tripId);
          log.needNew = false;
        }
        rows.forEach(row => { row.tripId = log.tripId; });
        await logStore.appendRows(log.sid, rows);
      };
      while (log.pending.length) {
        const batch = log.pending.splice(0); let cur = [];
        for (const r of batch) {
          if (r.boundary) {
            await write(cur); cur = [];
            const ended = log.needNew ? null : log.sid; log.needNew = true; log.sid = null; log.tripId = null;
            if (ended != null && r.onEnd) { try { r.onEnd(ended); } catch (e) {} }
          } else cur.push(r);
        }
        await write(cur);
      }
    } catch (e) { log.err = String((e && e.message) || e); } finally { log.flushing = false; }
  };

  function makeRow(now) {
    const val = (id, dp) => { const raw = latest[id]; if (raw === undefined) return null; const n = parseFloat(raw); return isFinite(n) ? +n.toFixed(dp) : String(raw); };
    const flags = [], add = (name, lv) => { if (lv === 1) flags.push(name + "_CA"); else if (lv === 2) flags.push(name + "_AL"); };
    add("coolant", status.coolant); add("oil", status.oil); add("egt", status.egt); add("battery", status.battery); add("level", status.level);
    const row = {
      t: now, clock: isFinite(clockSec) ? Math.round(clockSec) : null,
      coolant: val(IDS.coolant, 1), oil: val(IDS.oil, 2), egt: val(IDS.egt, 0), battery: val(IDS.battery, 2), level: val(IDS.level, 2),
      flags: flags.join(";"),
    };
    if (fix) {
      const f = x => (x == null || !isFinite(x)) ? null : x;
      row.lat = +fix.lat.toFixed(6); row.lon = +fix.lon.toFixed(6); row.acc = f(+(+fix.acc).toFixed(1));
      row.speed = f(fix.speed == null ? null : +(fix.speed * 3.6).toFixed(1));
      row.heading = f(fix.heading == null ? null : +(+fix.heading).toFixed(0));
      row.alt = f(fix.alt == null ? null : +(+fix.alt).toFixed(1));
      row.gpsAge = +((now - fix.ts) / 1000).toFixed(1);
    }
    return row;
  }

  // ---- CSV export. In a browser: normal download. In the Capacitor Android app a blob download does not
  // work (see README), so the app writes to the selected folder and offers Save / Share.
  const Cap = window.Capacitor;
  const native = !!(Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform());
  // The page is not bundled, so window.Capacitor only has the low-level bridge (nativePromise). Use a plugin
  // proxy when one exists, otherwise call the native plugin directly.
  const callNative = (plug, method, opts) => {
    if (Cap.Plugins && Cap.Plugins[plug] && Cap.Plugins[plug][method]) return Cap.Plugins[plug][method](opts);
    if (typeof Cap.registerPlugin === "function") return Cap.registerPlugin(plug)[method](opts);
    if (typeof Cap.nativePromise === "function") return Cap.nativePromise(plug, method, opts);
    return Promise.reject(new Error("Capacitor bridge not available"));
  };
  const exportMsg = t => { $("exportMsg").textContent = t; };
  async function getOutputFolder() {
    return native ? callNative("OutputFolder", "getFolder", {}) : { selected: false, name: "Downloads" };
  }
  async function writeCsvFile(name, data) {
    const folder = await getOutputFolder();
    if (folder.selected) {
      await callNative("OutputFolder", "writeFile", { name, data });
    } else {
      await callNative("Filesystem", "writeFile", { path: name, data, directory: "DOCUMENTS", encoding: "utf8" });
    }
    return folder;
  }
  async function refreshOutputFolder() {
    const row = $("outputFolderRow");
    if (!native) { row.style.display = "none"; return; }
    row.style.display = "";
    try {
      const folder = await getOutputFolder();
      $("outputFolderInfo").textContent = "Current: " + (folder.selected ? folder.name : "Documents (default)");
      $("outputFolderInfo").style.color = "var(--mut)";
    } catch (e) {
      $("outputFolderInfo").textContent = "Could not read output folder: " + ((e && e.message) || e);
      $("outputFolderInfo").style.color = "var(--al)";
    }
  }

  // ---- auto-save when a session ends (Android app only: a browser cannot save files silently)
  let infoUntil = 0;
  function info(t, bad) { $("logInfo").textContent = t; $("logInfo").style.color = bad ? "var(--al)" : "var(--ok)"; infoUntil = Date.now() + 60000; }
  async function autoSave(sid, reason, recovered) {
    try {
      const rows = await logStore.getRows(sid);
      if (demo || rows.length < 10) return;                       // ignore demo and tiny blips
      if (!SET.autoSave || !native) { info("Log ended (" + reason + "), kept in Menu"); return; }
      const name = L.fileName(rows[0].t, rows[rows.length - 1].t);
      const folder = await writeCsvFile(name, L.buildCsv(rows));
      await logStore.markSaved(sid, name);
      info(recovered ? "Saved an earlier unsaved log (" + rows.length + " rows)" : "Log saved (" + rows.length + " rows)");
      exportMsg("Auto-saved to " + (folder.selected ? folder.name : "Documents") + ": " + name);
      return true;
    } catch (e) { info("Auto-save failed, log kept in Menu", true); exportMsg("Auto-save failed: " + ((e && e.message) || e)); }
    return false;
  }
  async function exportCsv(sid, how) {
    try {
      await log.flush();
      const rows = await logStore.getRows(sid);
      if (!rows.length) { exportMsg("That session has no rows."); return; }
      const csv = L.buildCsv(rows), name = L.fileName(rows[0].t, rows[rows.length - 1].t);
      if (!native) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        exportMsg("Download started: " + name); return;
      }
      if (how === "share") {
        await callNative("Filesystem", "writeFile", { path: name, data: csv, directory: "CACHE", encoding: "utf8" });
        const u = await callNative("Filesystem", "getUri", { path: name, directory: "CACHE" });
        await callNative("Share", "share", { title: name, files: [u.uri] });
        exportMsg("Shared " + name);
      } else {
        const folder = await writeCsvFile(name, csv);
        await logStore.markSaved(sid, name);
        exportMsg("Saved to " + (folder.selected ? folder.name : "Documents") + ": " + name);
      }
    } catch (e) { exportMsg("Export failed: " + ((e && e.message) || e) + (how === "save" ? " (try Share instead)" : "")); }
  }
  async function renderSessions() {
    await log.flush(); await storeReady;
    $("logBackend").textContent = logBackend + (log.err ? "  Last error: " + log.err : "");
    const list = await logStore.listSessions();
    $("sessions").innerHTML = list.length ? list.map(s =>
      `<div class="srow"><span>${L.fmtLocal(s.start)} → ${L.fmtLocal(s.end).slice(11)}<br>${s.rows} rows${s.saved ? " · saved ✓" : ""}</span><span class="btns">` +
      (native ? `<button data-sid="${s.id}" data-how="save">Save</button><button data-sid="${s.id}" data-how="share">Share</button>`
              : `<button data-sid="${s.id}" data-how="save">Download CSV</button>`) + `</span></div>`).join("") : "<p>No logged sessions yet.</p>";
  }

  // ================================================================ websocket / demo
  const enc = new TextEncoder();
  const PING = Uint8Array.from([0x81, 0xa7, ...enc.encode("command"), 0xa4, ...enc.encode("ping")]); // {"command":"ping"}
  function setStatus(text, connectedOk) {
    $("status").textContent = text;
    $("bar").className = connectedOk ? "ok" : "";
  }

  let activeSocket = null, activePingTimer = null, connectTimer = null;
  let wifiController;

  function connect() {
    if (activeSocket && (activeSocket.readyState === WebSocket.CONNECTING || activeSocket.readyState === WebSocket.OPEN)) return;
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
    if (activeSocket) {
      try {
        activeSocket.onclose = null;
        activeSocket.onerror = null;
        activeSocket.close();
      } catch (e) {}
      activeSocket = null;
    }

    setStatus("connecting…", false);
    let socket;
    try {
      socket = new WebSocket(url);
      activeSocket = socket;
    } catch (error) {
      setStatus("bad URL", false);
      connectTimer = setTimeout(() => native ? wifiController.check() : connect(), 3000);
      return;
    }

    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      if (socket !== activeSocket) return;
      connected = true;
      setStatus("connected", true);
      activePingTimer = setInterval(() => {
        try {
          socket.send(PING);
        } catch (error) {}
      }, 5000);
    };
    socket.onmessage = event => {
      if (socket !== activeSocket) return;
      try {
        onFrame(typeof event.data === "string" ? JSON.parse(event.data) : unpack(event.data));
        $("decErr").textContent = "";
      } catch (error) {
        $("decErr").textContent = "decode error: " + error.message;
      }
    };
    socket.onclose = () => {
      if (socket === activeSocket) {
        connected = false;
        activeSocket = null;
        if (activePingTimer) clearInterval(activePingTimer);
        activePingTimer = null;
        if (native) {
          setStatus("Checking POCCO Wi-Fi…", false);
          connectTimer = setTimeout(() => wifiController.check(), 3000);
        } else {
          setStatus("disconnected, retrying…", false);
          connectTimer = setTimeout(connect, 3000);
        }
      } else {
        if (activePingTimer) clearInterval(activePingTimer);
        activePingTimer = null;
      }
    };
    socket.onerror = () => {
      try {
        socket.close();
      } catch (error) {}
    };
  }

  function stopSocket() {
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
    if (activePingTimer) {
      clearInterval(activePingTimer);
      activePingTimer = null;
    }
    if (activeSocket) {
      const socket = activeSocket;
      activeSocket = null;
      socket.onclose = null;
      socket.onerror = null;
      try {
        socket.close();
      } catch (e) {}
    }
    connected = false;
  }

  wifiController = createWifiController({
    native,
    demo,
    capacitor: Cap,
    getSsid: () => (($("wifiSsidIn") ? $("wifiSsidIn").value.trim() : wifiSsid) || DEFAULT_SSID).trim(),
    callNative,
    connect,
    stopSocket,
    setStatus,
    setWifiInfo: (text, color) => {
      if (!$("wifiStatusInfo")) return;
      $("wifiStatusInfo").textContent = text;
      if (color) $("wifiStatusInfo").style.color = color;
    },
  });

  function startDemo() {
    connected = true;
    setStatus("DEMO", true);
    let elapsedSeconds = 0, egt = 180;
    setInterval(() => {
      elapsedSeconds += 0.5;
      const tripSeconds = elapsedSeconds % 420; // 7 minute "drive", then the session clock restarts
      const warmup = 1 - Math.exp(-tripSeconds / 150);
      const engineLoad = (tripSeconds > 240 && tripSeconds < 330)
        ? 0
        : 0.5 + 0.5 * Math.sin(tripSeconds / 20); // idle at 240 s shows the cool-down strip
      const oil = tripSeconds < 4
        ? 0
        : 4.3 - 2.2 * warmup + 0.5 * engineLoad + (Math.random() - 0.5) * 0.06;
      const coolant = 45 + 45 * warmup + 6 * Math.sin(tripSeconds / 70) +
        ((tripSeconds > 260 && tripSeconds < 290) ? 28 : 0); // brief overheat for caution/alarm
      egt += ((150 + 520 * Math.pow(Math.max(engineLoad, 0), 1.4)) - egt) * 0.06;
      const battery = (tripSeconds < 3 ? 12.1 : 13.9) - 0.5 * Math.sin(tripSeconds / 17);
      const coolantLevel = ((tripSeconds > 100 && tripSeconds < 101) ? 0.2 : 0) +
        ((tripSeconds > 330 && tripSeconds < 345) ? 0.3 : 0); // 1 s blip, then sustained fault
      fix = {
        lat: -25 + tripSeconds * 0.00005,
        lon: 25 + tripSeconds * 0.00007,
        acc: 5 + 3 * Math.sin(tripSeconds / 9),
        speed: engineLoad > 0 ? 8 + 6 * engineLoad : 0,
        heading: 90,
        alt: 1200,
        ts: Date.now(),
      };
      onFrame({ command: "update:components", widgets: [
        { id: 2, v: oil.toFixed(2) },
        { id: 3, v: coolant.toFixed(2) },
        { id: 4, v: coolantLevel.toFixed(2) },
        { id: 5, v: egt.toFixed(0) },
        { id: 6, v: battery.toFixed(2) },
        { id: 8, v: Math.floor(tripSeconds) },
        { id: 99, v: "demo-unknown" },
      ] });
    }, 500);
  }

  // ================================================================ theme / light sensor
  // AmbientLightSensor is an experimental web API; many Android browsers/WebViews do not expose it.
  // If it is missing the page simply stays in Day mode unless you pick Night.
  let lux = null, lightState = "not supported on this browser", night = false;
  function applyTheme() {
    const m = SET.theme; let n;
    if (m === "night") n = true; else if (m === "day") n = false;
    else if (lux != null) n = night ? lux < 40 : lux < 15; else n = false;
    night = n; document.body.classList.toggle("night", n);
    $("themeBtn").textContent = m === "auto" ? "Auto" : m === "day" ? "Day" : "Night";
  }
  try {
    if ("AmbientLightSensor" in window) {
      const s = new AmbientLightSensor({ frequency: 1 }); lightState = "starting…";
      s.onreading = () => { lux = s.illuminance; lightState = "working"; applyTheme(); };
      s.onerror = e => { lightState = "blocked or unavailable (" + ((e.error && e.error.name) || "error") + ")"; };
      s.start();
    }
  } catch (e) { lightState = "unavailable (" + e.name + ")"; }
  $("themeBtn").onclick = () => { const o = ["auto", "day", "night"]; SET.theme = o[(o.indexOf(SET.theme) + 1) % 3]; store.set("settings", JSON.stringify(SET)); applyTheme(); };
  applyTheme();

  const menu = createMenu({
    config: { G, FIELDS, LABELS, OTHER, SET, DEFAULT_URL, DEFAULT_SSID, url, demo, wifiSsid },
    store,
    state: {
      getMenuInfo: () => ({ gpsState, gpsMsg }),
      getDebugInfo: () => ({ unknown, cmds, rawLog }),
      isPaused: () => paused,
      setPaused: value => { paused = value; },
    },
    actions: {
      updateGaugeLimits, renderAll, applyWifiConnect: () => wifiController.apply(), renderSessions, refreshOutputFolder,
      callNative, exportMsg, startGps, exportCsv,
      clearLogs: async () => {
        await log.flush();
        await logStore.clear();
        log.sid = null;
        log.needNew = true;
      },
    },
  });
  // tap a gauge tile to clear its peak/low markers
  comboTile.addEventListener("click", () => {
    ["coolant", "oil"].forEach(key => {
      ext[key].max = null;
      if ("min" in ext[key]) ext[key].min = null;
    });
    renderAll(Date.now());
  });
  egtTile.addEventListener("click", () => {
    ext.egt.max = null;
    renderAll(Date.now());
  });

  // ================================================================ timers
  setInterval(() => {
    const now = Date.now();
    const stale = now - lastRx > 3000;
    document.body.classList.toggle("stale", stale);
    if (connected) {
      $("status").textContent = stale ? "connected, no data" : demo ? "DEMO" : "connected";
    }
    renderLevel(now);
    renderCool(stale);

    const gpsStatus = gpsChipText(now);
    $("gpsChip").textContent = gpsStatus[0];
    $("gpsChip").className = "chip " + gpsStatus[1];
    $("recChip").style.display = (!stale && now - log.lastRow < 3000) ? "" : "none";
    if (log.err) {
      $("logInfo").textContent = "log error";
      $("logInfo").style.color = "var(--al)";
    }
    else if (now > infoUntil) $("logInfo").textContent = "";

    if (sessionOpen) {
      const idleMs = Math.max(5, SET.autoEndSec) * 1000;
      const dataGap = now - lastRx;
      const clockGap = isFinite(clockSec) ? now - lastClockMove : 0;
      if (dataGap > idleMs) {
        finishSession("no data");
      } else if (clockGap > idleMs) {
        waitClock = true;
        clockAtEnd = clockSec;
        finishSession("timer stopped");
      }
    }

    setWakeLock(demo || sessionOpen);

    if ($("panel").classList.contains("open")) menu.renderDebug();
  }, 1000);
  setInterval(() => {
    const now = Date.now();
    if (sessionOpen && now - lastRx <= 3000) log.add(makeRow(now));
  }, 1000); // one row per second while data is fresh
  setInterval(() => log.flush(), 5000);

  // Dynamic screen wake lock management
  let wakeLockSentinel = null;
  async function setWakeLock(active) {
    if (active) {
      if (!wakeLockSentinel && "wakeLock" in navigator) {
        try {
          wakeLockSentinel = await navigator.wakeLock.request("screen");
          wakeLockSentinel.addEventListener("release", () => { wakeLockSentinel = null; });
        } catch (error) {}
      }
    } else {
      if (wakeLockSentinel) {
        try {
          await wakeLockSentinel.release();
        } catch (error) {}
        wakeLockSentinel = null;
      }
    }
  }

  document.addEventListener("click", () => setWakeLock(demo || sessionOpen), { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      log.flush();
      setWakeLock(false);
    } else {
      setWakeLock(demo || sessionOpen);
      wifiController.resume();
    }
  });
  window.addEventListener("pagehide", () => {
    log.flush();
    setWakeLock(false);
  });
  window.addEventListener("pageshow", () => wifiController.resume());

  // Logs that never got saved (app closed, phone off or crashed mid-trip) are saved a few seconds after start-up.
  async function recoverUnsaved() {
    if (demo || !native || !SET.autoSave) return;
    await storeReady; await new Promise(r => setTimeout(r, 4000));
    const list = (await logStore.listSessions()).filter(x => !x.saved && x.rows >= 10 && x.id !== log.sid).reverse();   // oldest first
    let n = 0;
    for (const x of list) { if (sessionOpen && x.id === log.sid) continue; if (await autoSave(x.id, "recovered", true)) n++; }
    if (n > 1) info("Saved " + n + " earlier unsaved logs");
  }
  recoverUnsaved();

  startGps();
  if (demo) startDemo();
  wifiController.start();
})();
