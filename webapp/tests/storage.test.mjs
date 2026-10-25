import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { newProject, saveProject, getProject, listProjects, deleteProject, validateImport, coerce, saveModel, getModel, deleteModel } from '../src/storage.js';
const data = JSON.parse(await readFile(new URL('../src/generated.json', import.meta.url)));
test('IndexedDB retains answers after retrieval and detects stale-tab writes', async () => {
  const p = await newProject({...data.demo.project, name:'Persistence test'}, data.demo.values);
  const stale = await getProject(p.slug);
  p.values.project_information.project_name = 'Updated name'; await saveProject(p);
  assert.equal((await getProject(p.slug)).values.project_information.project_name, 'Updated name');
  await assert.rejects(saveProject(stale), /another tab/);
  assert.equal((await getProject(p.slug)).values.project_information.project_name, 'Updated name');
  await deleteProject(p.slug); assert.equal(await getProject(p.slug),undefined);
});
test('duplicate names create separate portable plans', async () => {
  const a = await newProject({...data.demo.project,name:'Duplicate test'}), b = await newProject({...data.demo.project,name:'Duplicate test'});
  assert.notEqual(a.slug,b.slug); assert.ok((await listProjects()).some(p=>p.slug===b.slug));
  await deleteProject(a.slug); await deleteProject(b.slug);
  await assert.rejects(newProject({name:'   '}), /required/);
});
test('model buffers persist independently from plan answers', async () => {
  await saveModel('model-test',{filename:'test.ifc',buffer:new Uint8Array([1,2,3]).buffer});
  assert.deepEqual([...new Uint8Array((await getModel('model-test')).buffer)],[1,2,3]);
  await deleteModel('model-test'); assert.equal(await getModel('model-test'),undefined);
});
test('imports validate before creating anything and preserve Python interchange', () => {
  const out=validateImport(data.demo,data.frameworks); assert.equal(out.meta.framework,'iso19650'); assert.equal(out.skipped.length,0);
  assert.throws(()=>validateImport({...data.demo,project:{...data.demo.project,stage:'invalid'}},data.frameworks),/stage/);
  assert.throws(()=>validateImport({...data.demo,values:[]},data.frameworks),/object/);
  assert.throws(()=>validateImport({project:data.demo.project,values:{}},data.frameworks),/bep_format/);
  const invalid=structuredClone(data.demo);invalid.values.information_requirements.loin='broken';
  assert.throws(()=>validateImport(invalid,data.frameworks),/expected a table/);
});
test('coercion keeps false and zero and rejects non-finite numbers',()=>{
  assert.equal(coerce({type:'boolean'},false),false);assert.equal(coerce({type:'number'},0),0);
  assert.throws(()=>coerce({type:'number',label:'Tolerance'},'Infinity'),/finite/);
});
