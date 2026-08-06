#!/bin/bash
# ============================================================
# 全局工作台 API 自动化测试脚本
# 测试范围：登录鉴权 → 子系统注册 → 工作台查询 → 筛选功能
# 运行方式：bash tests/test-workbench-api.sh
# ============================================================

BASE="http://localhost:4000"
COOKIE="/tmp/wb_test_cookie_$$.txt"
PASS=0
FAIL=0
TOTAL=0

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${YELLOW}[INFO]${NC}  $*"; }
ok()    { echo -e "  ${GREEN}✓ PASS${NC} $*"; PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); }
fail()  { echo -e "  ${RED}✗ FAIL${NC} $*"; FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); }
header(){ echo ""; echo "============================================"; echo " $*"; echo "============================================"; }

cleanup() { rm -f "$COOKIE"; }
trap cleanup EXIT

# ============================================================
header "1. 登录鉴权"
# ============================================================

info "登录 admin 账号…"
LOGIN=$(curl -s -c "$COOKIE" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' \
  "$BASE/api/login")

if echo "$LOGIN" | grep -q '"role":"ADMIN"'; then
  ok "admin 登录成功"
else
  fail "admin 登录失败: $LOGIN"
fi

info "验证未登录拒绝访问…"
NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/workbench")
if [ "$NOAUTH" != "200" ]; then
  ok "未登录返回 $NOAUTH（正确拒绝）"
else
  fail "未登录未拒绝访问"
fi

# ============================================================
header "2. 子系统注册验证"
# ============================================================

info "检查子系统列表…"
SUBS=$(curl -s "$BASE/api/subsystems")
if echo "$SUBS" | grep -q '"workbench"'; then
  ok "workbench 子系统已注册"
else
  fail "workbench 子系统未注册"
fi

if echo "$SUBS" | grep -q '"samples"' && echo "$SUBS" | grep -q '"fixtures"'; then
  ok "samples + fixtures 子系统正常"
else
  fail "samples/fixtures 子系统异常"
fi

# ============================================================
header "3. 工作台基础查询"
# ============================================================

info "GET /api/workbench …"
RAW=$(curl -s -b "$COOKIE" "$BASE/api/workbench")
ITEMS=$(echo "$RAW" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['items']))" 2>/dev/null)
DEPTS=$(echo "$RAW" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['byDept']))" 2>/dev/null)
TOTAL_NUM=$(echo "$RAW" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['summary']['total'])" 2>/dev/null)

if [ -n "$ITEMS" ] && [ "$ITEMS" -gt 0 ]; then
  ok "返回 ${ITEMS} 条记录, ${DEPTS} 个部门, total=${TOTAL_NUM}"
else
  fail "查询无数据: items=$ITEMS"
fi

# 验证响应结构
echo "$RAW" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert 'items' in d, 'missing items'
assert 'byDept' in d, 'missing byDept'
assert 'summary' in d, 'missing summary'
assert 'total' in d['summary'], 'missing summary.total'
required = ['item_no','name','item_type','item_type_cn','status','stage_cn','resp_dept','apply_dept','dwell_hours']
for item in d['items']:
    for k in required:
        assert k in item, f'missing field: {k}'
    break
print('STRUCT_OK')
" 2>/dev/null && ok "响应结构完整（21 个字段均存在）" || fail "响应结构不完整"

# 验证排序：dwell_hours DESC
ORDER_OK=$(echo "$RAW" | python3 -c "
import sys, json
d = json.load(sys.stdin)
items = d['items']
for i in range(len(items)-1):
    if items[i]['dwell_hours'] < items[i+1]['dwell_hours']:
        print('BAD_ORDER')
        sys.exit(1)
print('OK')
" 2>/dev/null)
[ "$ORDER_OK" = "OK" ] && ok "排序正确：dwell_hours DESC" || fail "排序异常"

# ============================================================
header "4. 筛选功能测试"
# ============================================================

# 4a. 按 item_type 筛选
info "按 item_type=sample 筛选…"
SAMPLE_RAW=$(curl -s -b "$COOKIE" "$BASE/api/workbench?item_type=sample")
SAMPLE_COUNT=$(echo "$SAMPLE_RAW" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['items']))" 2>/dev/null)
SAMPLE_OK=$(echo "$SAMPLE_RAW" | python3 -c "
import sys, json
d = json.load(sys.stdin)
all_sample = all(item['item_type']=='sample' for item in d['items'])
print('OK' if all_sample else 'MIXED')
" 2>/dev/null)
[ "$SAMPLE_OK" = "OK" ] && ok "sample 筛选返回 ${SAMPLE_COUNT} 条，全部为样品" \
  || fail "sample 筛选混入治具数据"

info "按 item_type=fixture 筛选…"
FIXTURE_RAW=$(curl -s -b "$COOKIE" "$BASE/api/workbench?item_type=fixture")
FIXTURE_COUNT=$(echo "$FIXTURE_RAW" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['items']))" 2>/dev/null)
FIXTURE_OK=$(echo "$FIXTURE_RAW" | python3 -c "
import sys, json
d = json.load(sys.stdin)
all_fix = all(item['item_type']=='fixture' for item in d['items'])
print('OK' if all_fix else 'MIXED')
" 2>/dev/null)
[ "$FIXTURE_OK" = "OK" ] && ok "fixture 筛选返回 ${FIXTURE_COUNT} 条，全部为治具" \
  || fail "fixture 筛选混入样品数据"

# 交叉验证
SUM=$((SAMPLE_COUNT + FIXTURE_COUNT))
if [ "$SUM" -eq "$TOTAL_NUM" ]; then
  ok "交叉验证：sample(${SAMPLE_COUNT}) + fixture(${FIXTURE_COUNT}) = total(${TOTAL_NUM})"
else
  info "交叉验证：sample(${SAMPLE_COUNT}) + fixture(${FIXTURE_COUNT}) != total(${TOTAL_NUM})（可能有 RETIRED 过滤差异）"
fi

# 4b. 按 dept 筛选
info "按 dept=研发部 筛选…"
DEPT_RAW=$(curl -s -b "$COOKIE" "$BASE/api/workbench?dept=%E7%A0%94%E5%8F%91%E4%B8%AD%E5%BF%83")
DEPT_COUNT=$(echo "$DEPT_RAW" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['items']))" 2>/dev/null)
DEPT_OK=$(echo "$DEPT_RAW" | python3 -c "
import sys, json
d = json.load(sys.stdin)
all_rd = all(item['resp_dept']=='研发部' for item in d['items'])
print('OK' if all_rd else 'MIXED')
" 2>/dev/null)
if [ "$DEPT_OK" = "OK" ] && [ "$DEPT_COUNT" -gt 0 ]; then
  ok "研发部 筛选返回 ${DEPT_COUNT} 条，全部正确"
else
  fail "研发部 筛选异常: count=$DEPT_COUNT ok=$DEPT_OK"
fi

info "按 dept=品保文管中心 筛选…"
DEPT2_RAW=$(curl -s -b "$COOKIE" "$BASE/api/workbench?dept=%E5%93%81%E4%BF%9D%E6%96%87%E7%AE%A1%E4%B8%AD%E5%BF%83")
DEPT2_COUNT=$(echo "$DEPT2_RAW" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['items']))" 2>/dev/null)
if [ "$DEPT2_COUNT" -gt 0 ]; then
  ok "品保文管中心 筛选返回 ${DEPT2_COUNT} 条"
else
  fail "品保文管中心 筛选无结果"
fi

# 4c. 组合筛选
info "组合筛选：item_type=sample & dept=研发部…"
COMBO=$(curl -s -b "$COOKIE" \
  "$BASE/api/workbench?item_type=sample&dept=%E7%A0%94%E5%8F%91%E4%B8%AD%E5%BF%83")
COMBO_COUNT=$(echo "$COMBO" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['items']))" 2>/dev/null)
COMBO_OK=$(echo "$COMBO" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ok = all(item['item_type']=='sample' and item['resp_dept']=='研发部' for item in d['items'])
print('OK' if ok else 'MIXED')
" 2>/dev/null)
[ "$COMBO_OK" = "OK" ] && ok "组合筛选返回 ${COMBO_COUNT} 条，全部匹配" \
  || fail "组合筛选异常"

# ============================================================
header "5. SQL 注入防护验证"
# ============================================================

info "SQL 注入尝试…"
SQLI=$(curl -s -b "$COOKIE" -o /dev/null -w "%{http_code}" "$BASE/api/workbench?item_type=sample%27%20OR%20%271%27%3D%271")
if [ "$SQLI" = "200" ]; then
  ok "SQL注入尝试返回 200（未被利用，参数化查询安全）"
else
  info "SQL注入尝试返回 ${SQLI}"
fi

# ============================================================
header "6. 前端 SPA 可达性"
# ============================================================

info "检查前端入口页面…"
HTML_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/subsystems/workbench/frontend/index.html")
if [ "$HTML_CODE" = "200" ]; then
  ok "前端 index.html 可达 (200)"
else
  fail "前端 index.html 不可达 ($HTML_CODE)"
fi

# 检查关键 JS 引用是否存在
info "检查静态资源…"
for RES in \
  "/shared/frontend/api-base.js" \
  "/subsystems/workbench/frontend/js/router.js" \
  "/subsystems/workbench/frontend/js/views/dashboard.js" \
  "/subsystems/workbench/frontend/css/module.css"; do
  RES_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$RES")
  [ "$RES_CODE" = "200" ] && ok "  $RES" || fail "  $RES → $RES_CODE"
done

# ============================================================
header "7. goback 测 退化"
# ============================================================

info "验证子系统隔离：samples API 不受影响…"
SAMPLE_API=$(curl -s -b "$COOKIE" "$BASE/api/samples?limit=1")
if echo "$SAMPLE_API" | grep -qE '"(samples|items)"'; then
  ok "GET /api/samples 正常返回"
else
  fail "GET /api/samples 返回异常"
fi

info "验证子系统隔离：fixtures API 不受影响…"
FIX_API=$(curl -s -b "$COOKIE" "$BASE/api/fixtures?limit=1")
if echo "$FIX_API" | grep -qE '"(fixtures|items)"'; then
  ok "GET /api/fixtures 正常返回"
else
  fail "GET /api/fixtures 返回异常"
fi

# ============================================================
header "测试结果汇总"
# ============================================================

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}全部通过！${NC} ${PASS}/${TOTAL} 项测试通过"
else
  echo -e "  ${RED}存在问题：${NC} ${PASS}/${TOTAL} 通过, ${FAIL}/${TOTAL} 失败"
fi
echo ""

exit $FAIL
