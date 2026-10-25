"""Refresh scoring fixtures from the original Python engine (development only).

Run from the repo root after `pip install -e .` and `npm run generate`.
Fixtures are committed; Netlify builds do not need a Python runtime.
"""
import json
from dataclasses import asdict
from pathlib import Path
from bepkit.schema import available_frameworks, get_framework
from bepkit.scoring import evaluate
from bepkit.cli.demo_data import DEMO_VALUES

cases = []
for fw in available_frameworks():
    for stage in ('pre_appointment', 'delivery'):
        for mode in ('empty', 'placeholders', 'partial', 'complete'):
            values = {}
            for i, (section, field) in enumerate(fw.iter_fields()):
                if mode == 'empty' or (mode == 'partial' and i % 4 == 0):
                    continue
                value = 'TBD' if mode == 'placeholders' else 'Concrete commitment '
                if field.type == 'table':
                    value = [{c.id: ('TBD' if mode == 'placeholders' else '' if mode == 'partial' and j % 2 else f'Value {n}') for j, c in enumerate(field.columns)} for n in range(1 if mode == 'partial' else max(3, field.quality.min_rows))]
                elif field.type in ('list', 'multiselect'):
                    value = field.options[:1 if mode == 'partial' else len(field.options)] if field.options else ['one'] if mode == 'partial' else ['one', 'two', 'three', 'four']
                elif field.type == 'select':
                    value = field.options[0]
                elif field.type == 'boolean':
                    value = i % 2 == 0
                elif field.type == 'number':
                    value = 0 if i % 2 else 42
                elif mode == 'complete':
                    value = 'Named owner commits to delivery. ' * max(25, field.quality.min_words)
                values.setdefault(section.id, {})[field.id] = value
            r = evaluate(fw, values, stage=stage).to_dict()
            r.pop('generated_at')
            cases.append({'name': f'{fw.id}/{stage}/{mode}', 'framework': fw.id, 'stage': stage, 'values': values, 'expected': r})
values = {}
for path, value in DEMO_VALUES.items():
    s, f = path.split('.', 1)
    values.setdefault(s, {})[f] = value
for stage in ('pre_appointment', 'delivery'):
    r = evaluate(get_framework('iso19650'), values, stage=stage).to_dict()
    r.pop('generated_at')
    cases.append({'name': f'iso19650/{stage}/demo', 'framework': 'iso19650', 'stage': stage, 'values': values, 'expected': r})
Path('webapp/tests/reference.json').write_text(json.dumps(cases, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'Wrote {len(cases)} Python reference cases.')
