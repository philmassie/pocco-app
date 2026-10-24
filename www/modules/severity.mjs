export function applySeverity(element, severity, {
  clear = [],
  classes = { normal: "", caution: "ca", alarm: "al" },
  unavailable = false,
  unavailableClass = "unknown",
  extras = [],
} = {}) {
  element.classList.remove(...clear);
  const colorClass = unavailable
    ? unavailableClass
    : severity >= 2
      ? classes.alarm
      : severity === 1
        ? classes.caution
        : classes.normal;
  if (colorClass) element.classList.add(colorClass);
  extras.forEach(className => element.classList.add(className));
}
