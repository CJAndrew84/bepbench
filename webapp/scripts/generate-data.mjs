// Framework YAML remains the source of truth for the Python and web editions.
import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import YAML from 'yaml';
const root = resolve(import.meta.dirname, '../..');
const read = path => readFile(resolve(root, path), 'utf8');
const stage = raw => !raw ? [] : Array.isArray(raw) ? raw : [raw];
const column = c => ({ type: 'text', required: false, options: [], help: '', ...c });
const field = f => ({ type: 'text', required: false, weight: 1, help: '', placeholder: '', example: '', reference: '', options: [], ...f,
  stages: stage(f.stages), columns: (f.columns || []).map(column), quality: { min_words: 0, min_rows: 0, min_items: 0, evidence: false, ...f.quality } });
const frameworks = [];
for (const file of (await readdir(resolve(root, 'bepkit/frameworks'))).filter(f => /\.ya?ml$/.test(f)).sort()) {
  const fw = YAML.parse(await read(`bepkit/frameworks/${file}`));
  frameworks.push({ ...fw, sections: fw.sections.map((s, i) => ({ order: i * 10, weight: 1, intent: '', guidance: '', reference: '', ...s, stages: stage(s.stages), fields: s.fields.map(field) })).sort((a, b) => a.order - b.order),
    checks: (fw.checks || []).map(c => { const { id, rule, message = id, severity = 'major', section = '', fix = '', ...params } = c; return { id, rule, message, severity, section, fix, params }; }) });
}
const defaults = JSON.parse(await read('bepkit/config_files/defaults.json'));
const demo = JSON.parse(await read('webapp/demo.json'));
const schemas = JSON.parse(await read('webapp/schema-entities.json'));
await writeFile(resolve(root, 'webapp/src/generated.json'), JSON.stringify({ frameworks, defaults, demo, schemas }));
await mkdir(resolve(root, 'webapp/public/wasm'), { recursive: true });
await copyFile(resolve(root, 'node_modules/web-ifc/web-ifc.wasm'), resolve(root, 'webapp/public/wasm/web-ifc.wasm'));
await copyFile(resolve(root, 'docs/demo/Duplex_A.ifc'), resolve(root, 'webapp/public/demo.ifc'));
console.log(`Prepared ${frameworks.length} frameworks and the bundled demonstration model.`);
