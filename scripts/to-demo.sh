#!/bin/bash
# 制造品质管理系统 — 生产模式 → 演示模式 恢复脚本
# 用法: bash scripts/to-demo.sh
set -e

cd "$(dirname "$0")/.."
INDEX="public/index.html"
BACKUP="public/index.html.bak.demo"

echo "========================================="
echo "  制造品质管理系统：生产模式 → 演示模式"
echo "========================================="

if grep -q 'id="demo-hint"' "$INDEX"; then
    echo "[SKIP] 当前已是演示模式"
    exit 0
fi

if [ ! -f "$BACKUP" ]; then
    echo "[FAIL] 未找到备份文件 $BACKUP"
    echo "  请先执行 bash scripts/to-production.sh 创建备份"
    exit 1
fi

cp "$BACKUP" "$INDEX"
echo "[OK] 已从备份恢复: $BACKUP → $INDEX"
echo ""
echo "  恢复完成！当前为演示模式"
echo "  切换生产: bash scripts/to-production.sh"
