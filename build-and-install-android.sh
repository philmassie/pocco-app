#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APK="$ROOT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"

if command -v adb >/dev/null 2>&1; then
  ADB="$(command -v adb)"
else
  SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
  ADB="$SDK_DIR/platform-tools/adb"
  if [[ ! -x "$ADB" ]]; then
    echo "Error: adb was not found. Add Android platform-tools to PATH or set ANDROID_HOME." >&2
    exit 1
  fi
fi

DEVICES="$("$ADB" devices)"
CONNECTED=()
UNAUTHORIZED=()
while read -r serial state _; do
  [[ -z "${serial:-}" || "$serial" == "List" ]] && continue
  case "${state:-}" in
    device) CONNECTED+=("$serial") ;;
    unauthorized) UNAUTHORIZED+=("$serial") ;;
  esac
done <<< "$DEVICES"

if (( ${#CONNECTED[@]} != 1 )); then
  if (( ${#CONNECTED[@]} == 0 && ${#UNAUTHORIZED[@]} > 0 )); then
    echo "Error: device is connected but unauthorized. Accept the USB debugging prompt, then retry." >&2
  elif (( ${#CONNECTED[@]} == 0 )); then
    echo "Error: no authorized Android device found. Connect one with USB debugging enabled." >&2
  else
    printf 'Error: expected exactly one authorized device; found %d: %s\n' \
      "${#CONNECTED[@]}" "${CONNECTED[*]}" >&2
  fi
  exit 1
fi
SERIAL="${CONNECTED[0]}"
MANUFACTURER="$("$ADB" -s "$SERIAL" shell getprop ro.product.manufacturer | tr -d '\r')"
MODEL="$("$ADB" -s "$SERIAL" shell getprop ro.product.model | tr -d '\r')"
HANDSET="${MANUFACTURER:+$MANUFACTURER }${MODEL:-Unknown handset}"
printf 'Target handset: %s (ADB serial: %s)\n' "$HANDSET" "$SERIAL"
if [[ ! -t 0 ]]; then
  echo "Error: confirmation is required, but stdin is not interactive." >&2
  exit 1
fi
read -r -p "Build and install to this handset? [y/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Cancelled; no build or install was performed."
  exit 0
fi

JAVA_CANDIDATES=()
if [[ -n "${JAVA_HOME:-}" ]]; then
  JAVA_CANDIDATES+=("$JAVA_HOME/bin/java")
fi
if command -v java >/dev/null 2>&1; then
  JAVA_CANDIDATES+=("$(command -v java)")
fi
for candidate in "$HOME"/.jdks/*/bin/java /usr/lib/jvm/*/bin/java /opt/android-studio/jbr/bin/java; do
  JAVA_CANDIDATES+=("$candidate")
done

JAVA=""
for candidate in "${JAVA_CANDIDATES[@]}"; do
  [[ -x "$candidate" ]] || continue
  version_line="$("$candidate" -version 2>&1 | head -n 1)"
  if [[ "$version_line" =~ version[[:space:]]+\"([0-9]+) ]]; then
    major="${BASH_REMATCH[1]}"
    if (( major >= 17 && major <= 24 )); then
      JAVA="$candidate"
      break
    fi
  fi
done

if [[ -z "$JAVA" ]]; then
  echo "Error: a JDK from 17 through 24 is required. Install one or set JAVA_HOME." >&2
  exit 1
fi
export JAVA_HOME="$(dirname -- "$(dirname -- "$JAVA")")"
export PATH="$JAVA_HOME/bin:$PATH"

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required to sync the latest web assets before building." >&2
  exit 1
fi

echo "Using device $SERIAL"
echo "Using Java: $("$JAVA" -version 2>&1 | head -n 1)"
echo "Syncing web assets..."
(cd "$ROOT_DIR" && npm run sync)
echo "Building debug APK..."
(cd "$ROOT_DIR/android" && ./gradlew :app:assembleDebug)
echo "Installing on $SERIAL..."
"$ADB" -s "$SERIAL" install -r "$APK"
echo "Installed successfully. The app was not launched."
