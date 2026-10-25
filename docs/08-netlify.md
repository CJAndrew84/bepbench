# Netlify browser edition

The original application is a Python/Flask service using SQLite, filesystem storage,
Ollama and optional native IFC libraries. Netlify cannot directly run its Gunicorn
container as a site. The `webapp/` directory provides a separate browser edition;
the Python application and CLI remain available.

## Run and build

Use Node.js 22.12 or newer (`.nvmrc` selects the Node 22 line).

```bash
npm ci
npm run generate
npm run dev
npm test
npm run build
npm run preview
```

Netlify reads `netlify.toml`: repository root, `npm run build`, publish `dist`.
No API key, server database or environment secret is required. Framework JSON is
generated at build time from `bepkit/frameworks/*.yaml`; edit those files to change
either edition. `.netlify/` is ignored because linking writes local site state there.

## Capabilities and limits

| Capability | Netlify browser edition |
|---|---|
| Frameworks | ISO 19650-2, NBIMS-US v4 and Lite, from the original YAML |
| Appointment stages | Delivery and pre-appointment; out-of-stage answers are retained |
| Scoring | Weighted field depth, placeholders, required coverage and cross-field checks |
| Persistence | IndexedDB on the current device, browser profile and site origin |
| History | Local answer/metadata snapshots, comparison to current answers, restore with recovery snapshot |
| Import/export | Python-compatible current-plan JSON, Markdown, printable HTML, native Word tables and TOC field |
| IDS export | LOIN mapping, schema dictionaries, milestone filter, inferred/skipped/narrowed-row report |
| IFC viewing | web-ifc in a worker; Three.js, orbit/pan/zoom, class/search/LOD display filters, section cut, element properties |
| IFC attachment | One locally retained IFC per plan; opening another replaces it |
| IFC limits | 200 MB input; 20,000 displayed elements; device memory may impose a lower practical limit |
| No WebGL | IFC loading, element search and property inspection remain available; 3D requires WebGL |
| Full model IDS validation | Use the Python CLI and ifctester |
| AI drafting | Use the Python app with an approved local/provider endpoint |
| Shared access, login and synchronisation | Not implemented; this edition is a personal device workspace |
| Language | English UI; existing Korean localisation remains available in the Python edition |

JSON exports contain current plan answers, metadata and the score. They do **not**
contain snapshot history or source IFC files. Export JSON regularly; retain model
source files separately. Clearing site data, changing browser/profile/device, or
using a different deployment URL does not carry the workspace over automatically.
The application explains this in the dashboard and About page. It reports save
failures and rejects stale-tab writes instead of silently overwriting a newer plan.

Scores measure completeness and consistency, not compliance, engineering correctness
or contractual approval. LOD filters only control displayed IFC classes; they do not
assess actual LOD. Some model classes are excluded from the display. Geometry is
never silently treated as an IDS pass: the full validator is explicitly unavailable
in the browser edition.

## Verification

The existing Python suite passes **167 tests** with its optional dependencies.
Browser scoring is compared recursively against **26 full Python reference reports**:
all frameworks, both appointment stages, empty/placeholder/partial/complete answers,
and the original example. Additional tests cover IndexedDB persistence, stale-write
rejection, import validation, escaping, IDS schema filtering and document generation.
Generated Word files are independently opened with python-docx; generated IDS is
validated with ifctester's IDS XSD. UI and model behaviour also need live browser checks.

Live verification on 25 October 2026 confirmed example creation, edit/save/reload,
snapshot creation, comparison and restore with an automatic recovery snapshot, and
JSON download. The bundled IFC parsed to 215 displayed elements and door properties
were inspected. The cloud test browser lacks WebGL, so interactive 3D rendering could
not be visually verified there. A real-file regression checks both instance and type
property sets, including `Pset_DoorCommon`. The browser test suite has 38 passing tests.

To refresh the reference fixtures after an intentional Python scoring change:

```bash
pip install -e .
python webapp/scripts/export-reference.py
npm test
```

`webapp/schema-entities.json` contains entity names from IfcOpenShell 0.9.0.post1 for
IFC2X3, IFC4 and IFC4X3_ADD2. Refresh it intentionally when supported schema versions
change. `webapp/demo.json` is the original `DEMO_VALUES` in portable plan format.

## Hosting

Connect the fork and select the deployment branch in Netlify. A Git-connected
deployment rebuilds on pushes to that branch. The publish directory contains static
assets only; Flask sources, tests, local data and credentials are not published.
The CSP permits same-origin assets and WebAssembly compilation for web-ifc, and
blocks external network connections from the app. Heavy IFC and Word modules are
loaded when their features are used. Dependency licence notices are served at
`/third-party-notices.txt`.

The initial site at <https://bepbench.netlify.app/> was published as a manual deploy
from the verified `dist` build. Automatic Git deployments are not connected: Netlify's
Git integration requires a separate GitHub browser sign-in. The source branch is
`codex/netlify-browser-edition-20261025`. For manual updates, upload a ZIP containing
the **contents** of `dist`; `_headers` and `_redirects` are included in that directory.
