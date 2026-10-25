import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluate } from '../src/scoring.js';
const data = JSON.parse(await readFile(new URL('../src/generated.json', import.meta.url)));
const cases = JSON.parse(await readFile(new URL('./reference.json', import.meta.url)));
function compare(actual, expected, path = '') {
  if (typeof expected === 'number') return assert.ok(Math.abs(actual - expected) <= .00011, `${path}: ${actual} != ${expected}`);
  if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), path);
    for (const key of Object.keys(expected)) compare(actual[key], expected[key], `${path}.${key}`);
  } else assert.equal(actual, expected, path);
}
for (const c of cases) test(`Python scoring parity: ${c.name}`, () => {
  const actual = evaluate(data.frameworks.find(f => f.id === c.framework), c.values, c.stage, data.defaults.scoring);
  delete actual.generated_at;
  compare(actual, c.expected);
});
