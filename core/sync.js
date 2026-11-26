// 同步：按固定顺序调企微官方接口，取回页面要的全部原始数据。只放内存，不落盘。
// 通讯录、花名册、往月月报和已办结的审批单不会每次重取；日报、排班、今天的打卡每轮都取（补卡、请假批下来后往日的日报会变）。
// 任何关键接口报错，这一轮就算失败，不返回数据，由调用方沿用上一轮。
import { client, login, fetchDirectory, fetchRoster, fetchDaily, fetchMonthly, fetchPunches, fetchPlans, fetchApprovalNos, fetchApproval, pool, arr, dayStart, dayOf, addDays, DAY, HINT } from './lib.js';

const SOFT = new Set(['hr/get_fields', 'hr/get_staff_info', 'oa/getapprovalinfo', 'oa/getapprovaldetail', 'checkin/getcheckin_monthdata']);   // 这些报错只影响局部，页面照常出

export function createSync(raw, cfg) {
  const c = client(raw), keep = { tokenAt: 0, dir: null, dirAt: 0, roster: null, rosterAt: 0, months: new Map(), monthsFor: '', approvals: new Map() };
  const wall = () => Math.floor(Date.now() / 1000);
  return async function sync(now, full = false, step = () => {}) {
    const seen = JSON.parse(JSON.stringify(c.stat.errors)), calls0 = c.stat.calls, started = Date.now(), today = dayOf(now), yest = addDays(today, -1), t0 = dayStart(today);
    const fresh = p => Object.entries(c.stat.errors[p] || {}).some(([code, n]) => n > (seen[p]?.[code] || 0));   // 这一轮里这个接口报过错
    const done = (ok, data) => {
      const errors = {};
      for (const [p, codes] of Object.entries(c.stat.errors)) for (const [code, n] of Object.entries(codes)) if (n > (seen[p]?.[code] || 0)) (errors[p] ??= {})[code] = n - (seen[p]?.[code] || 0);
      ok = ok && Object.keys(errors).every(p => SOFT.has(p));
      if (!ok) keep.tokenAt = 0;   // 这一轮没成，下一轮重新取凭证
      return { ok, raw: ok ? data : undefined, info: { calls: c.stat.calls - calls0, seconds: Math.round((Date.now() - started) / 100) / 10, errors, ip: c.stat.ip,
        hints: [...new Set(Object.values(errors).flatMap(o => Object.keys(o)))].filter(k => HINT[k]).map(k => k + '：' + HINT[k]),
        rosterOff: !keep.roster?.schema.length, rosterFailed: keep.roster?.failed || 0, leaveOff: fresh('oa/getapprovalinfo') || fresh('oa/getapprovaldetail'), monthsOff: fresh('checkin/getcheckin_monthdata') } };
    };
    step('连接企业微信');
    if (wall() - keep.tokenAt > 6000) { if (!await login(c, cfg)) return done(false); keep.tokenAt = wall(); }
    step('通讯录');
    if (full || !keep.dir || wall() - keep.dirAt > 900) {
      const d = await fetchDirectory(c);
      if (!d.people.size || fresh('department/list') || fresh('user/list')) return done(false);   // 取到一半的名单不留用
      keep.dir = d; keep.dirAt = wall();
    }
    const { depts, people } = keep.dir, ids = [...people.keys()];
    step('花名册');
    if (full || !keep.roster || wall() - keep.rosterAt > 6 * 3600) {
      const r = await fetchRoster(c, ids), good = r.schema.length > 0 && !r.failed, old = keep.roster;
      // 没取全时，没取到的人先沿用上一轮的，半小时后再试
      keep.roster = good || !old ? r : { ...r, schema: r.schema.length ? r.schema : old.schema, rows: new Map([...old.rows, ...r.rows]) };
      keep.rosterAt = good ? wall() : wall() - 6 * 3600 + 1800;
    }
    step('打卡规则和排班');
    const plans = await fetchPlans(c, ids, today);
    step('近 30 天打卡日报');
    const daily = await fetchDaily(c, ids, addDays(today, -30), yest);
    step('今天的打卡');
    const punches = await fetchPunches(c, ids, t0, now);
    step('请假审批');
    // 审批单只能按提交时间查，一次最多跨 31 天。近 31 天提交的全要；再往前查两段（到 93 天），只为找早早提交、现在还没休完的假
    const SPAN = 31 * DAY - 60, span = k => fetchApprovalNos(c, now - (k + 1) * SPAN, now - k * SPAN, { record_type: 1 });
    const list = await span(0), older = [await span(1), await span(2)], complete = list.complete && older.every(l => l.complete);
    // 近三天日报里挂着的假勤单也算上：比 93 天还早提交、今天还没休完的长假，只能从这里找到单号
    const refs = [0, 1, 2].flatMap(k => [...(daily.days.get(addDays(yest, -k))?.values() || [])]).flatMap(e => arr(e.holiday_infos)).map(h => String(h?.sp_number || '')).filter(Boolean);
    const nos = new Set([...list.nos, ...older.flatMap(l => l.nos), ...refs, ...(complete ? [] : keep.approvals.keys())]);
    // 没见过的、还在审批中的、已通过且假期没过完的（可能被撤销）才去取详情
    const need = [...nos].filter(no => { const a = keep.approvals.get(no); return !a || a.status === 1 || (a.status === 2 && a.items.some(x => x.to >= t0)); });
    await pool(need, 4, async no => { const a = await fetchApproval(c, no); if (a) keep.approvals.set(no, a); });
    for (const no of [...keep.approvals.keys()]) if (!nos.has(no)) keep.approvals.delete(no);
    // 交给页面的：近 31 天提交的、日报里挂着的，加上更早提交但还没休完的。一个月以前提交、已经休完的只留在这里免得重取，不进请假单列表
    const leaves = [...nos].map(no => keep.approvals.get(no)).filter(a => a && (a.at >= now - SPAN || refs.includes(a.no) || a.items.some(x => x.to >= t0)));
    // 加班审批只数张数，页面据此说明"有没有审批确认的加班"；取不到记为未知
    const ot = await fetchApprovalNos(c, now - SPAN, now, { record_type: 5 });
    step('往月月报');
    if (full || keep.monthsFor !== today) {
      const months = new Map();
      for (let k = 0, first = today.slice(0, 8) + '01'; k < 6; k++) {
        const last = addDays(first, -1); first = last.slice(0, 8) + '01';
        const m = await fetchMonthly(c, ids, first, last);
        if (m.size) months.set(first.slice(0, 7), m);
      }
      const bad = fresh('checkin/getcheckin_monthdata');
      if (!bad || !keep.months.size) keep.months = months;   // 没取全就先沿用上一轮的，下一轮再取
      keep.monthsFor = bad ? '' : today;
    }
    return done(true, { depts, people, roster: keep.roster, plans, daily, punches, leaves, otForms: ot.complete ? ot.nos.length : null, months: keep.months });
  };
}
