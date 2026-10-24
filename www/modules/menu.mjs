export function createMenu({ config, store, state, actions }) {
  const $ = id => document.getElementById(id);
  const { G, FIELDS, LABELS, OTHER, SET, DEFAULT_URL, DEFAULT_SSID, url, demo, wifiSsid, wifiPass, wifiAuto } = config;

  function buildEditors() {
    const box = $("limits"); box.innerHTML = "";
    Object.keys(G).forEach(k => {
      const g = G[k], row = document.createElement("div"); row.className = "lrow";
      row.innerHTML = `<b>${g.name} (${g.unit})</b>` +
        FIELDS.filter(f => !(g.noDial && (f === "min" || f === "max"))).map(f =>
          `<label>${LABELS[f]}<input type="number" step="any" inputmode="decimal" data-g="${k}" data-f="${f}" value="${g[f] == null ? "" : g[f]}"></label>`).join("");
      box.appendChild(row);
    });
    const ob = $("others"); ob.innerHTML = "";
    const row = document.createElement("div"); row.className = "lrow";
    row.innerHTML = OTHER.map(([k, lab]) => `<label>${lab}<input type="number" step="any" inputmode="decimal" data-s="${k}" value="${SET[k] == null ? "" : SET[k]}"></label>`).join("");
    ob.appendChild(row);
  }

  function previewThresholds() {
    Object.keys(G).forEach(k => {
      const g = G[k];
      const inputValue = field => {
        const input = $("limits").querySelector(`input[data-g="${k}"][data-f="${field}"]`);
        return input ? parseFloat(input.value) : NaN;
      };
      const min = inputValue("min"), max = inputValue("max");
      if (!g.noDial && isFinite(min) && isFinite(max) && max > min) {
        g.min = min;
        g.max = max;
      }
      FIELDS.filter(f => f !== "min" && f !== "max").forEach(f => {
        const n = inputValue(f);
        g[f] = isFinite(n) ? n : null;
      });
      if (g.zoneEls) actions.updateGaugeLimits(g);
    });
    actions.renderAll(Date.now());
  }

  function readEditors() {
    const lim = {}; let err = "";
    Object.keys(G).forEach(k => { lim[k] = {}; });
    $("limits").querySelectorAll("input").forEach(i => {
      const n = parseFloat(i.value);
      lim[i.dataset.g][i.dataset.f] = isFinite(n) ? n : null;
    });
    Object.keys(G).forEach(k => {
      if (G[k].noDial) return;
      const s = lim[k];
      if (s.min == null || s.max == null || !(s.max > s.min)) {
        err = G[k].name + ": dial min and max must be set, with max greater than min.";
      }
    });
    const st = Object.assign({}, SET);
    $("others").querySelectorAll("input").forEach(i => {
      const n = parseFloat(i.value), k = i.dataset.s;
      if (k === "oilArmCoolantC") st[k] = isFinite(n) ? n : null;
      else if (isFinite(n) && n >= 0) st[k] = n;
      else err = err || "Other settings need numbers (zero or more).";
    });
    st.autoSave = $("autoSaveIn").checked ? 1 : 0;
    return { lim, st, err };
  }

  function renderMenuInfo() {
    const { lightState, lux, gpsState, gpsMsg } = state.getMenuInfo();
    $("lightInfo").textContent = "Light sensor: " + lightState + (lux != null ? " (" + Math.round(lux) + " lux)" : "") +
      ". The Auto/Day/Night button in the top bar cycles the mode. Auto only changes this page's colours when the sensor works, otherwise it stays Day. Your phone's own auto-brightness controls the screen backlight.";
    $("gpsInfo").textContent = "GPS: " + gpsState + (gpsMsg && gpsState !== "fix" ? " (" + gpsMsg + ")" : "") +
      ". Browsers usually ask for location permission once and may need a secure page (https or localhost) to allow it.";
  }

  function renderDebug() {
    const { unknown, cmds, rawLog } = state.getDebugInfo();
    $("unk").textContent = Object.keys(unknown).length ? Object.keys(unknown).map(k => "id " + k + ": " + JSON.stringify(unknown[k])).join("\n") : "none yet";
    $("cmds").textContent = Object.keys(cmds).length ? Object.keys(cmds).map(k => k + ": " + cmds[k]).join("\n") : "none yet";
    const t = $("raw"); t.value = rawLog.join("\n"); t.scrollTop = t.scrollHeight;
  }

  buildEditors();
  $("urlIn").value = url; $("demoIn").checked = demo; $("autoSaveIn").checked = !!SET.autoSave;
  if ($("wifiSsidIn")) $("wifiSsidIn").value = wifiSsid;
  if ($("wifiPassIn")) $("wifiPassIn").value = wifiPass;
  if ($("wifiAutoIn")) $("wifiAutoIn").checked = wifiAuto;
  if ($("wifiAutoIn")) $("wifiAutoIn").onchange = () => {
    store.set("wifiSsid", ($("wifiSsidIn").value.trim() || DEFAULT_SSID));
    store.set("wifiPass", $("wifiPassIn").value);
    store.set("wifiAuto", $("wifiAutoIn").checked ? "1" : "0");
    actions.applyWifiConnect();
  };
  $("demoIn").onchange = () => {
    store.set("demo", $("demoIn").checked ? "1" : "0");
    location.reload();
  };
  $("menuBtn").onclick = () => {
    buildEditors();
    renderDebug();
    renderMenuInfo();
    actions.renderSessions();
    $("panel").classList.add("open");
    actions.refreshOutputFolder();
  };
  $("limits").addEventListener("input", previewThresholds);
  $("closeBtn").onclick = () => {
    const result = readEditors();
    if (!result.err) {
      store.set("limits", JSON.stringify(result.lim));
      store.set("settings", JSON.stringify(result.st));
    }
    if ($("wifiSsidIn")) {
      const ssid = $("wifiSsidIn").value.trim() || DEFAULT_SSID;
      const password = $("wifiPassIn").value;
      const auto = $("wifiAutoIn").checked ? "1" : "0";
      const changed = ssid !== store.get("wifiSsid", DEFAULT_SSID) ||
        password !== store.get("wifiPass", "") || auto !== store.get("wifiAuto", "1");
      store.set("wifiSsid", ssid);
      store.set("wifiPass", password);
      store.set("wifiAuto", auto);
      if (changed) actions.applyWifiConnect();
    }
    $("panel").classList.remove("open");
  };
  $("chooseFolderBtn").onclick = async () => {
    try {
      const result = await actions.callNative("OutputFolder", "chooseFolder", {});
      if (result.cancelled) return;
      await actions.refreshOutputFolder();
      actions.exportMsg("CSV output folder set to " + result.name + ".");
    } catch (e) {
      $("outputFolderInfo").textContent = "Folder selection failed: " + ((e && e.message) || e);
      $("outputFolderInfo").style.color = "var(--al)";
    }
  };
  $("documentsFolderBtn").onclick = async () => {
    try {
      await actions.callNative("OutputFolder", "clearFolder", {});
      await actions.refreshOutputFolder();
      actions.exportMsg("CSV output folder reset to Documents.");
    } catch (e) {
      $("outputFolderInfo").textContent = "Could not reset output folder: " + ((e && e.message) || e);
      $("outputFolderInfo").style.color = "var(--al)";
    }
  };
  $("saveBtn").onclick = () => {
    const result = readEditors();
    if (result.err) {
      $("limErr").textContent = result.err;
      return;
    }
    store.set("limits", JSON.stringify(result.lim));
    store.set("settings", JSON.stringify(result.st));
    store.set("url", $("urlIn").value.trim() || DEFAULT_URL);
    store.set("demo", $("demoIn").checked ? "1" : "0");
    if ($("wifiSsidIn")) {
      store.set("wifiSsid", ($("wifiSsidIn").value.trim() || DEFAULT_SSID));
      store.set("wifiPass", $("wifiPassIn").value);
      store.set("wifiAuto", $("wifiAutoIn").checked ? "1" : "0");
    }
    location.reload();
  };
  $("resetBtn").onclick = () => {
    store.del("url");
    $("urlIn").value = DEFAULT_URL;
  };
  $("resetLimBtn").onclick = () => {
    store.del("limits");
    store.del("settings");
    location.reload();
  };
  $("gpsBtn").onclick = () => {
    actions.startGps();
    setTimeout(renderMenuInfo, 1500);
  };
  $("sessions").onclick = event => {
    const button = event.target.closest("button[data-sid]");
    if (button) actions.exportCsv(+button.dataset.sid, button.dataset.how);
  };
  $("delLogsBtn").onclick = async () => {
    if (!confirm("Delete ALL logged sessions on this device?")) return;
    await actions.clearLogs();
    actions.renderSessions();
  };
  $("pauseBtn").onclick = () => {
    const paused = !state.isPaused();
    state.setPaused(paused);
    $("pauseBtn").textContent = paused ? "Resume log" : "Pause log";
  };
  $("copyBtn").onclick = () => {
    const rawText = $("raw");
    rawText.select();
    try {
      (navigator.clipboard ? navigator.clipboard.writeText(rawText.value) : Promise.reject())
        .catch(() => document.execCommand("copy"));
    } catch (error) {
      document.execCommand("copy");
    }
  };

  return { renderDebug, renderMenuInfo };
}
