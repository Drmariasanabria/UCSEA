// Session reports ("VDR" = voyage data recorder of the class session) in many formats.
import { hhmm, fmtDate, fmtDuration, download, csvEscape, slugify, escapeHtml } from '../core/util.js';
import { roleById, careerById } from '../data/careers.js';
import { scenarioById } from '../data/scenarios.js';
import { structureById } from '../data/smcp.js';
import { SEVERITY } from '../data/events.js';
import { participantStats, goalProgress } from '../ai/analyzer.js';
import { buildDocx, markdownToBlocks } from './docx.js';
import { fluency, safetyIndex } from '../lab/metrics.js';

const spokenKinds = ['radio', 'intercom'];

export function reactionMetrics(events, comms, crew) {
  return events.map((e) => ({
    event: e,
    rows: crew.map((c) => {
      const ack = e.acks?.[c.uid] || null;
      const first = comms.find((m) => m.fromUid === c.uid && m.ts >= e.ts && spokenKinds.includes(m.kind));
      return { uid: c.uid, name: c.name, roleId: c.roleId, ackMs: ack ? ack - e.ts : null, firstMsgMs: first ? first.ts - e.ts : null };
    }),
  }));
}

export function buildSessionReport({ lab, crew = [], comms = [], events = [], focusUid = null }) {
  const sc = scenarioById(lab.scenarioId);
  const people = focusUid ? crew.filter((c) => c.uid === focusUid) : crew;
  const start = lab.startedAt || lab.createdAt;
  const end = lab.endedAt || (comms.length ? comms[comms.length - 1].ts : Date.now());
  const msgsOf = (uid) => comms.filter((m) => m.fromUid === uid && ['radio', 'intercom', 'log'].includes(m.kind));
  const aiCounts = comms.filter((m) => m.kind === 'npc').reduce((a, m) => { a[m.aiProvider || 'scripted'] = (a[m.aiProvider || 'scripted'] || 0) + 1; return a; }, {});
  const reactions = reactionMetrics(events, comms, people);

  const md = [];
  md.push(`# ${lab.title || 'Communication Lab session'}`);
  md.push(`**Scenario:** ${sc.en} — ${sc.area}  `);
  md.push(`**Exercise ship:** ${lab.ownShip?.name} (${lab.ownShip?.type}, ${lab.ownShip?.callsign})  `);
  md.push(`**Date:** ${fmtDate(start)} · **Duration:** ${fmtDuration(end - start)} · **Instructor:** ${lab.ownerName || '—'} · **Code:** ${lab.code}`);
  md.push('');
  md.push('## Task instructions');
  md.push(lab.brief || '—');
  if (lab.goals?.length) {
    md.push('');
    md.push('**Required structures:** ' + lab.goals.map((g) => `${structureById(g.id)?.es || g.id} ×${g.count}`).join('; '));
  }
  md.push('');
  md.push('## Crew and stations');
  md.push(`**Ship Safety Index (team):** ${safetyIndex({ events, comms, crew, now: end }).score}/100`);
  md.push('');
  md.push('| Participant | Degree | Role | Messages | Words | Spoken | Fluency (wpm · ASR conf.) | Markers | Variety | SMCP accuracy |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const c of people) {
    const s = participantStats(msgsOf(c.uid));
    const fl = fluency(msgsOf(c.uid));
    md.push(`| ${c.name} | ${careerById(c.careerId)?.short || '—'} | ${roleById(c.roleId)?.en || '—'} | ${s.messages} | ${s.words} | ${s.spoken} | ${fl.wpm ? `${fl.wpm} · ${fl.confidence ?? '—'}%` : '—'} | ${s.markers} | ${s.variety} | ${s.smcpAccuracy ?? '—'}% |`);
  }
  md.push('');
  md.push('## Incidents and reaction times');
  if (!events.length) md.push('No incidents were triggered.');
  for (const r of reactions) {
    const e = r.event;
    md.push(`### ${hhmm(new Date(e.ts))} — ${e.title} (${SEVERITY[e.severity]?.es || e.severity})`);
    md.push(`${e.situation || ''}  `);
    md.push(`Triggered by: ${e.by?.name || '—'}${e.status === 'resolved' ? ` · Resolved ${hhmm(new Date(e.resolvedAt))}` : ' · still active'}`);
    md.push('');
    md.push('| Participant | Role | Alarm acknowledged | First transmission |');
    md.push('|---|---|---|---|');
    for (const x of r.rows) md.push(`| ${x.name} | ${roleById(x.roleId)?.en || ''} | ${x.ackMs != null ? fmtDuration(x.ackMs) : '—'} | ${x.firstMsgMs != null ? fmtDuration(x.firstMsgMs) : '—'} |`);
    md.push('');
  }
  if (lab.goals?.length) {
    md.push('## Language goals');
    for (const c of people) {
      const prog = goalProgress(msgsOf(c.uid), lab.goals);
      md.push(`**${c.name}:** ` + prog.map((g) => `${structureById(g.id)?.es.split(' (')[0] || g.id} ${g.total}/${g.count}${g.ok ? ' ✓' : ''}`).join(' · '));
    }
    md.push('');
  }
  md.push('## Transcript');
  md.push('| Time | Channel | From | To | Message |');
  md.push('|---|---|---|---|---|');
  const shown = comms.filter((m) => m.kind !== 'log' && m.kind !== 'whisper' && m.kind !== 'review' && (!focusUid || m.fromUid === focusUid || m.kind === 'npc' || m.kind === 'system' || m.toUid === focusUid));
  for (const m of shown) md.push(`| ${hhmm(new Date(m.ts))} | ${m.channel || ''} | ${(m.from || '').replace(/\|/g, '/')} | ${(m.to || '').replace(/\|/g, '/')} | ${(m.text || '').replace(/\|/g, '/').replace(/\n/g, ' ')}${m.spoken ? ' 🎙' : ''} |`);
  const reviews = comms.filter((m) => m.kind === 'review' && (!focusUid || m.toUid === focusUid));
  if (reviews.length) {
    md.push('');
    md.push('## Peer feedback');
    for (const r of reviews) md.push(`- To ${crew.find((c) => c.uid === r.toUid)?.name || '—'}: clarity ${r.review?.clarity}/4 · procedure ${r.review?.procedure}/4 · precision ${r.review?.precision}/4 — ${r.text}`);
  }
  const logs = comms.filter((m) => m.kind === 'log' && (!focusUid || m.fromUid === focusUid));
  if (logs.length) {
    md.push('');
    md.push('## Log book entries');
    for (const l of logs) md.push(`- ${hhmm(new Date(l.ts))} — **${l.fromName || l.from}:** ${l.text}`);
  }
  md.push('');
  md.push('## AI stations');
  md.push(Object.keys(aiCounts).length ? Object.entries(aiCounts).map(([k, v]) => `${k}: ${v} replies`).join(' · ') : 'No AI replies.');
  md.push('');
  md.push(`_Generated by UCSea v10 on ${fmtDate(Date.now())}. Language indicators are automatic, rule-based and explainable; they support, not replace, teacher assessment._`);
  const markdown = md.join('\n');
  return { markdown, html: markdownToHtml(markdown, lab.title), shown };
}

export function markdownToHtml(md, title = 'Report') {
  const lines = md.split('\n');
  let html = '';
  let inTable = false;
  let rowIdx = 0;
  const inline = (s) => escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/_([^_]+)_/g, '<i>$1</i>');
  for (const line of lines) {
    if (/^\|/.test(line)) {
      if (/^\|\s*-/.test(line)) continue;
      if (!inTable) { html += '<table>'; inTable = true; rowIdx = 0; }
      const cells = line.replace(/^\||\|$/g, '').split('|');
      html += '<tr>' + cells.map((c) => (rowIdx === 0 ? `<th>${inline(c.trim())}</th>` : `<td>${inline(c.trim())}</td>`)).join('') + '</tr>';
      rowIdx++;
      continue;
    }
    if (inTable) { html += '</table>'; inTable = false; }
    if (/^# /.test(line)) html += `<h1>${inline(line.slice(2))}</h1>`;
    else if (/^## /.test(line)) html += `<h2>${inline(line.slice(3))}</h2>`;
    else if (/^### /.test(line)) html += `<h3>${inline(line.slice(4))}</h3>`;
    else if (/^- /.test(line)) html += `<li>${inline(line.slice(2))}</li>`;
    else if (line.trim()) html += `<p>${inline(line)}</p>`;
  }
  if (inTable) html += '</table>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
body{font:15px/1.55 Inter,Segoe UI,Arial,sans-serif;color:#0b1e2e;max-width:1000px;margin:30px auto;padding:0 24px}
h1{color:#0b4f7c;border-bottom:3px solid #39d0ff;padding-bottom:8px}h2{color:#1a7fb0;margin-top:28px}h3{color:#0b1e2e}
table{border-collapse:collapse;width:100%;margin:10px 0;font-size:13px}th,td{border:1px solid #c8d8e4;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eaf6ff}
tr:nth-child(even) td{background:#f7fbfe}p{margin:6px 0}@media print{body{margin:0}h2{page-break-after:avoid}table{page-break-inside:auto}}
</style></head><body>${html}</body></html>`;
}

export function printHtml(html) {
  const w = window.open('', '_blank');
  if (!w) return alert('Permite las ventanas emergentes para generar el PDF.');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
}

export function exportSession(format, data) {
  const { lab } = data;
  const base = `vdr-${slugify(lab.title || 'session')}-${lab.code}${data.focusUid ? '-' + slugify(data.crew.find((c) => c.uid === data.focusUid)?.name || '') : ''}`;
  const rep = buildSessionReport(data);
  if (format === 'md') return download(base + '.md', rep.markdown, 'text/markdown;charset=utf-8');
  if (format === 'html') return download(base + '.html', rep.html, 'text/html;charset=utf-8');
  if (format === 'pdf') return printHtml(rep.html);
  if (format === 'docx') return download(base + '.docx', buildDocx(markdownToBlocks(rep.markdown), { title: lab.title }));
  if (format === 'csv') {
    const rows = [['iso_time', 'ship_time', 'kind', 'channel', 'from', 'from_uid', 'role', 'to', 'text', 'spoken', 'markers', 'structures', 'issues', 'ai_provider']];
    for (const m of data.comms) rows.push([new Date(m.ts).toISOString(), hhmm(new Date(m.ts)), m.kind, m.channel, m.from, m.fromUid, m.fromRoleId || '', m.to || '', m.text, m.spoken ? 1 : 0, (m.markers || []).join(' '), Object.keys(m.analysis?.structures || {}).join(' '), (m.analysis?.issues || []).map((i) => i.code).join(' '), m.aiProvider || '']);
    return download(base + '.csv', '﻿' + rows.map((r) => r.map(csvEscape).join(',')).join('\n'), 'text/csv;charset=utf-8');
  }
  if (format === 'json') {
    return download(base + '.json', JSON.stringify({ format: 'mesim-vdr', version: 1, exportedAt: new Date().toISOString(), lab: data.lab, crew: data.crew, events: data.events, comms: data.comms, track: data.track || [] }, null, 2), 'application/json');
  }
  throw new Error('Unknown format ' + format);
}

export const EXPORT_FORMATS = [
  { id: 'pdf', label: 'PDF (imprimir)', icon: 'doc' },
  { id: 'docx', label: 'Word (.docx)', icon: 'doc' },
  { id: 'html', label: 'Informe HTML', icon: 'doc' },
  { id: 'md', label: 'Markdown', icon: 'doc' },
  { id: 'csv', label: 'CSV (datos para investigación)', icon: 'download' },
  { id: 'json', label: 'JSON (caja negra completa, reimportable)', icon: 'download' },
];
