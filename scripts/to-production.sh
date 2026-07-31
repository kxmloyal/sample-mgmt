#!/bin/bash
# 制造品质管理系统 — 演示模式 → 生产模式 切换脚本
# 用法: bash scripts/to-production.sh
set -e

cd "$(dirname "$0")/.."
INDEX="public/index.html"
BACKUP="public/index.html.bak.demo"

echo "========================================="
echo "  制造品质管理系统：演示模式 → 生产模式"
echo "========================================="

if ! grep -q 'id="demo-hint"' "$INDEX"; then
    echo "[SKIP] 当前已是生产模式"
    exit 0
fi

# 备份
if [ ! -f "$BACKUP" ]; then
    cp "$INDEX" "$BACKUP"
    echo "[OK] 已备份: $BACKUP"
fi

# 移除演示账号提示区块 + 替换 placeholder
python3 -c "
import re
with open('$INDEX','r',encoding='utf-8') as f: c=f.read()
c=re.sub(r'[ \t]*<div class=\"hint\" id=\"demo-hint\">.*?</div>\n?','',c,flags=re.DOTALL)
c=c.replace('placeholder=\"如 rd01 / qa01 / mfg01 / admin\"','placeholder=\"请输入账号\"')
with open('$INDEX','w',encoding='utf-8') as f: f.write(c)
"

if grep -q 'id="demo-hint"' "$INDEX"; then
    echo "[FAIL] 移除失败，请手动处理 $INDEX"
    exit 1
fi

echo "[OK] 演示账号提示已移除，placeholder 已更新"
echo ""
echo "  切换完成！恢复演示: bash scripts/to-demo.sh"
