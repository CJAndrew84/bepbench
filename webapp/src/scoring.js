// Equivalent of bepkit/scoring/{engine,rules}.py, checked against Python fixtures.
const placeholders = new Set(['tbd', 'tba', 'tbc', 'todo', 'to be defined', 'to be confirmed', 'to be advised', 'to be agreed', 'n/a', 'na', 'none', 'nil', '-', '--', '?', '??', '???', 'xxx', 'xx', 'tbd.', 'pending', 'lorem ipsum', 'placeholder']);
export const text = value => value == null ? '' : typeof value === 'boolean' ? (value ? 'True' : 'False') : String(value);
export const isPlaceholder = value => placeholders.has(text(value).trim().toLowerCase()) || /^[\s.\-_?xX*]+$/.test(text(value).trim());
export const tableRows = value => Array.isArray(value) ? value.filter(r => r && !Array.isArray(r) && typeof r === 'object' && Object.values(r).some(v => text(v).trim())) : [];
const asList = value => Array.isArray(value) ? value : text(value).split(',').map(v => v.trim()).filter(Boolean);
export const inStage = (item, stage) => !stage || !item.stages?.length || item.stages.includes(stage);
export const sectionsFor = (fw, stage) => fw.sections.filter(s => inStage(s, stage));
export const fieldsFor = (s, stage) => s.fields.filter(f => inStage(f, stage));
const normalise = v => text(v).toLowerCase().replace(/[^\p{L}\p{N}_\s/&-]/gu, ' ').replace(/\s+/g, ' ').trim();
const words = v => text(v).trim().split(/\s+/).filter(Boolean).length;
const empty = (f, v) => v == null || (f.type === 'boolean' ? false : f.type === 'table' ? !tableRows(v).length : ['list', 'multiselect'].includes(f.type) ? !asList(v).filter(x => text(x).trim()).length : !text(v).trim());
const round = (n, places = 1) => Number(n.toFixed(places));
const severityOrder = { blocker: 0, major: 1, minor: 2, info: 3 };
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function scoreField(section, f, value, settings = {}) {
  const floor = settings.presence_floor ?? 0.35;
  const ramp = (a, e) => e <= 0 ? 1 : Math.min(1, floor + (1 - floor) * a / e);
  const build = (score, state, detail, filled) => ({ path: `${section}.${f.id}`, section, field: f.id, label: f.label, type: f.type, required: f.required, weight: f.weight, score, state, detail, filled });
  if (empty(f, value)) return build(0, 'empty', 'Not answered.', false);
  if (!['table', 'multiselect', 'list'].includes(f.type) && isPlaceholder(value)) return build(0.1, 'partial', 'Placeholder text — no actual commitment recorded.', true);
  const q = f.quality;
  if (f.type === 'table') {
    const rows = tableRows(value), cols = f.columns.filter(c => c.required);
    const cells = cols.length ? rows.reduce((n, r) => n + cols.filter(c => text(r[c.id]).trim() && !isPlaceholder(r[c.id])).length, 0) / (rows.length * cols.length || 1) : 1;
    const score = (q.min_rows ? ramp(rows.length, q.min_rows) : 1) * (cells < 1 ? floor + (1 - floor) * cells : 1);
    const detail = [q.min_rows && rows.length < q.min_rows ? `${rows.length} of about ${q.min_rows} expected rows` : '', cells < 1 ? 'required cells left blank' : ''].filter(Boolean).join('; ');
    return build(score, score >= 0.999 ? 'complete' : 'partial', detail ? detail[0].toUpperCase() + detail.slice(1).toLowerCase() + '.' : '', true);
  }
  if (['list', 'multiselect'].includes(f.type)) {
    const n = asList(value).filter(x => text(x).trim()).length;
    if (q.min_items && n < q.min_items) return build(ramp(n, q.min_items), 'partial', `${n} of about ${q.min_items} expected entries.`, true);
  } else if (q.min_words && words(value) < q.min_words) {
    return build(ramp(words(value), q.min_words), 'partial', `${words(value)} words — expected around ${q.min_words}${['markdown', 'textarea'].includes(f.type) ? ' to be auditable' : ''}.`, true);
  }
  return build(1, 'complete', '', true);
}

function runChecks(fw, values) {
  const value = (s, f) => values[s]?.[f];
  const columnValues = (s, f, c) => tableRows(value(s, f)).map(r => text(r[c]).trim()).filter(Boolean);
  return fw.checks.flatMap(c => {
    const p = c.params, rows = tableRows(value(c.section, p.field));
    let detail = '';
    if (c.rule === 'table_column_filled') {
      const missing = rows.flatMap((r, i) => !text(r[p.column]).trim() || isPlaceholder(r[p.column]) ? [i + 1] : []);
      if (missing.length) detail = `${missing.length} of ${rows.length} rows incomplete — row ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ` (+${missing.length - 6} more)` : ''}.`;
    } else if (c.rule === 'min_rows') {
      if (rows.length < (p.min ?? 1)) detail = `${rows.length} row(s) present, at least ${p.min ?? 1} expected.`;
    } else if (c.rule === 'field_present') {
      const field = fw.sections.find(s => s.id === c.section)?.fields.find(f => f.id === p.field);
      if (field && (empty(field, value(c.section, p.field)) || isPlaceholder(value(c.section, p.field)))) detail = 'No value recorded.';
    } else if (c.rule === 'field_not_value') {
      const v = value(c.section, p.field);
      if (v != null && text(v).trim() && normalise(v) === normalise(p.value)) detail = `Currently set to “${v}”.`;
    } else if (['values_subset_of', 'values_cover'].includes(c.rule)) {
      const used = columnValues(c.section, p.field, p.column), ref = columnValues(p.against_section, p.against_field, p.against_column);
      const cover = c.rule === 'values_cover', set = new Set((cover ? used : ref).map(normalise));
      const missing = [...new Set((cover ? ref : used).filter(x => !set.has(normalise(x))))].sort();
      if (ref.length && (cover || used.length) && missing.length) detail = `${cover ? 'Missing' : 'Not recognised'}: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`;
    } else return [{ id: c.id, severity: 'info', message: `Check rule '${c.rule}' is not implemented and was skipped.`, section: c.section, section_title: '', field: '', detail: '', fix: '', source: 'check' }];
    return detail ? [{ id: c.id, severity: c.severity, message: c.message, section: c.section, section_title: fw.sections.find(s => s.id === c.section)?.title || '', field: p.field || '', detail, fix: c.fix, source: 'check' }] : [];
  });
}

export function evaluate(fw, values = {}, stage = 'delivery', settings = {}) {
  const source = sectionsFor(fw, stage), totalWeight = source.reduce((n, s) => n + s.weight, 0) || 1;
  const sections = source.map(s => {
    const fields = fieldsFor(s, stage).map(f => scoreField(s.id, f, values[s.id]?.[f.id], settings));
    const weight = fields.reduce((n, f) => n + f.weight, 0) || 1;
    const score = 100 * fields.reduce((n, f) => n + f.score * f.weight, 0) / weight;
    const required = fields.filter(f => f.required);
    return { id: s.id, title: s.title, icon: s.icon, weight: s.weight, score, coverage: 100 * fields.filter(f => f.filled).length / (fields.length || 1), state: score >= 85 ? 'complete' : score >= 45 ? 'progress' : score > 0 ? 'started' : 'empty', required_total: required.length, required_complete: required.filter(f => f.score >= .999).length, fields };
  });
  const score = sections.reduce((n, s) => n + s.score * s.weight, 0) / totalWeight;
  const fields = sections.flatMap(s => s.fields), required = fields.filter(f => f.required), filled = fields.filter(f => f.filled).length;
  const coverage = 100 * filled / (fields.length || 1), requiredCoverage = required.length ? 100 * required.filter(f => f.score >= .999).length / required.length : 100;
  const issues = runChecks(fw, values);
  for (const s of sections) for (const f of s.fields) if (f.required && f.score < .999) issues.push({ id: `required:${f.path}`, severity: f.filled ? 'minor' : 'blocker', message: `Required field “${f.label}” is ${f.filled ? 'only partly' : 'not'} answered.`, section: s.id, section_title: s.title, field: f.field, detail: f.detail, fix: '', source: 'field' });
  issues.sort((a, b) => (severityOrder[a.severity] - severityOrder[b.severity]) || cmp(a.section, b.section) || cmp(a.id, b.id));
  const recommendations = sections.flatMap(s => {
    const weight = s.fields.reduce((n, f) => n + f.weight, 0) || 1;
    return s.fields.filter(f => f.score < .999).map(f => ({ path: f.path, section: s.id, section_title: s.title, label: f.label, detail: f.detail || 'Not answered.', points: (1 - f.score) * f.weight / weight * s.weight / totalWeight * 100 }));
  }).sort((a, b) => b.points - a.points).slice(0, 8);
  const bands = [...fw.maturity_bands].sort((a, b) => a.min - b.min);
  let level = 0;
  bands.forEach((b, i) => { if (score >= b.min) level = i; });
  const band = bands[level], next = bands[level + 1];
  const counts = { blocker: 0, major: 0, minor: 0, info: 0 };
  issues.forEach(i => counts[i.severity] = (counts[i.severity] || 0) + 1);
  return { framework: { id: fw.id, name: fw.name }, stage, score: round(score), coverage: round(coverage), required_coverage: round(requiredCoverage), fields: { total: fields.length, filled }, sections: sections.map(s => ({ ...s, score: round(s.score), coverage: round(s.coverage), fields: s.fields.map(f => ({ ...f, score: round(f.score, 4) })) })), issues, issue_counts: counts, recommendations: recommendations.map(r => ({ ...r, points: round(r.points, 2) })), ready_to_issue: !counts.blocker && score >= (settings.ready_score ?? 65) && requiredCoverage >= (settings.ready_required_coverage ?? 90), maturity: { level, label: band.label, note: band.note, next: next ? { label: next.label, min: next.min, gap: round(next.min - score), note: next.note } : null }, generated_at: new Date().toISOString() };
}
