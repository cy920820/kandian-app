#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-release/local}"
LOG_DIR="${OUT_DIR}/logs"

usage() {
  cat <<'EOF'
用法:
  bash scripts/build-release-local.sh [desktop] [ios] [android] [all]

说明:
  - 默认构建: desktop + ios + android
  - 输出目录: release/local
  - 统一产物命名:
    - Kandian-macOS.dmg
    - Kandian-iOS-unsigned.ipa
    - Kandian-Android.apk
    - Kandian-Android.aab (如果可用)
EOF
}

run_step() {
  local title="$1"
  shift
  echo ""
  echo "==> ${title}"
  "$@"
}

prepare_out_dir() {
  rm -rf "$OUT_DIR"
  mkdir -p "$OUT_DIR" "$LOG_DIR"
}

build_desktop() {
  run_step "构建 Desktop (Tauri app)" bash -lc "npm run tauri:build -- --bundles app 2>&1 | tee '${LOG_DIR}/build-desktop.log'"

  local app_path
  app_path="$(find src-tauri/target -type d -path "*/bundle/macos/*.app" -exec ls -td {} + 2>/dev/null | head -n1 || true)"
  if [[ -z "${app_path}" ]]; then
    echo "❌ 未找到 macOS .app 产物"
    exit 1
  fi

  run_step "对 macOS .app 执行 ad-hoc 签名" codesign --force --deep --sign - "$app_path"
  run_step "校验 macOS .app 签名" codesign --verify --deep --strict "$app_path"
  run_step "生成 DMG" hdiutil create -volname "Kandian" -srcfolder "$app_path" -ov -format UDZO "${OUT_DIR}/Kandian-macOS.dmg"
}

build_ios() {
  run_step "构建 iOS (Tauri)" bash -lc "bash scripts/build-app.sh ios 2>&1 | tee '${LOG_DIR}/build-ios.log'"

  local app_path
  app_path="$(find src-tauri/gen/apple/build -type d -path "*/app_iOS.xcarchive/Products/Applications/*.app" -exec ls -td {} + 2>/dev/null | head -n1 || true)"
  if [[ -z "${app_path}" ]]; then
    app_path="$(find src-tauri/gen/apple/build -type d -path "*/Build/Products/release-iphoneos/*.app" -exec ls -td {} + 2>/dev/null | head -n1 || true)"
  fi
  if [[ -z "${app_path}" ]]; then
    echo "❌ 未找到 iOS .app 产物"
    exit 1
  fi

  local ipa_work payload_app
  ipa_work="${OUT_DIR}/.ipa-work"
  rm -rf "$ipa_work"
  mkdir -p "$ipa_work/Payload"
  payload_app="${ipa_work}/Payload/$(basename "$app_path")"
  ditto "$app_path" "$payload_app"

  # 自签兼容：将 iOS 包内 app 名和可执行文件统一为 ASCII，避免部分签名工具处理中文路径后闪退
  local exec_name ascii_exec ascii_app
  ascii_exec="Kandian"
  ascii_app="${ipa_work}/Payload/Kandian.app"
  exec_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "${payload_app}/Info.plist" 2>/dev/null || true)"
  if [[ -n "$exec_name" && "$exec_name" != "$ascii_exec" && -f "${payload_app}/${exec_name}" ]]; then
    mv "${payload_app}/${exec_name}" "${payload_app}/${ascii_exec}"
  fi
  /usr/libexec/PlistBuddy -c "Set :CFBundleExecutable ${ascii_exec}" "${payload_app}/Info.plist" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :CFBundleExecutable string ${ascii_exec}" "${payload_app}/Info.plist"
  /usr/libexec/PlistBuddy -c "Set :CFBundleName ${ascii_exec}" "${payload_app}/Info.plist" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :CFBundleName string ${ascii_exec}" "${payload_app}/Info.plist"
  if [[ "$payload_app" != "$ascii_app" ]]; then
    mv "$payload_app" "$ascii_app"
    payload_app="$ascii_app"
  fi

  # 产出真正 unsigned IPA，避免历史签名/描述文件影响后续自签导致闪退
  rm -rf "${payload_app}/_CodeSignature"
  rm -f "${payload_app}/embedded.mobileprovision"
  while IFS= read -r f; do
    codesign --remove-signature "$f" >/dev/null 2>&1 || true
  done < <(find "$payload_app" -type f)

  (cd "$ipa_work" && /usr/bin/zip -qry "${ROOT_DIR}/${OUT_DIR}/Kandian-iOS-unsigned.ipa" Payload)
  rm -rf "$ipa_work"

  if ! LC_ALL=C unzip -l "${OUT_DIR}/Kandian-iOS-unsigned.ipa" | LC_ALL=C grep -E "Payload/.+\\.app/Info\\.plist" >/dev/null; then
    echo "❌ IPA 结构非法，缺少 Payload/*.app/Info.plist"
    exit 1
  fi

  local ipa_size
  ipa_size="$(stat -f%z "${OUT_DIR}/Kandian-iOS-unsigned.ipa")"
  if [[ "$ipa_size" -lt 1048576 ]]; then
    echo "❌ IPA 体积异常（${ipa_size} bytes）"
    exit 1
  fi
}

build_android() {
  run_step "构建 Android (Tauri)" bash -lc "bash scripts/build-app.sh android 2>&1 | tee '${LOG_DIR}/build-android.log'"

  local apk_file aab_file
  apk_file="$(
    find src-tauri/gen/android/app/build/outputs -type f -name "*.apk" -exec ls -td {} + 2>/dev/null \
      | awk '/universal.*release.*unsigned/ {print; found=1; exit} END {if (!found) print ""}'
  )"
  if [[ -z "${apk_file}" ]]; then
    apk_file="$(find src-tauri/gen/android/app/build/outputs -type f -name "*.apk" -exec ls -td {} + 2>/dev/null | head -n1 || true)"
  fi
  if [[ -z "${apk_file}" ]]; then
    echo "❌ 未找到 APK 产物"
    exit 1
  fi
  cp "$apk_file" "${OUT_DIR}/Kandian-Android.apk"

  aab_file="$(
    find src-tauri/gen/android/app/build/outputs -type f -name "*.aab" -exec ls -td {} + 2>/dev/null \
      | awk '/release/ {print; found=1; exit} END {if (!found) print ""}'
  )"
  if [[ -z "${aab_file}" ]]; then
    aab_file="$(find src-tauri/gen/android/app/build/outputs -type f -name "*.aab" -exec ls -td {} + 2>/dev/null | head -n1 || true)"
  fi
  if [[ -n "${aab_file}" ]]; then
    cp "$aab_file" "${OUT_DIR}/Kandian-Android.aab"
  fi
}

write_checksums() {
  (
    cd "$OUT_DIR"
    shasum -a 256 Kandian-* > SHA256SUMS.txt
  )
}

TARGETS=()
if [[ "$#" -eq 0 ]]; then
  TARGETS=(desktop ios android)
else
  for t in "$@"; do
    case "$t" in
      desktop|ios|android) TARGETS+=("$t") ;;
      all) TARGETS=(desktop ios android) ;;
      -h|--help) usage; exit 0 ;;
      *)
        echo "未知目标: $t"
        usage
        exit 1
        ;;
    esac
  done
fi

prepare_out_dir

SEEN=" "
for target in "${TARGETS[@]}"; do
  if [[ "$SEEN" == *" $target "* ]]; then
    continue
  fi
  SEEN+="$target "
  case "$target" in
    desktop) build_desktop ;;
    ios) build_ios ;;
    android) build_android ;;
  esac
done

write_checksums

echo ""
echo "✅ 本地发布包已生成: ${OUT_DIR}"
find "$OUT_DIR" -maxdepth 1 -type f | sed -n '1,120p'
