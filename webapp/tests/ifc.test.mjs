import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { IfcAPI } from 'web-ifc';
import { elementProperties } from '../src/ifc-properties.js';
test('real IFC parsing retains both instance and type property sets', async () => {
  const api = new IfcAPI(); await api.Init();
  const model = api.OpenModel(new Uint8Array(await readFile(new URL('../../docs/demo/Duplex_A.ifc',import.meta.url))));
  try {
    assert.equal(api.GetModelSchema(model), 'IFC2X3');
    const out = await elementProperties(api,model,8066);
    assert.equal(out.attributes.GlobalId,'1hOSvn6df7F8_7GcBWlS8Z');
    assert.ok(out.properties.some(ps => ps.name === 'Pset_DoorCommon'));
    assert.ok(out.properties.some(ps => ps.name.startsWith('PSet_Revit_Type')));
    assert.ok(out.properties.length >= 11);
  } finally { api.CloseModel(model); }
});
