// 示例数据：企业微信里没有的那部分——工作事项、岗位业绩、能力评价、薪酬、培养、招聘。
// 全部按固定种子从人员名单生成：同一个人在各个页面上的数互相对得上，重复生成结果不变，不含任何真实信息。
// 只在演示数据下使用。接真实企业微信时没有这部分，对应页面显示"待接入"，不放编出来的数。
import { addDays, r1 } from './lib.js';
import { aggregate } from './model.js';

export const LEVELS = ['核心人才', '优秀人才', '高潜人才', '稳定贡献', '待提升'];
export const GRADES = ['A', 'B+', 'B', 'C'];
export const STAGES = ['简历初筛', '一面', '二面', '待入职', '已入职'];
// 口径里人为定的门槛，页面"指标口径"直接读这张表
export const DEMO_RULES = {
  gradeA: 108, gradeBp: 98, gradeB: 86,          // 本月目标完成率 -> 绩效等级
  coreAbility: 85, coreTenure: 12,               // 核心人才：绩效 A、能力满 85、司龄满 12 个月
  weakAbility: 70,                               // 能力评分低于 70：待提升
  potHigh: 82, potMid: 72, potMonths: 36,        // 潜力分档；高潜只看司龄不满 36 个月的人
  behind: 80,                                    // 当前工作进度低于 80%：进度滞后
  declineDrop: 6,                                // 近 3 个月连续下降且累计降 6 个点：业绩下降
  fitAbility: 80, fitQuality: 92                 // 能力满 80 但绩效为 C 或质量低于 92%：岗位匹配待优化
};

const H = 3600;
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rnd = (seed, n) => { let x = Math.imul(seed ^ Math.imul(n + 1, 2654435761), 2246822519); x ^= x >>> 15; x = Math.imul(x, 3266489917); x ^= x >>> 13; x = Math.imul(x, 668265263); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v)), r2 = v => Math.round(v * 100) / 100, r4 = v => Math.round(v * 10000) / 10000, to100 = v => Math.round(v / 100) * 100;
const pick = (list, r) => list[Math.min(list.length - 1, Math.floor(r * list.length))];
const median = l => { const s = [...l].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
const ymAdd = (ym, n) => { const t = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5)) - 1 + n; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };

// 岗位族：按岗位名归类。归不进去的（总经理、顾问）不参与业绩和评价
const FAMILY = [['service', /客服/], ['ops', /运营|投放|主播|企划/], ['design', /设计|摄影/], ['supply', /仓|打包|采购|跟单/], ['admin', /人事|行政|会计|出纳/]];
export const familyOf = post => (FAMILY.find(([, re]) => re.test(post || '')) || [''])[0];
export const FAMILY_NAME = { ops: '运营', service: '客服', design: '设计', supply: '供应链', admin: '职能' };
// 每个岗位族的主产出和质量指标：[产出名, 单位, 月目标下限, 上限, 取整步长, 质量指标名]
const OUT = { ops: ['归属成交额', '元', 160000, 420000, 10000, '订单净留存率'], service: ['接待量', '人次', 1300, 2400, 50, '回复达标率'], design: ['交付件数', '件', 36, 64, 2, '一次通过率'],
  supply: ['完成单量', '单', 2400, 4800, 100, '复核准确率'], admin: ['办结事项', '项', 36, 80, 2, '按期办结率'] };
const PAY = { ops: [8000, 14000], service: [5500, 8000], design: [8500, 14000], supply: [5500, 9000], admin: [6500, 11000] };
const DIMS = ['专业能力', '执行力', '沟通协作', '责任心', '学习成长'];
// 店铺只用泛称，不写具体是哪家平台
const STORES = ['旗舰店', '直播小店', '分销店', '自营店', '内容店'];
const TASKS = { ops: ['复盘{店}本周推广计划', '核对{店}主推款毛利', '提交{店}活动报名资料', '整理{店}退款原因清单', '更新{店}详情页卖点'],
  service: ['抽查昨日售后结单', '整理高频咨询话术', '复核未回复会话清单', '登记疑难会话交接', '回访差评订单'],
  design: ['完成主推款详情页', '拍摄新品场景图', '修订首页活动海报', '输出下月上新视觉方案'],
  supply: ['盘点 A 区库存', '核对异常包裹', '跟进面料到货', '对账供应商月结单', '复核出库差异'],
  admin: ['核对本月考勤异常', '办理新人入职手续', '整理费用报销单', '月度结账对账', '更新制度文档'] };
const GOALS = { 主管储备: { ops: '独立负责一个店铺组的月度目标', service: '带教 2 名新人并负责排班复盘', design: '主导一次上新视觉方案评审', supply: '负责仓内作业标准复核', admin: '独立完成月度结账与复盘' },
  重点培养: { ops: '投放与活动复盘方法训练', service: '疑难会话处理与升级训练', design: '详情页结构与转化训练', supply: '异常件处理流程训练', admin: '制度与流程梳理训练' },
  跟进提升: { ops: '补齐活动复盘与数据核对', service: '回复达标率提升到岗位标准', design: '一次通过率提升到岗位标准', supply: '复核准确率提升到岗位标准', admin: '按期办结率提升到岗位标准' } };
const REVIEW = { A: ['目标超额完成，过程记录完整', '可以承担带教或更大范围的职责'], 'B+': ['目标达成，协作配合好', '复盘还可以写得更具体'], B: ['基本完成目标', '个别事项需要跟进才能闭环'], C: ['目标未达成', '需要明确改进计划并按周跟进'] };
// 招聘需求：[岗位, 部门, 人数, 用工类型, 期望到岗（距今天数）, 是否已批]
const JOBS = [['店铺运营', '运营中心', 2, '全职', 12, 1], ['售前客服', '客服中心', 3, '全职', 8, 1], ['主播', '运营中心', 1, '全职', 20, 1], ['设计师', '产品设计部', 1, '全职', 15, 1], ['打包', '供应链', 2, '全职', 5, 1],
  ['会计', '职能部', 1, '全职', -3, 1], ['推广投放', '运营中心', 1, '实习', 25, 0]];
const CHANNELS = ['内部推荐', '招聘平台', '校园招聘', '主动投递'], CAND_SUR = '林陈黄吴周徐孙朱马胡郭何高罗郑梁谢宋唐许';

export const gradeOf = rate => rate >= DEMO_RULES.gradeA ? 'A' : rate >= DEMO_RULES.gradeBp ? 'B+' : rate >= DEMO_RULES.gradeB ? 'B' : 'C';
const isLead = post => /组长$/.test(post || '');

export function demoExtras(ds) {
  const { today, yest, monthStart, days } = ds.meta, md = days.filter(d => d >= monthStart), ym = monthStart.slice(0, 7);
  const months = Array.from({ length: 6 }, (_, i) => ymAdd(ym, i - 5));
  const head = dept => ds.people.find(p => p.dept === dept && isLead(p.post))?.name || '';
  const byId = {}, list = [];

  // 第一遍：每个人自己的业绩、任务、能力、薪酬
  for (const p of ds.people) {
    const family = familyOf(p.post);
    if (!family || p.rule === 'none') continue;
    const seed = hash(p.id), r = n => rnd(seed, n), lead = isLead(p.post), ten = p.tenure;
    const q = clamp(0.5 + (r(1) - 0.5) * 0.95 + (lead ? 0.12 : 0) + (ten == null ? 0 : Math.min(ten, 36) / 36 * 0.08), 0, 1), qa = clamp(q + (r(2) - 0.5) * 0.5, 0, 1);
    // 近 6 个月目标完成率：多数人平稳，少数人连续上升或连续下降；入职前的月份没有数
    const base = 79 + q * 33, way = r(11) < 0.1 ? 'down' : r(11) < 0.34 ? 'up' : 'flat', slope = way === 'down' ? 3.5 + r(12) * 3 : way === 'up' ? -(2.5 + r(12) * 2.5) : 0;
    const trend = months.map((m, i) => p.join && m < p.join.slice(0, 7) ? null : clamp(Math.round(base + (5 - i) * slope + (r(20 + i) - 0.5) * (way === 'flat' ? 6 : 2)), 60, 130));
    const rate = trend[5], t3 = trend.slice(-3), decline = t3[0] != null && t3[0] > t3[1] && t3[1] > t3[2] && t3[0] - t3[2] >= DEMO_RULES.declineDrop;
    const rising = t3[0] != null && t3[0] < t3[1] && t3[1] < t3[2];
    const quality = r1(clamp(86 + q * 12 + (r(13) - 0.5) * 4, 80, 100));
    const progress = clamp(Math.round(73 + q * 25 + (r(14) - 0.5) * 16), 40, 100);
    const total = 8 + Math.floor(r(15) * 10), overdue = progress < 70 ? 1 + Math.floor(r(16) * 3) : r(16) < 0.15 ? 1 : 0, done = Math.round((total - overdue) * clamp(0.62 + q * 0.38, 0, 1));
    const dims = Object.fromEntries(DIMS.map((d, j) => [d, clamp(Math.round(66 + qa * 22 + (r(30 + j) - 0.5) * 16), 50, 100)]));
    const score = Math.round(DIMS.reduce((a, d) => a + dims[d], 0) / DIMS.length);
    const pot = score * 0.5 + dims['学习成长'] * 0.5 + (rising ? 6 : decline ? -6 : 0), potential = pot >= DEMO_RULES.potHigh ? 'high' : pot >= DEMO_RULES.potMid ? 'mid' : 'low';
    const grade = gradeOf(rate);
    const level = grade === 'A' && score >= DEMO_RULES.coreAbility && ten != null && ten >= DEMO_RULES.coreTenure ? '核心人才'
      : grade === 'A' || (grade === 'B+' && score >= DEMO_RULES.coreAbility) ? '优秀人才'
      : potential === 'high' && ten != null && ten < DEMO_RULES.potMonths && grade !== 'C' ? '高潜人才'
      : grade === 'C' || score < DEMO_RULES.weakAbility ? '待提升' : '稳定贡献';
    // 产出：工时用考勤里本月的计入工时；同岗位每工时的目标相近（月目标按 250 工时折算），实际 = 目标 × 完成率
    const [name, unit, lo, hi, step, qName] = OUT[family], postBase = lo + (hi - lo) * rnd(hash(p.post), 1);
    const agg = aggregate(md.map(d => p.days[d])), hours = r1((agg.reg || agg.span) / H);
    const target = Math.max(step, Math.round(postBase * hours / 250 * (0.92 + r(17) * 0.16) / step) * step), value = Math.round(target * rate / 100);
    const [payLo, payHi] = PAY[family];
    const salary = p.type === '实习' ? 3000 + to100(r(18) * 800) : to100(((payLo + (payHi - payLo) * clamp(0.15 + q * 0.6 + (ten == null ? 0 : Math.min(ten, 36) / 36 * 0.25), 0, 1)) + (lead ? 3000 : 0)) * (p.type === '试用期' ? 0.9 : 1));
    const status = (level === '核心人才' || level === '优秀人才') && !lead && ten != null && ten >= 12 && r(40) < 0.5 ? '主管储备' : level === '高潜人才' ? '重点培养' : level === '待提升' ? '跟进提升' : p.type === '试用期' || p.type === '实习' ? '试用期带教' : '';
    const e = { family, perf: { rate, trend, grade, quality, decline }, work: { progress, tasks: { total, done, overdue }, taskRate: r1(done / total * 100) },
      output: { name, unit, value, target, hours, per: hours > 0 ? r4(value / hours) : null, qName }, eff: null, effPrev: null,
      ability: { score, dims }, potential, level, warn: decline || progress < 70, salary, training: status };
    byId[p.id] = e; list.push({ p, e, r, q, lead });
  }

  // 第二遍：同岗基准 -> 人效指数（本人单位工时产出 ÷ 同岗位的中位数；同岗不足 3 人时按岗位族）
  const group = key => { const g = {}; for (const v of list) if (v.e.output.per != null) (g[key(v)] ??= []).push(v.e.output.per); return g; };
  const byPost = group(v => v.p.post), byFamily = group(v => v.e.family);
  for (const { p, e } of list) {
    if (e.output.per == null) continue;
    const peers = byPost[p.post].length >= 3 ? byPost[p.post] : byFamily[e.family], basis = median(peers);
    e.output.basis = basis; e.output.peers = byPost[p.post].length >= 3 ? 'post' : 'family';
    e.eff = basis > 0 ? r2(e.output.per / basis) : null;
    e.effPrev = e.eff != null && e.perf.trend[4] != null ? r2(e.eff * e.perf.trend[4] / e.perf.rate) : null;
  }

  // 具名重点事项：每人两三条，状态和这个人的任务统计方向一致
  const tasks = [];
  for (const { p, e, r, q } of list) {
    const pool = TASKS[e.family], n = 2 + hash(p.id + 't') % 2, store = pick(STORES, r(50));
    for (let i = 0; i < n; i++) {
      const status = i === 0 && e.work.tasks.overdue ? 'overdue' : r(51 + i) < 0.5 + q * 0.42 ? 'done' : 'doing';
      const due = status === 'overdue' ? addDays(today, -(1 + Math.floor(r(54 + i) * 6))) : status === 'doing' ? addDays(today, Math.floor(r(54 + i) * 8)) : addDays(yest, -Math.floor(r(54 + i) * Math.max(1, md.length - 1)));
      tasks.push({ id: 'T' + String(tasks.length + 1).padStart(3, '0'), name: pool[(hash(p.id) + i) % pool.length].replace('{店}', store), owner: p.id, status, due, doneAt: status === 'done' ? due : '' });
    }
  }

  // 主管评价（上月）、培养计划、入职后的阶段回访
  const reviews = [], plans = [], outcomes = [], prev = months[4];
  for (const { p, e, r, q } of list) {
    if (e.perf.trend[4] != null) {
      const g = gradeOf(e.perf.trend[4]);
      reviews.push({ person: p.id, reviewer: p.leader || head(p.dept) || '', period: prev, grade: g, good: REVIEW[g][0], improve: REVIEW[g][1], evidence: 2 + Math.floor(r(60) * 4), confirmed: r(61) < 0.88 ? addDays(monthStart, 2 + Math.floor(r(62) * 6)) : '' });
    }
    if (e.training) {
      const span = e.training === '试用期带教' ? 90 : 120, start = addDays(today, -(10 + Math.floor(r(42) * (span + 15)))), due = addDays(start, span), progress = clamp(Math.round(15 + r(41) * 96), 5, 100);
      const mentor = [p.leader, head(p.dept)].find(n => n && n !== p.name) || '';
      plans.push({ person: p.id, kind: e.training, goal: e.training === '试用期带教' ? '完成试用期目标并通过转正评估' : GOALS[e.training][e.family], mentor, progress, start, due, status: progress >= 100 ? '已完成' : due < today ? '已逾期' : '进行中' });
    }
    if (p.join && p.join <= today) {
      const joined = Math.round((Date.parse(today) - Date.parse(p.join)) / 86400000);
      if (joined <= 200) for (const stage of [30, 90, 180]) {
        if (joined >= stage) outcomes.push({ person: p.id, stage, result: q >= 0.4 ? '达标' : '待改进', date: addDays(p.join, stage) });
        else if (joined >= stage - 30) outcomes.push({ person: p.id, stage, result: '待评', date: addDays(p.join, stage) });
      }
    }
  }

  // 招聘：需求、候选人（只有姓和编号）。已入职人数 = 走到最后一步的候选人数
  const jobs = [], candidates = [];
  for (const [post, dept, headcount, type, expect, approved] of JOBS) {
    if (!ds.depts.includes(dept)) continue;
    const job = { id: 'J' + (jobs.length + 1), post, dept, headcount, type, expect: addDays(today, expect), applicant: head(dept), status: approved ? '招聘中' : '待审批', filled: 0 };
    jobs.push(job);
    if (!approved) continue;
    const seed = hash(job.id + post), n = 5 + Math.floor(rnd(seed, 1) * 5), cap = expect < 0 ? headcount : headcount - 1;
    for (let i = 0; i < n; i++) {
      const v = rnd(seed, 10 + i), k = candidates.length;
      let reach = v < 0.08 ? 4 : v < 0.18 ? 3 : v < 0.38 ? 2 : v < 0.62 ? 1 : 0;
      if (expect < 0 && i === 0) reach = 4;
      if (reach === 4 && job.filled >= cap) reach = 3;
      if (reach === 4) job.filled++;
      const state = reach === 4 ? 'hired' : rnd(seed, 30 + i) < 0.58 ? 'active' : 'out', at = addDays(today, -(3 + Math.floor(rnd(seed, 50 + i) * 24)));
      const c = { code: 'C' + String(k + 1).padStart(3, '0'), name: CAND_SUR[(k * 7 + 3) % CAND_SUR.length] + '某', job: job.id, post, dept, channel: pick(CHANNELS, rnd(seed, 70 + i)), at, reach, state, interviewAt: '', interviewer: '' };
      if (state === 'active' && (reach === 1 || reach === 2)) { c.interviewAt = addDays(today, Math.floor(rnd(seed, 90 + i) * 5)) + ' ' + pick(['10:00', '14:00', '16:30'], rnd(seed, 110 + i)); c.interviewer = head(dept); }
      candidates.push(c);
    }
    if (job.filled >= job.headcount) job.status = '已招满';
  }

  return { month: ym, months, byId, tasks, reviews, plans, outcomes, jobs, candidates };
}
