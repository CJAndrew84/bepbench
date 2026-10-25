import { sectionsFor, fieldsFor, text, tableRows } from './scoring.js';
export const escape = v => text(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function payload(project, report) {
  const { values, snapshots, revision, ...meta } = project;
  return { bep_format: 1, project: meta, values, score: report };
}
export function download(body, filename, type = 'application/octet-stream') {
  const url = URL.createObjectURL(body instanceof Blob ? body : new Blob([body], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function markdown(project, fw, report) {
  const out = [`# ${project.name}`, `**Framework:** ${fw.name}`, `**Reference:** ${project.reference || '—'} · **Client:** ${project.client || '—'}`, `**Appointment:** ${project.stage.replaceAll('_', ' ')} · **Score:** ${report.score}/100`, '> This score measures completeness and consistency. It does not certify compliance or approve the plan.'];
  for (const s of sectionsFor(fw, project.stage)) {
    out.push(`## ${s.title}`);
    for (const f of fieldsFor(s, project.stage)) {
      const v = project.values[s.id]?.[f.id]; out.push(`### ${f.label}`);
      if (f.type === 'table') {
        const clean = v => text(v).replaceAll('|', '\\|').replaceAll('\n', ' ');
        out.push(`| ${f.columns.map(c => c.label).join(' | ')} |`, `| ${f.columns.map(() => '---').join(' | ')} |`, ...tableRows(v).map(r => `| ${f.columns.map(c => clean(r[c.id])).join(' | ')} |`));
      } else out.push(Array.isArray(v) ? v.map(x => `- ${text(x)}`).join('\n') : v == null || v === '' ? '_Not recorded._' : text(v));
    }
  }
  return out.join('\n\n');
}
export function documentHTML(project, fw, report) {
  const e = escape;
  const sections = sectionsFor(fw, project.stage).map(s => `<section><h2>${e(s.title)}</h2>${fieldsFor(s, project.stage).map(f => {
    const v = project.values[s.id]?.[f.id];
    return `<h3>${e(f.label)}</h3>` + (f.type === 'table' ? `<table><thead><tr>${f.columns.map(c => `<th>${e(c.label)}</th>`).join('')}</tr></thead><tbody>${tableRows(v).map(r => `<tr>${f.columns.map(c => `<td>${e(r[c.id])}</td>`).join('')}</tr>`).join('')}</tbody></table>` : `<p>${e(Array.isArray(v) ? v.join(', ') : v == null || v === '' ? 'Not recorded.' : v).replaceAll('\n', '<br>')}</p>`);
  }).join('')}</section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${e(project.name)} — BEP</title><style>body{font:11pt/1.6 system-ui,sans-serif;color:#24362e;max-width:1000px;margin:45px auto;padding:0 25px}h1{font-size:30pt}h2{border-top:2px solid #b6bcb4;padding-top:20px;margin-top:40px}h3{font-size:12pt}table{border-collapse:collapse;width:100%;font-size:9pt}th,td{border:1px solid #bcc9c0;padding:7px;text-align:left;vertical-align:top;white-space:pre-wrap}th{background:#edf2ee}p{white-space:normal}tr{break-inside:avoid}@media print{body{margin:0;max-width:none}h2,h3{break-after:avoid}a{color:inherit}}</style></head><body><p>BEP BENCH · BIM EXECUTION PLAN</p><h1>${e(project.name)}</h1><p>${e(fw.name)} · ${e(project.reference)}<br>Client: ${e(project.client)} · Owner: ${e(project.owner)}<br>Appointment: ${e(project.stage.replaceAll('_', ' '))}</p><p>Completeness score ${report.score}/100 · Required coverage ${report.required_coverage}% · ${report.ready_to_issue ? 'Readiness thresholds met' : 'Further review required'}</p><p>This assessment measures completeness and consistency. It does not certify compliance or approve the plan.</p>${sections}<footer>Exported ${new Date().toLocaleDateString('en-GB')} with BEP Bench.</footer></body></html>`;
}
export async function wordDocument(project, fw, report) {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType, TableOfContents } = await import('docx');
  const para = value => new Paragraph({ children: [new TextRun(text(value))], spacing: { after: 120 } });
  const children = [new Paragraph({ text: project.name, heading: HeadingLevel.TITLE }), para(fw.name), para(`Reference: ${project.reference} | Client: ${project.client}`), para(`Owner: ${project.owner} | Appointment: ${project.stage.replaceAll('_', ' ')}`), para(`Completeness score: ${report.score}/100. This is not compliance certification or plan approval.`), new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' })];
  for (const s of sectionsFor(fw, project.stage)) {
    children.push(new Paragraph({ text: s.title, heading: HeadingLevel.HEADING_1 }));
    for (const f of fieldsFor(s, project.stage)) {
      const v = project.values[s.id]?.[f.id];
      children.push(new Paragraph({ text: f.label, heading: HeadingLevel.HEADING_2 }));
      if (f.type === 'table') {
        const row = (cells, header = false) => new TableRow({ tableHeader: header, children: cells.map(c => new TableCell({ children: text(c).split('\n').map(para), shading: header ? { fill: 'EDF2EE' } : undefined })) });
        children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [row(f.columns.map(c => c.label), true), ...tableRows(v).map(r => row(f.columns.map(c => r[c.id])))] }));
      } else children.push(...text(Array.isArray(v) ? v.join(', ') : v == null || v === '' ? 'Not recorded.' : v).split('\n').map(para));
    }
  }
  return Packer.toBlob(new Document({ creator: 'BEP Bench', title: project.name, features: { updateFields: true }, sections: [{ children }] }));
}

export function buildIDS(project, fw, defaults, schemas, options = {}) {
  const config = defaults.ids, source = config.sources[fw.id];
  if (!source) throw new Error('This framework has no IDS mapping. Use ISO 19650 or NBIMS-US.');
  const versions = options.versions || config.ifc_version;
  if (!versions.length || versions.some(v => !schemas[v])) throw new Error('Choose a supported IFC schema.');
  const col = source.columns, rows = tableRows(project.values[source.section]?.[source.field]);
  const milestone = options.milestone || '', skipped = [], inferred = [], narrowed = [], specs = [];
  const e = escape, simple = (tag, value) => `<${tag}><simpleValue>${e(value)}</simpleValue></${tag}>`;
  const classification = text(project.values[source.classification.section]?.[source.classification.field]).split(new RegExp(config.classification_split))[0].trim().slice(0, config.classification_max_length);
  rows.forEach((r, i) => {
    const element = text(r[col.element]).trim(), stage = text(r[col.stage]).trim();
    if (!element || (milestone && stage.toLowerCase() !== milestone.toLowerCase())) return;
    let cls = text(r[col.ifc_class]).trim(); const declared = cls;
    if (!cls) {
      const needle = element.toLowerCase().replace(/[^a-z0-9 ]/g, ' '), words = new Set(needle.split(/\s+/));
      cls = Object.entries(config.class_hints).filter(([hint]) => hint.includes(' ') ? needle.includes(hint) : words.has(hint)).sort((a, b) => b[0].length - a[0].length)[0]?.[1];
    }
    if (!cls) { skipped.push({ row: i + 1, element, reason: 'No IFC class declared or inferred.' }); return; }
    const targets = versions.filter(v => schemas[v].includes(cls));
    if (!targets.length) { skipped.push({ row: i + 1, element, reason: `${cls} is not defined in ${versions.join(', ')}.` }); return; }
    if (!declared) inferred.push({ row: i + 1, element, reason: `Inferred as ${cls}.` });
    if (targets.length < versions.length) narrowed.push({ row: i + 1, element, reason: `${cls} exists only in ${targets.join(', ')}.` });
    const alpha = text(r[col.alphanumeric]).trim(), geometry = text(r[col.geometry]).trim(), lod = text(r[col.lod]).trim();
    const properties = alpha.split(new RegExp(config.property_split)).map(s => s.replace(/\s+/g, ' ').replace(/^[ .;:]+|[ .;:]+$/g, '')).filter(s => s.length >= 2 && s.length <= 60).map(name => {
      const parts = name.split('.'), qualified = parts.length === 2 && parts.every(s => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s));
      const base = qualified ? parts[1] : name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map(s => s[0].toUpperCase() + s.slice(1)).join('') || 'Property';
      return `<property dataType="${e(config.data_type)}" cardinality="required" instructions="${e(name)}">${simple('propertySet', qualified ? parts[0] : config.default_pset)}${simple('baseName', base)}</property>`;
    }).join('');
    const desc = [lod ? `LOD ${lod}` : '', stage ? `Stage ${stage}` : '', geometry].filter(Boolean).join(' · ');
    specs.push(`<specification name="${e(element.slice(0, 100))}" ifcVersion="${targets.join(' ')}" identifier="LOIN-${String(i + 1).padStart(3, '0')}"${desc ? ` description="${e(desc)}"` : ''}${alpha ? ` instructions="${e(alpha)}"` : ''}><applicability minOccurs="${config.min_occurs}" maxOccurs="${config.max_occurs}"><entity>${simple('name', cls.toUpperCase())}</entity></applicability><requirements>${classification ? `<classification cardinality="required">${simple('system', classification)}</classification>` : ''}${config.required_attributes.map(a => `<attribute cardinality="required">${simple('name', a)}</attribute>`).join('')}${properties}</requirements></specification>`);
  });
  if (!specs.length) throw new Error('No applicable LOIN rows could be exported. Add IFC classes and check the milestone/schema selection.');
  const owner = text(project.owner), author = owner.includes('@') ? owner : `${owner.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'information.manager'}@${config.author_domain}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd"><info><title>${e(project.name)} — Level of Information Need</title><copyright>${e(project.client)}</copyright><version>1.0</version><description>Generated from the BIM Execution Plan (${e(fw.name)}).</description><author>${e(author)}</author><date>${new Date().toISOString().slice(0, 10)}</date><purpose>${e(project.reference || 'BIM Execution Plan')}</purpose><milestone>${e(milestone || project.values.project_information?.project_stage || '')}</milestone></info><specifications>${specs.join('')}</specifications></ids>`;
  return { xml, specifications: specs.length, skipped, inferred, narrowed };
}
