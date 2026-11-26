// 企微官方接口取数：鉴权、分批、取回原始结果。位置、WiFi、设备等字段一律不取。
// 这个文件浏览器和 Node 共用（演示站在浏览器里用假接口跑同一套取数），所以不引用任何 Node 专有模块。

export const DAY = 86400, TZ = 28800;
export const dayStart = d => Date.parse(d + 'T00:00:00+08:00') / 1000;
export const dayOf = sec => new Date((sec + TZ) * 1000).toISOString().slice(0, 10);
export const addDays = (d, n) => dayOf(dayStart(d) + n * DAY);
export const arr = v => Array.isArray(v) ? v : [];
export const chunk = (list, n) => { const out = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; };
export const r1 = v => Math.round(v * 10) / 10;
export const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
export const HINT = {
  40001: '企业 ID 或应用 Secret 不对', 40013: '企业 ID 无效', 41004: '缺少应用 Secret', 42001: '凭证已过期',
  48002: '这个应用没有该接口的权限', 60011: '应用缺少读取权限', 60020: '本机出口 IP 不在应用的企业可信 IP 里',
  60111: '成员账号不存在或不可见', 301021: '成员不在应用可见范围', 301055: '应用授权不足', 301062: '应用缺少读取权限'
};
export const ROSTER_FIELDS = ['工号', '员工类型', '员工状态', '入职日期', '试用期', '转正日期', '职位', '职级'];

const API = 'https://qyapi.weixin.qq.com/cgi-bin/';
export async function official(path, query, body) {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error', signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw Error('HTTP ' + res.status);
  return res.json();
}

// 调用计数与报错只记接口名和错误码，不记返回内容
export function client(raw) {
  let token = '';
  const stat = { calls: 0, errors: {}, ip: '' };
  async function call(path, query = {}, body) {
    stat.calls++;
    try {
      const res = await raw(path, token ? { access_token: token, ...query } : query, body);
      if (res && !res.errcode) return res;
      const code = res?.errcode ?? '格式异常';
      bump(stat.errors[path] ??= {}, code);
      if (code === 60020) stat.ip ||= (/from ip:\s*([0-9a-f.:]+)/i.exec(res.errmsg || '') || [])[1] || '';
    } catch (e) { bump(stat.errors[path] ??= {}, e.name === 'TimeoutError' ? '超时' : '网络'); }
    return null;
  }
  return { call, stat, setToken: t => { token = t; } };
}

export async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

export async function login(c, cfg) {
  const auth = await c.call('gettoken', { corpid: cfg.corpid, corpsecret: cfg.secret });
  if (!auth?.access_token) return false;
  c.setToken(auth.access_token);
  return true;
}

// 通讯录：部门树 + 每个成员的姓名、岗位、主部门、直属上级
export async function fetchDirectory(c) {
  const depts = arr((await c.call('department/list'))?.department);
  const people = new Map();
  for (const batch of chunk(depts.map(d => d.id), 4)) {
    const lists = await Promise.all(batch.map(id => c.call('user/list', { department_id: id })));
    for (const res of lists) for (const p of arr(res?.userlist)) {
      if (!p?.userid) continue;
      const m = people.get(p.userid) || { id: p.userid, seen: 0, name: '', position: '', main: null, depts: new Set(), leaders: new Set(), leads: new Set(), isLeader: false, status: undefined };
      m.seen++;
      m.name ||= p.name || '';
      m.position ||= p.position || '';
      if (m.main == null && Number.isInteger(p.main_department)) m.main = p.main_department;
      for (const id of arr(p.department)) m.depts.add(id);
      for (const id of arr(p.direct_leader)) m.leaders.add(id);
      arr(p.is_leader_in_dept).forEach((v, k) => { if (v === 1 && arr(p.department)[k] != null) m.leads.add(p.department[k]); });
      if (arr(p.is_leader_in_dept).includes(1)) m.isLeader = true;
      m.status ??= p.status;
      people.set(p.userid, m);
    }
  }
  return { depts, people };
}

function fieldValue(f, row) {
  if (f.value_type !== row.value_type) return null;
  if (f.field_type === 1 && row.value_type === 1) return typeof row.value_string === 'string' ? row.value_string : null;
  if (f.field_type === 2 && row.value_type === 3) {
    const hit = arr(f.option_list).filter(o => String(o.id) === String(row.value_uint32));
    return hit.length === 1 && typeof hit[0].value === 'string' ? hit[0].value : null;
  }
  if (f.field_type === 3 && [2, 4].includes(row.value_type)) {
    const sec = Number(row[row.value_type === 2 ? 'value_uint64' : 'value_int64']);
    return Number.isSafeInteger(sec) ? (sec ? dayOf(sec) : '') : null;
  }
  return null;
}

// 人事助手花名册。每人每个字段返回 {v} 有值或空串、{miss} 企微未找到、{bad} 读不出
export async function fetchRoster(c, ids, want = ROSTER_FIELDS) {
  const all = arr((await c.call('hr/get_fields'))?.group_list).flatMap(g => arr(g.field_list));
  const schema = want.map(name => all.filter(f => f.field_name === name)).filter(l => l.length === 1).map(l => l[0]);
  const rows = new Map();
  let failed = 0;
  if (schema.length) await pool(ids, 3, async id => {
    const res = await c.call('hr/get_staff_info', {}, { userid: id, get_all: false, fieldids: schema.map(f => ({ fieldid: f.fieldid, sub_idx: 0 })) });
    if (!Array.isArray(res?.field_info)) { failed++; return; }
    const out = {};
    for (const f of schema) {
      const hit = res.field_info.filter(r => r.fieldid === f.fieldid && (r.sub_idx ?? 0) === 0), row = hit.length === 1 ? hit[0] : null;
      if (row?.result === 3) { out[f.field_name] = { miss: 1 }; continue; }
      const v = row?.result === 1 ? fieldValue(f, row) : null;
      out[f.field_name] = v === null ? { bad: 1 } : { v };
    }
    rows.set(id, out);
  });
  return { all, schema, rows, failed };
}

// 打卡日报：from、to 为日期，跨度不超过一个月。返回 day -> userid -> 原始日报；同人同日重复的记入 dup
export async function fetchDaily(c, ids, from, to) {
  const days = new Map(), seen = new Set(), dup = new Set();
  for (const batch of chunk(ids, 100)) {
    const scope = new Set(batch);
    const res = await c.call('checkin/getcheckin_daydata', {}, { starttime: dayStart(from), endtime: dayStart(to), useridlist: batch });
    for (const e of arr(res?.datas)) {
      const b = e?.base_info || {};
      if (!scope.has(b.acctid) || !Number.isInteger(b.date)) continue;
      const day = dayOf(b.date), key = day + '|' + b.acctid;
      if (seen.has(key)) { dup.add(key); continue; }
      seen.add(key);
      if (!days.has(day)) days.set(day, new Map());
      days.get(day).set(b.acctid, e);
    }
  }
  return { days, dup };
}

// 打卡月报：userid -> 原始月报
export async function fetchMonthly(c, ids, from, to) {
  const out = new Map();
  for (const batch of chunk(ids, 100)) {
    const scope = new Set(batch);
    const res = await c.call('checkin/getcheckin_monthdata', {}, { starttime: dayStart(from), endtime: dayStart(to), useridlist: batch });
    for (const e of arr(res?.datas)) { const id = e?.base_info?.acctid; if (scope.has(id) && !out.has(id)) out.set(id, e); }
  }
  return out;
}

// 原始打卡：只保留时间、类型、异常、标准时间。userid -> [{t, type, ex[], sch}]
export async function fetchPunches(c, ids, fromSec, toSec) {
  const out = new Map();
  for (const batch of chunk(ids, 100)) {
    const scope = new Set(batch);
    const res = await c.call('checkin/getcheckindata', {}, { opencheckindatatype: 3, starttime: fromSec, endtime: toSec, useridlist: batch });
    for (const x of arr(res?.checkindata)) {
      if (!scope.has(x?.userid) || !Number.isFinite(x.checkin_time)) continue;
      const ex = String(x.exception_type || '').split(/[;；]/).map(v => v.trim()).filter(v => v && v !== '正常' && v !== '无');
      if (!out.has(x.userid)) out.set(x.userid, []);
      out.get(x.userid).push({ t: x.checkin_time, type: String(x.checkin_type || ''), ex, sch: Number.isFinite(x.sch_checkin_time) && x.sch_checkin_time > 0 ? x.sch_checkin_time : null });
    }
  }
  return out;
}

// 某一天的排班和个人打卡规则。sched：userid -> 排班记录数组；rules：userid -> 规则
export async function fetchPlans(c, ids, day) {
  const sched = new Map(), rules = new Map();
  for (const batch of chunk(ids, 100)) {
    const scope = new Set(batch);
    const [a, b] = await Promise.all([
      c.call('checkin/getcheckinschedulist', {}, { starttime: dayStart(day), endtime: dayStart(day) + DAY - 1, useridlist: batch }),
      c.call('checkin/getcheckinoption', {}, { datetime: dayStart(day), useridlist: batch })]);
    for (const x of arr(a?.schedule_list)) if (scope.has(x?.userid)) { if (!sched.has(x.userid)) sched.set(x.userid, []); sched.get(x.userid).push(x); }
    for (const x of arr(b?.info)) if (scope.has(x?.userid) && !rules.has(x.userid)) rules.set(x.userid, x.group || {});
  }
  return { sched, rules };
}

// 企业全部打卡规则（含加班核算方式）
export async function fetchCorpRules(c) {
  return arr((await c.call('checkin/getcorpcheckinoption', {}, {}))?.group);
}

// 审批单号：按提交时间取，跨度不超过 31 天。filters 形如 { record_type: 1, sp_status: 2 }
export async function fetchApprovalNos(c, fromSec, toSec, filters = {}) {
  const nos = [], f = Object.entries(filters).map(([key, value]) => ({ key, value: String(value) }));
  let cursor = '';
  for (let page = 0; page < 100; page++) {
    const res = await c.call('oa/getapprovalinfo', {}, { starttime: String(fromSec), endtime: String(toSec), new_cursor: cursor, size: 100, filters: f });
    if (!res) return { nos, complete: false };
    nos.push(...arr(res.sp_no_list).map(String));
    if (!res.new_next_cursor) return { nos, complete: true };
    cursor = res.new_next_cursor;
  }
  return { nos, complete: false };
}

// 假勤审批单详情：只保留申请人、状态、类型、起止时间、时长和假期名称，不取事由、附件、审批意见
export async function fetchApproval(c, no) {
  const info = (await c.call('oa/getapprovaldetail', {}, { sp_no: no }))?.info;
  if (!info) return null;
  const out = { no: String(no), status: info.sp_status, user: info.applyer?.userid || '', at: Number(info.apply_time) || 0, items: [] };
  for (const f of arr(info.apply_data?.contents)) {
    const a = f?.control === 'Vacation' ? f.value?.vacation?.attendance : f?.control === 'Attendance' ? f.value?.attendance : null;
    const r = a?.date_range, from = Number(r?.new_begin), to = Number(r?.new_end);
    if (!a || !Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to < from) continue;
    const name = f.control === 'Vacation' ? arr(arr(f.value.vacation.selector?.options)[0]?.value)[0]?.text || '' : '';
    out.items.push({ kind: Number(a.type) || (f.control === 'Vacation' ? 1 : 0), name, from, to, unit: r.type === 'hour' ? 'hour' : 'halfday', sec: Number(r.new_duration) || 0,
      days: arr(a.slice_info?.day_items).map(x => ({ day: Number(x?.daytime), sec: Number(x?.duration) || 0 })).filter(x => Number.isFinite(x.day) && x.day > 0) });
  }
  return out;
}
