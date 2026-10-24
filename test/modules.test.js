const assert = require("assert");

async function main() {
  const { createAppConfig } = await import("../www/modules/config.mjs");
  const { makeMemStore } = await import("../www/modules/log-storage.mjs");
  const { applySeverity } = await import("../www/modules/severity.mjs");
  const values = {
    demo: "0",
    limits: JSON.stringify({ oil: { max: 8 }, coolant: { cautionHi: 92 } }),
    settings: JSON.stringify({ theme: "night", autoSave: 0 }),
  };
  const storage = { get: (key, fallback) => values[key] ?? fallback };
  const config = createAppConfig(storage, "?demo=1");

  assert.strictEqual(config.demo, true);
  assert.strictEqual(config.url, "ws://192.168.4.1/dashws");
  assert.strictEqual(config.G.oil.max, 8);
  assert.strictEqual(config.G.oil.tickStep, 1);
  assert.strictEqual(config.G.coolant.cautionHi, 92);
  assert.strictEqual(config.G.coolant.tickStep, 20);
  assert.strictEqual(config.G.egt.tickStep, 200);
  assert.strictEqual(config.SET.theme, "night");
  assert.strictEqual(config.SET.autoSave, 0);
  assert.deepStrictEqual(config.GAUGES.map(gauge => gauge.key), ["oil", "coolant", "egt"]);

  const classes = new Set(["indicator", "old-state"]);
  const element = { classList: {
    remove: (...names) => names.forEach(name => classes.delete(name)),
    add: name => classes.add(name),
  } };
  applySeverity(element, 0, { clear: ["old-state", "ok", "ca", "al", "unknown", "flash"] });
  assert.deepStrictEqual([...classes], ["indicator"]);
  applySeverity(element, 2, {
    clear: ["old-state", "ok", "ca", "al"],
    classes: { normal: "ok", caution: "ca", alarm: "al" },
    extras: ["flash"],
  });
  assert.deepStrictEqual([...classes].sort(), ["al", "flash", "indicator"]);
  applySeverity(element, 0, {
    clear: ["ok", "ca", "al", "unknown", "flash"],
    classes: { normal: "ok", caution: "ca", alarm: "al" },
    unavailable: true,
  });
  assert.deepStrictEqual([...classes].sort(), ["indicator", "unknown"]);

  const logs = makeMemStore();
  assert.strictEqual(await logs.probe(), true);
  const sid = await logs.newSession(100, "trip-1");
  await logs.appendRows(sid, [{ t: 101, coolant: 88 }]);
  await logs.markSaved(sid, "drive.csv");
  assert.deepStrictEqual(await logs.listSessions(), [
    { id: sid, start: 100, end: 101, rows: 1, tripId: "trip-1", saved: "drive.csv" },
  ]);
  assert.deepStrictEqual(await logs.getRows(sid), [{ sid, t: 101, coolant: 88 }]);
  await logs.clear();
  assert.deepStrictEqual(await logs.listSessions(), []);
}

main().then(() => console.log("module tests passed")).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
