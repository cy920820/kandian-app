#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'EOF'
用法:
  bash scripts/build-app.sh [web|desktop|ios|ios-sim|android|teamid|all]
  bash scripts/build-app.sh <target1> <target2> ...

说明:
  - 不传参数时会进入交互菜单
  - iOS/Android 若未初始化会先自动执行 init

示例:
  bash scripts/build-app.sh web
  bash scripts/build-app.sh desktop
  bash scripts/build-app.sh ios
  bash scripts/build-app.sh ios-sim
  bash scripts/build-app.sh android
  bash scripts/build-app.sh teamid
  bash scripts/build-app.sh all
  bash scripts/build-app.sh web ios
EOF
}

run_step() {
  local title="$1"
  shift
  echo ""
  echo "==> ${title}"
  "$@"
}

is_team_id() {
  local v="${1:-}"
  [[ "$v" =~ ^[A-Z0-9]{10}$ ]]
}

normalize_team_id() {
  echo "${1:-}" | tr -d '[:space:]' | tr '[:lower:]' '[:upper:]'
}

ensure_ios_init() {
  if [[ ! -d "src-tauri/gen/apple" ]]; then
    run_step "检测到 iOS 尚未初始化，执行 tauri:ios:init" npm run tauri:ios:init
  fi
}

ensure_ios_script_sandbox_disabled() {
  local pbxproj="src-tauri/gen/apple/app.xcodeproj/project.pbxproj"
  if [[ ! -f "$pbxproj" ]]; then
    return 0
  fi

  if rg -q 'ENABLE_USER_SCRIPT_SANDBOXING = YES;' "$pbxproj"; then
    perl -0pi -e 's/ENABLE_USER_SCRIPT_SANDBOXING = YES;/ENABLE_USER_SCRIPT_SANDBOXING = NO;/g' "$pbxproj"
    echo "ℹ️  已自动关闭 Xcode User Script Sandboxing（避免 cargo 读取工程文件被拒绝）。"
  fi
}

get_team_from_env() {
  normalize_team_id "${APPLE_DEVELOPMENT_TEAM:-}"
}

get_team_from_tauri_conf() {
  node -e '
    const fs = require("fs");
    try {
      const conf = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
      process.stdout.write((conf?.bundle?.iOS?.developmentTeam || "").trim());
    } catch {
      process.stdout.write("");
    }
  ' | tr -d '[:space:]' | tr '[:lower:]' '[:upper:]'
}

get_team_from_xcode_project() {
  local pbxproj="src-tauri/gen/apple/app.xcodeproj/project.pbxproj"
  if [[ ! -f "$pbxproj" ]]; then
    echo ""
    return 0
  fi
  rg -n 'DEVELOPMENT_TEAM = [A-Z0-9]{10};' "$pbxproj" 2>/dev/null \
    | head -n1 \
    | sed -E 's/.*DEVELOPMENT_TEAM = ([A-Z0-9]{10});.*/\1/'
}

resolve_ios_team() {
  local team
  team="$(get_team_from_env)"
  if is_team_id "$team"; then
    echo "$team"
    return 0
  fi

  local conf_team
  conf_team="$(get_team_from_tauri_conf)"
  if is_team_id "$conf_team" && [[ "$conf_team" != "SIMULATR00" ]]; then
    echo "$conf_team"
    return 0
  fi

  local xcode_team=""
  xcode_team="$(get_team_from_xcode_project)"
  if is_team_id "$xcode_team"; then
    echo "$xcode_team"
    return 0
  fi

  if [[ -n "$conf_team" ]]; then
    echo "$conf_team"
    return 0
  fi

  echo ""
}

sync_tauri_ios_team() {
  local team="${1:-}"
  if ! is_team_id "$team"; then
    return 0
  fi
  if [[ "$team" == "SIMULATR00" ]]; then
    return 0
  fi
  local sync_result
  sync_result="$(node -e '
    const fs = require("fs");
    const file = "src-tauri/tauri.conf.json";
    const team = process.argv[1];
    const conf = JSON.parse(fs.readFileSync(file, "utf8"));
    conf.bundle = conf.bundle || {};
    conf.bundle.iOS = conf.bundle.iOS || {};
    if (conf.bundle.iOS.developmentTeam === team) {
      process.stdout.write("noop");
      process.exit(0);
    }
    conf.bundle.iOS.developmentTeam = team;
    fs.writeFileSync(file, JSON.stringify(conf, null, 2) + "\n");
    process.stdout.write("updated");
  ' "$team")"

  if [[ "$sync_result" == "updated" ]]; then
    echo "ℹ️  已自动写入 Team ID 到 tauri.conf.json: $team"
  elif [[ "$sync_result" == "noop" ]]; then
    echo "ℹ️  tauri.conf.json 已存在相同 Team ID: $team"
  fi
}

prompt_ios_team_input() {
  if [[ ! -t 0 ]]; then
    echo ""
    return 0
  fi

  local manual_team
  while true; do
    echo ""
    echo "⚠️  未自动探测到有效 Team ID。"
    read -r -p "请输入 10 位 Team ID（直接回车取消）: " manual_team
    manual_team="$(normalize_team_id "$manual_team")"

    if [[ -z "$manual_team" ]]; then
      echo ""
      return 0
    fi

    if is_team_id "$manual_team" && [[ "$manual_team" != "SIMULATR00" ]]; then
      echo "$manual_team"
      return 0
    fi

    echo "❌ Team ID 格式无效，请输入类似 WK9S8YQCV7 的 10 位大写字母数字。"
  done
}

show_ios_team_status() {
  ensure_ios_init

  local env_team conf_team xcode_team resolved
  env_team="$(get_team_from_env)"
  conf_team="$(get_team_from_tauri_conf)"
  xcode_team="$(get_team_from_xcode_project)"
  resolved="$(resolve_ios_team)"

  echo ""
  echo "==> iOS Team ID 探测结果"
  echo "  APPLE_DEVELOPMENT_TEAM: ${env_team:-<空>}"
  echo "  tauri.conf.json:        ${conf_team:-<空>}"
  echo "  Xcode project:          ${xcode_team:-<空>}"
  echo "  最终使用:               ${resolved:-<未找到>}"

  if is_team_id "$resolved" && [[ "$resolved" != "SIMULATR00" ]]; then
    sync_tauri_ios_team "$resolved"
  else
    echo ""
    echo "❌ 尚未发现可用于真机构建的 Team ID。"
    echo "可在 Xcode 打开 iOS 工程后选择 Signing Team，或直接运行:"
    echo "  export APPLE_DEVELOPMENT_TEAM=你的TeamID"
  fi
}

ensure_ios_signing() {
  local team
  team="$(resolve_ios_team)"

  if ! is_team_id "$team" || [[ "$team" == "SIMULATR00" ]]; then
    team="$(prompt_ios_team_input)"
  fi

  # SIMULATR00 是用于 ios-sim 的占位 Team，真机构建必须提供真实 Team
  if ! is_team_id "$team" || [[ "$team" == "SIMULATR00" ]]; then
    echo ""
    echo "❌ iOS 构建前检查失败：未配置开发者 Team ID。"
    echo "请先执行以下任一方案后再重试："
    echo "  1) 临时环境变量："
    echo "     export APPLE_DEVELOPMENT_TEAM=你的TeamID"
    echo "  2) 写入配置：src-tauri/tauri.conf.json -> bundle.iOS.developmentTeam"
    echo "  3) 查看自动探测结果：bash scripts/build-app.sh teamid"
    echo ""
    echo "提示：可先运行 tauri info 查看本机可用签名信息。"
    exit 1
  fi

  IOS_TEAM="$team"
  sync_tauri_ios_team "$team"
}

ensure_android_init() {
  if [[ ! -d "src-tauri/gen/android" ]]; then
    run_step "检测到 Android 尚未初始化，执行 tauri:android:init" npm run tauri:android:init
  fi
}

build_web() {
  run_step "构建 Web" npm run build:web
}

build_desktop() {
  run_step "构建 Desktop (Tauri)" npm run tauri:build
}

build_ios() {
  ensure_ios_init
  ensure_ios_script_sandbox_disabled
  ensure_ios_signing
  run_step "构建 iOS (Tauri) [Team: ${IOS_TEAM}]" env APPLE_DEVELOPMENT_TEAM="$IOS_TEAM" npm run tauri:ios:build
}

build_ios_sim() {
  ensure_ios_init
  ensure_ios_script_sandbox_disabled
  local team
  team="$(resolve_ios_team)"
  # tauri CLI 会要求 development team 非空；模拟器构建用占位值即可通过前置校验
  if ! is_team_id "$team"; then team="SIMULATR00"; fi
  sync_tauri_ios_team "$team"
  run_step "构建 iOS Simulator (Tauri, no-sign)" env APPLE_DEVELOPMENT_TEAM="$team" npm run tauri:ios:build -- --target aarch64-sim
}

build_android() {
  ensure_android_init
  run_step "构建 Android (Tauri)" npm run tauri:android:build
}

build_all() {
  build_web
  build_desktop
  build_ios
  build_android
}

run_target() {
  local target="$1"
  case "$target" in
    web) build_web ;;
    desktop) build_desktop ;;
    ios) build_ios ;;
    ios-sim) build_ios_sim ;;
    android) build_android ;;
    teamid) show_ios_team_status ;;
    all) build_all ;;
    *)
      echo "未知目标: $target"
      usage
      exit 1
      ;;
  esac
}

run_targets() {
  local targets=("$@")
  local target
  local seen=" "
  BUILT_TARGETS=()
  for target in "${targets[@]}"; do
    if [[ "$target" == "all" ]]; then
      build_all
      BUILT_TARGETS=("web" "desktop" "ios" "android")
      continue
    fi
    if [[ "$seen" == *" $target "* ]]; then
      continue
    fi
    seen+="$target "
    run_target "$target"
    BUILT_TARGETS+=("$target")
  done
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "$#" -gt 0 ]]; then
  run_targets "$@"
  echo ""
  echo "✅ 构建完成: ${BUILT_TARGETS[*]}"
  exit 0
fi

if [[ ! -t 0 ]]; then
  echo "未检测到交互终端，请传入构建目标参数。"
  usage
  exit 1
fi

targets=("web" "desktop" "ios" "ios-sim" "android")
labels=("Web" "Desktop (Tauri)" "iOS (Tauri)" "iOS Simulator (no-sign)" "Android (Tauri)")
selected=(0 0 0 0 0)
cursor=0

draw_menu() {
  local i marker pointer
  printf "\033[2J\033[H"
  echo "请选择要构建的平台（支持多选）:"
  echo "  ↑/↓: 移动    Space: 勾选    Enter: 开始构建"
  echo "  a: 全选       i: 反选       q: 退出"
  echo ""
  for i in "${!targets[@]}"; do
    if [[ "${selected[$i]}" -eq 1 ]]; then marker="[x]"; else marker="[ ]"; fi
    if [[ "$i" -eq "$cursor" ]]; then pointer=">"; else pointer=" "; fi
    printf " %s %s %s\n" "$pointer" "$marker" "${labels[$i]}"
  done
}

toggle_current() {
  if [[ "${selected[$cursor]}" -eq 1 ]]; then
    selected[$cursor]=0
  else
    selected[$cursor]=1
  fi
}

select_all() {
  local i
  for i in "${!selected[@]}"; do selected[$i]=1; done
}

invert_select() {
  local i
  for i in "${!selected[@]}"; do
    if [[ "${selected[$i]}" -eq 1 ]]; then selected[$i]=0; else selected[$i]=1; fi
  done
}

collect_selected() {
  local i
  local out=()
  for i in "${!targets[@]}"; do
    if [[ "${selected[$i]}" -eq 1 ]]; then out+=("${targets[$i]}"); fi
  done
  printf "%s\n" "${out[@]}"
}

while true; do
  draw_menu
  IFS= read -rsn1 key
  case "$key" in
    " ")
      toggle_current
      ;;
    "a"|"A")
      select_all
      ;;
    "i"|"I")
      invert_select
      ;;
    "q"|"Q")
      echo ""
      echo "已退出"
      exit 0
      ;;
    "")
      picked=()
      for i in "${!targets[@]}"; do
        if [[ "${selected[$i]}" -eq 1 ]]; then
          picked+=("${targets[$i]}")
        fi
      done
      if [[ "${#picked[@]}" -eq 0 ]]; then
        echo ""
        echo "至少选择一个平台。"
        sleep 1
        continue
      fi
      echo ""
      run_targets "${picked[@]}"
      echo ""
      echo "✅ 构建完成: ${picked[*]}"
      exit 0
      ;;
    $'\x1b')
      key2=""
      IFS= read -rsn2 -t 1 key2 || true
      case "$key2" in
        "[A")
          ((cursor--))
          if (( cursor < 0 )); then cursor=$((${#targets[@]} - 1)); fi
          ;;
        "[B")
          ((cursor++))
          if (( cursor >= ${#targets[@]} )); then cursor=0; fi
          ;;
      esac
      ;;
    "k"|"K")
      ((cursor--))
      if (( cursor < 0 )); then cursor=$((${#targets[@]} - 1)); fi
      ;;
    "j"|"J")
      ((cursor++))
      if (( cursor >= ${#targets[@]} )); then cursor=0; fi
      ;;
  esac
done
