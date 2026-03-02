#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:-prod}"

usage() {
  cat <<'EOF'
用法:
  bash scripts/deploy-vercel.sh [prod|preview]

说明:
  - prod: 部署到 Vercel 生产环境（默认）
  - preview: 部署到 Vercel 预览环境

可选环境变量:
  VERCEL_TOKEN        用于无交互部署
  VERCEL_ORG_ID       可选，配合 VERCEL_PROJECT_ID 自动写入 .vercel/project.json
  VERCEL_PROJECT_ID   可选，配合 VERCEL_ORG_ID 自动写入 .vercel/project.json
EOF
}

run_step() {
  local title="$1"
  shift
  echo ""
  echo "==> ${title}"
  "$@"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "❌ 缺少命令: $cmd"
    exit 1
  fi
}

run_vercel() {
  local args=("$@")
  if [[ -n "${VERCEL_TOKEN:-}" ]]; then
    npx vercel "${args[@]}" --token "${VERCEL_TOKEN}"
  else
    npx vercel "${args[@]}"
  fi
}

ensure_linked_project() {
  if [[ -f ".vercel/project.json" ]]; then
    return 0
  fi

  if [[ -n "${VERCEL_ORG_ID:-}" && -n "${VERCEL_PROJECT_ID:-}" ]]; then
    mkdir -p .vercel
    cat > .vercel/project.json <<EOF
{"orgId":"${VERCEL_ORG_ID}","projectId":"${VERCEL_PROJECT_ID}"}
EOF
    echo "ℹ️  已根据环境变量写入 .vercel/project.json"
    return 0
  fi

  if [[ ! -t 0 ]]; then
    echo "❌ 当前为非交互终端，且未提供 VERCEL_ORG_ID/VERCEL_PROJECT_ID。"
    echo "请设置这两个环境变量，或先在本机执行一次 vercel link。"
    exit 1
  fi

  run_step "首次部署需要绑定 Vercel 项目，执行 vercel link" run_vercel link
}

ensure_vercel_auth() {
  if [[ -n "${VERCEL_TOKEN:-}" ]]; then
    echo "ℹ️  检测到 VERCEL_TOKEN，将使用 Token 进行部署。"
    return 0
  fi

  if run_vercel whoami >/dev/null 2>&1; then
    return 0
  fi

  if [[ ! -t 0 ]]; then
    echo "❌ 未检测到 Vercel 登录状态，且当前为非交互终端。"
    echo "请先设置 VERCEL_TOKEN，或先在本机执行 vercel login。"
    exit 1
  fi

  run_step "未检测到 Vercel 登录，执行 vercel login" run_vercel login
}

deploy_prod() {
  run_step "部署到 Vercel 生产环境" run_vercel deploy --prod --yes --archive=tgz
}

deploy_preview() {
  run_step "部署到 Vercel 预览环境" run_vercel deploy --yes --archive=tgz
}

if [[ "${MODE}" == "-h" || "${MODE}" == "--help" ]]; then
  usage
  exit 0
fi

case "$MODE" in
  prod|preview) ;;
  *)
    echo "未知模式: ${MODE}"
    usage
    exit 1
    ;;
esac

require_cmd npx
run_step "检查 Vercel 登录状态" ensure_vercel_auth
run_step "检查 Vercel 项目关联" ensure_linked_project

if [[ "$MODE" == "prod" ]]; then
  deploy_prod
else
  deploy_preview
fi

echo ""
echo "✅ Vercel 部署完成 (${MODE})"
