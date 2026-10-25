import { createStore, get, set, update, keys, del } from 'idb-keyval';
import { text } from './scoring.js';
const store = createStore('bepbench-web-v1', 'plans');
export const clone = v => structuredClone(v);
const stamp = () => new Date().toISOString();
export async function listProjects() {
  const ids = (await keys(store)).filter(k => typeof k === 'string' && k.startsWith('plan:'));
  return (await Promise.all(ids.map(k => get(k, store)))).filter(Boolean).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
export function getProject(id) { return get(`plan:${id}`, store); }
export async function saveProject(project) {
  const next = clone({ ...project, updated_at: stamp(), revision: (project.revision || 0) + 1 });
  await update(`plan:${project.slug}`, current => {
    if (current && current.revision !== project.revision) throw new Error('This plan changed in another tab. Reload before editing to avoid overwriting it.');
    return next;
  }, store);
  Object.assign(project, { updated_at: next.updated_at, revision: next.revision });
  return project;
}
export async function deleteProject(id) { await del(`plan:${id}`, store); }
export const slugify = name => text(name).normalize('NFKD').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-') || 'bep';
export function coerce(field, raw) {
  if (raw == null) return null;
  if (field.type === 'boolean') return typeof raw === 'boolean' ? raw : ['1', 'true', 'yes', 'y', 'on'].includes(text(raw).trim().toLowerCase());
  if (field.type === 'number') {
    if (!text(raw).trim()) return null;
    const n = Number(raw); if (!Number.isFinite(n)) throw new Error(`${field.label}: enter a finite number.`); return n;
  }
  if (field.type === 'table') {
    if (!Array.isArray(raw) || raw.length > 10000) throw new Error(`${field.label}: expected a table with at most 10,000 rows.`);
    return raw.map(r => {
      if (!r || Array.isArray(r) || typeof r !== 'object') throw new Error(`${field.label}: each row must be an object.`);
      return Object.fromEntries(field.columns.map(c => [c.id, text(r[c.id]).trim()]));
    }).filter(r => Object.values(r).some(Boolean));
  }
  if (['list', 'multiselect'].includes(field.type)) {
    let items = (Array.isArray(raw) ? raw : text(raw).split(',')).map(x => text(x).trim()).filter(Boolean);
    if (field.type === 'multiselect') items = items.map(x => { const o = field.options.find(o => o.toLowerCase() === x.toLowerCase()); if (!o) throw new Error(`${field.label}: unknown option ${x}.`); return o; });
    return items;
  }
  if (field.type === 'select' && text(raw).trim()) {
    const o = field.options.find(o => o.toLowerCase() === text(raw).trim().toLowerCase());
    if (!o) throw new Error(`${field.label}: unknown option.`); return o;
  }
  return text(raw);
}
export function validateImport(payload, frameworks) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.bep_format !== 1) throw new Error('Choose a BEP Bench JSON export (bep_format: 1).');
  const meta = payload.project;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('The export has no project details.');
  const fw = frameworks.find(f => f.id === meta.framework);
  if (!fw) throw new Error('This export uses a framework that is not installed.');
  const stage = meta.stage || 'delivery';
  if (!['delivery', 'pre_appointment'].includes(stage)) throw new Error('The appointment stage is invalid.');
  const raw = payload.values ?? {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('The export values must be an object.');
  const values = {}, skipped = [];
  for (const [sid, fields] of Object.entries(raw)) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error(`Invalid answers in ${sid}.`);
    for (const [fid, value] of Object.entries(fields)) {
      const section = fw.sections.find(s => s.id === sid), field = section?.fields.find(f => f.id === fid);
      if (!field) { skipped.push(`${sid}.${fid}`); continue; }
      values[sid] ??= {}; values[sid][fid] = coerce(field, value);
    }
  }
  return { meta: { name: text(meta.name).trim() || 'Imported BEP', client: text(meta.client), reference: text(meta.reference), owner: text(meta.owner), framework: fw.id, stage, notes: text(meta.notes), status: text(meta.status) || 'draft' }, values, skipped };
}
export async function newProject(meta, values = {}) {
  if (!text(meta.name).trim()) throw new Error('Project name is required.');
  const base = slugify(meta.name); let slug = base, i = 2;
  while (await getProject(slug)) slug = `${base}-${i++}`;
  const project = { ...meta, slug, values: clone(values), snapshots: [], created_at: stamp(), updated_at: stamp(), revision: 0 };
  await saveProject(project); return project;
}
export const saveModel = (slug, model) => set(`model:${slug}`, model, store);
export const getModel = slug => get(`model:${slug}`, store);
export const deleteModel = slug => del(`model:${slug}`, store);
