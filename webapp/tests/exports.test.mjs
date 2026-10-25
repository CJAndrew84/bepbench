import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { buildIDS, documentHTML, markdown, payload, wordDocument } from '../src/exports.js';
import { evaluate } from '../src/scoring.js';
const data = JSON.parse(await readFile(new URL('../src/generated.json', import.meta.url)));
const project = { ...data.demo.project, values: data.demo.values, snapshots: [], revision: 1 }, fw = data.frameworks.find(f => f.id === project.framework), report = evaluate(fw, project.values, project.stage, data.defaults.scoring);
test('portable export uses Python import format and excludes local history', () => {
  const out = payload(project, report); assert.equal(out.bep_format, 1); assert.equal(out.project.framework, 'iso19650'); assert.deepEqual(out.values, project.values); assert.equal(out.project.snapshots, undefined);
});
test('HTML escapes stored text and table cells', () => {
  const p = structuredClone(project); p.name = '<img src=x onerror=alert(1)>'; p.values.project_information.project_description = '<script>alert(1)</script>';
  const html = documentHTML(p, fw, report); assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img')); assert.ok(html.includes('&lt;script&gt;'));
});
test('markdown preserves native tables and all active sections', () => { const md = markdown(project, fw, report); assert.ok(md.includes('| P01 |')); for (const section of fw.sections) assert.ok(md.includes(`## ${section.title}`)); });
test('IDS restricts classes to the selected schema and reports inference/skips', () => {
  const p = structuredClone(project); p.values.information_requirements.loin = [
    {element:'Doors',ifc_class:'IfcDoor',stage:'3',alphanumeric:'Pset_DoorCommon.FireRating'},
    {element:'Road',ifc_class:'IfcCourse',stage:'3'},
    {element:'Wall',stage:'3'},
    {element:'Unknown',ifc_class:'IfcInvented',stage:'3'},
    {element:'Column',ifc_class:'IfcColumn',stage:'4'}];
  const result = buildIDS(p, fw, data.defaults, data.schemas, { versions:['IFC4'], milestone:'3' });
  assert.equal(result.specifications, 2); assert.equal(result.skipped.length, 2); assert.equal(result.inferred.length, 1); assert.ok(result.xml.includes('Pset_DoorCommon')); assert.ok(!result.xml.includes('IFCCOURSE')); assert.ok(!result.xml.includes('IFCCOLUMN'));
});
test('empty or unmapped IDS never exports a success', () => {
  const p = structuredClone(project); p.values.information_requirements.loin = [];
  assert.throws(() => buildIDS(p,fw,data.defaults,data.schemas), /No applicable/);
  assert.throws(() => buildIDS(p,{id:'lite'},data.defaults,data.schemas), /no IDS mapping/);
});
test('Word and IDS artifacts are generated for independent format validation', async () => {
  const out = new URL('../../../bepbench-validation/', import.meta.url); await mkdir(out, {recursive:true});
  const word = await wordDocument(project,fw,report); assert.ok(word.size > 10000); await writeFile(new URL('sample.docx',out),new Uint8Array(await word.arrayBuffer()));
  await writeFile(new URL('sample.ids',out),buildIDS(project,fw,data.defaults,data.schemas).xml);
});
