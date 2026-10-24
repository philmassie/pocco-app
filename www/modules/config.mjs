export function createAppConfig(store, query) {
  const params = new URLSearchParams(query);
  const demo = params.get("demo") === "1" || store.get("demo", "0") === "1";
  const DEFAULT_URL = "ws://192.168.4.1/dashws";
  const url = store.get("url", DEFAULT_URL);
  const DEFAULT_SSID = "Madman POCCO+";
  const wifiSsid = store.get("wifiSsid", DEFAULT_SSID);
  const wifiPass = store.get("wifiPass", "");
  const wifiAuto = store.get("wifiAuto", "1") === "1";

  // Widget ids come from your DevTools capture of ws://192.168.4.1/dashws.
  // Limits below are PLACEHOLDERS that only colour the dials; change them in Menu.
  // The POCCO+ keeps its own alarm limits (and the buzzer); this page does not read them from the device.
  //  - Battery limits follow the manual's suggested values (low alarm ~12 V, caution ~12.5 V, high caution ~14 V, high alarm ~14.5 V).
  //  - EGT 720 C alarm is the manual's "absolute max" for mechanically injected diesels.
  //  - Coolant, oil and the EGT caution value are guesses: edit to suit your 300Tdi.
  // Units are assumed metric; if the unit is set to imperial, change unit/min/max/limits.
  const IDS = { oil: 2, coolant: 3, level: 4, egt: 5, battery: 6, clock: 8 };
  const KNOWN = new Set([2, 3, 4, 5, 6, 8]);
  const G = {
    oil: { id: 2, name: "Oil pressure", unit: "bar", min: 0, max: 7, dp: 1, tickStep: 1, alarmLo: 0.5, cautionLo: 0.7, cautionHi: 5, alarmHi: 6 },
    coolant: { id: 3, name: "Coolant", unit: "°C", min: 20, max: 120, dp: 0, tickStep: 20, alarmLo: 0, cautionLo: 40, cautionHi: 95, alarmHi: 100, trendThr: 1.5 },
    egt: { id: 5, name: "EGT", unit: "°C", min: 0, max: 800, dp: 0, tickStep: 200, cautionHi: 700, alarmHi: 720, trendThr: 30 },
    battery: { id: 6, name: "Battery", unit: "V", min: 8, max: 16, dp: 1, alarmLo: 12, cautionLo: 12.5, cautionHi: 14, alarmHi: 14.5, noDial: true },
  };
  Object.keys(G).forEach(k => { G[k].key = k; });
  const GAUGES = [G.oil, G.coolant, G.egt];
  const FIELDS = ["min", "max", "alarmLo", "cautionLo", "cautionHi", "alarmHi"];
  const LABELS = { min: "Dial min", max: "Dial max", alarmLo: "Alarm low", cautionLo: "Caution low", cautionHi: "Caution high", alarmHi: "Alarm high" };
  const SET0 = { oilArmBar: 1.0, oilArmSec: 20, oilArmCoolantC: null, levelHoldSec: 2, cooldownC: 200, theme: "auto", autoSave: 1, autoEndSec: 30 };
  const OTHER = [
    ["oilArmBar", "Oil: engine-running level (bar)"],
    ["oilArmSec", "Oil: hold time before armed (s)"],
    ["oilArmCoolantC", "Oil: also need coolant above (°C), blank = off"],
    ["levelHoldSec", "Coolant level: hold before lamp changes (s)"],
    ["cooldownC", "EGT: safe to shut down below (°C)"],
    ["autoEndSec", "Log ends after this many seconds with no data or a stopped timer"],
  ];
  // Widget 4 "low coolant" read 0.00 in your capture. ASSUMPTION: 0 = level OK, above 0 = low. Not verified on the car.
  const levelBad = n => n > 0;

  let limits = {};
  try { limits = JSON.parse(store.get("limits", "{}")) || {}; } catch (e) {}
  Object.keys(G).forEach(k => {
    const saved = limits[k];
    if (saved) FIELDS.forEach(f => { if (f in saved) G[k][f] = saved[f]; });
  });
  const SET = Object.assign({}, SET0);
  try { Object.assign(SET, JSON.parse(store.get("settings", "{}")) || {}); } catch (e) {}

  return {
    demo, DEFAULT_URL, url, DEFAULT_SSID, wifiSsid, wifiPass, wifiAuto,
    IDS, KNOWN, G, GAUGES, FIELDS, LABELS, SET, OTHER, levelBad,
  };
}
