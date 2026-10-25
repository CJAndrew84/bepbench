# Fork review — 25 October 2026

Reviewed upstream snapshot `01ca8a49e1f46690052c65e827aff5a5eed1ce29`.
This is a source review and automated validation, not a penetration test or standards
certification. No real project data was used.

## Assessment

The project is a useful starting point for structured BEP authoring. The declarative
YAML frameworks and separate service layer are strong choices. Coverage, mandatory
completion and weighted depth answer different questions; the application keeps them
distinct. Cross-field checks, stage-aware fields, interchange JSON and IDS export are
particularly useful for information-management workflows.

The existing Python suite passes 167 tests with IFC, IDS and Word extras installed.
Its execution does not require a running model server. The example is deliberately
incomplete and should remain labelled as an example.

## Findings

| Priority | Finding and evidence | Effect / handling |
|---|---|---|
| Deployment blocker | `bepkit/app.py`, `config.py`, `services/models.py`, Dockerfile: Flask, SQLite and persistent filesystem plus native IFC processing | Direct deployment as a Netlify static site would not work. A separate browser edition is provided; the native app remains usable on a container host. |
| High for a shared internet service | `web/auth.py`: no authentication unless both credentials are configured; `services/projects.py:list_projects/get_project`: every caller uses the same project store | Do not expose the native service with real project data without access controls. The new browser edition has no remotely accessible project database. It is not a multi-user service. |
| Medium for native hosting | `web/views.py` mutating form routes have no CSRF token or origin enforcement | A separately hosted native instance needs CSRF protection, particularly with browser-cached Basic authentication. This browser port does not expose those server endpoints. |
| Medium | `web/views.py:set_language` redirects to the unvalidated `next`/referrer URL | The native language-switch route can redirect to an external site. Not exposed by the static edition. |
| Medium | `scoring/engine.py:evaluate` filters fields/sections by stage but calls `run_checks(framework, values)` without stage filtering | Cross-field checks can still raise issues involving delivery-only data in pre-appointment mode. Both editions intentionally retain the current engine's semantics; scope check applicability in a follow-up change with dedicated regressions. |
| Medium | `services/projects.py:import_dict` creates and commits a project before validating the entire import; malformed nested values can then fail | A bad import may leave a partial native project. Browser imports validate structure and coerce all recognised fields before storing the new plan. |
| Medium for native hosting | `web/views.py:import_project` reads the complete uploaded JSON and no global request-body limit is configured | Native JSON uploads need a request-size limit. Browser plan imports are limited to 10 MB. Native IFC streaming already enforces its configured size limit. |
| Operational | Device-only browser storage can be cleared and is separate for every origin/profile/device | Dashboard and About page explain storage and regular JSON backups; save errors are visible. JSON does not include models or snapshot history. |
| Assessment limitation | `scoring/rules.py` measures presence/depth and a finite set of declared consistency rules | Well-written but incorrect prose may still score highly. The new UI and exports state that the score is not certification or approval. |

## Scope of the Netlify change

The browser edition shares the original framework definitions and uses a JavaScript
implementation of the scoring rules, verified against complete Python reports. Plans
and model files are processed and stored on the device. IFC runs in a Web Worker;
the server-side AI and full ifctester model validator are not presented as available.

The original Python source is not modified by this change. Its internet-hosting
findings above still apply if it is deployed separately. A future shared enterprise
edition would need identity, project-level permissions, versioned server storage,
auditing and an approved location for model/AI processing.
