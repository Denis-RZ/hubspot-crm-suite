# Technical FAQ — CRM Sandbox

Short answers for technical questions. Say these in your own words — do not recite.

---

## Plugin architecture

**Q: How does plugin loading work?**

> You upload a ZIP. The server extracts a DLL and a JS file, registers the DLL as a plugin assembly, and saves the JS to a known folder. On the next page load the frontend dynamically imports that JS file as an ES module. The module exposes the same descriptor interface as built-in modules — id, label, renderNav, renderPanel, mount — so the sidebar picks it up automatically.

**Q: Can a plugin add new backend API routes without restarting the server?**

> Not as normal Minimal API routes. ASP.NET registers routes at startup — you cannot add them at runtime without getting into dynamic assembly and application-part complexity. I used a host dispatcher instead: the plugin registers its action handlers with the host, and one fixed route `/api/plugin/{id}/{action}` forwards calls to the right handler. This keeps the architecture simple and explainable.

**Q: Why a dispatcher and not a full dynamic route approach?**

> For a sandbox, the dispatcher is the right tradeoff. Dynamic route registration in Minimal API is possible but requires rebuilding the request pipeline, which adds complexity that is hard to explain and test. The dispatcher pattern is transparent — you can see exactly what it does.

---

## Associations

**Q: How do you create an association between a deal and a contact?**

> `LocalCrmStore` writes a link record in both directions at once — deal→contact and contact→deal — into one associations list. It's a plain foreign-key-style reference, not a field on the deal object, so a deal can have any number of linked contacts or companies without the deal record itself changing shape.

**Q: Why store it as a separate link instead of a field on the deal?**

> Because relationships are many-to-many and change independently of the record itself. Embedding an id on the deal would only support one link and would tangle deletion logic. A separate association store keeps each object simple and lets either side query "what's linked to me" directly.

---

## Data and validation

**Q: Where is the data stored?**

> Everything lives in one class, `LocalCrmStore`. It keeps deals, contacts, companies, and their associations in memory for speed, and writes the whole snapshot to `App_Data/crm-store.json` after every change. On startup it loads that file back in, or seeds fresh demo data if the file doesn't exist yet. No external database, no external account.

**Q: How do you handle write errors?**

> One central helper, `ApiEndpointHelpers.ExecuteAsync`, wraps every endpoint and converts thrown exceptions — mostly `ArgumentException` for validation failures — into a structured `400` response with a message. The shared frontend UI helper receives that object and renders a form summary, marks invalid fields with red styling, and adds inline hints. Every module uses the same helper — no duplicated error-handling code per module.

**Q: How does pipeline and stage validation work?**

> The pipeline/stage list is built-in metadata returned by `GET /api/pipelines`. When the user selects a pipeline, the frontend re-renders the stage dropdown with only the stages that belong to it. If a stage doesn't belong to the chosen pipeline, the UI simply doesn't offer it — the same discipline a live external validation would enforce, just backed by code I own instead of a remote call.

---

## Architecture

**Q: Why no React, no bundler?**

> The requirement was native browser ES modules with no build step. I treated that as an architectural constraint and built small module descriptors instead of adding a framework. Each module exposes the same interface — renderNav, renderPanel, mount — and the registry loads them dynamically. It is more verbose than React but every line is visible and explainable.

**Q: Is this microservices?**

> No, it is a modular monolith. One ASP.NET process, one deployment. Each domain — deals, contacts, companies, defects — owns its own endpoints and service class and does not reach into other modules. The module boundary is clean enough that each domain could be extracted into a separate service without rewriting the business logic.

**Q: How would you scale this to microservices if needed?**

> Each module already has a clear boundary. To split it I would add an API gateway, give each module its own deployment and its own datastore, and replace direct method calls with HTTP or a message bus for cross-domain events. Because `LocalCrmStore` is already isolated behind the module contract, swapping it for per-module storage wouldn't touch the module code itself.

**Q: How does the Defects (QA) module fit in?**

> It's a completely different domain — manufacturing quality tracking, not sales — built on the exact same `ICrmSandboxModule` contract, with its own in-memory/file store. It proves the module system isn't CRM-specific. It can also optionally link a defect to a Company record, which shows modules can stand alone or cross-reference each other.

---

## Security and production

**Q: How is authentication handled?**

> There's nothing to authenticate against right now — no external account, no token, no secret anywhere in the request path. That's a deliberate simplification for a portfolio demo. For a real deployment I'd add user authentication in front of the app itself (not an external CRM token).

**Q: Is this production-ready?**

> It's a well-architected demo, not a production CRM. Production next steps: swap `LocalCrmStore` for a real database, add concurrency control (right now writes are serialized with a simple lock), add user authentication, and add persistent audit history. The module boundaries mean none of that touches the module code itself.

**Q: What is the hardest part of this project?**

> Not the CRUD. The hardest part was keeping the association model, validation, and CSV round-trip aligned so the app behaves like a real CRM tool instead of a set of disconnected forms — and doing that without a platform underneath doing the hard part for me.

---

## Short version if time is limited

> Every record — deals, contacts, companies, defects — lives in a data layer I designed and wrote myself, persisted to one JSON file. No external account, no mocks in the sense of "fake demo data that goes nowhere" — creating a record here really writes it and it survives a restart. Plugins load via ZIP upload and the frontend imports them as ES modules at runtime. Backend plugin actions use a dispatcher because Minimal API routes are registered at startup. Associations are bidirectional links, not fields on the record. Errors are parsed once and mapped to fields so the user sees exactly what to fix.

---

## What NOT to say

- Do not say "Claude and ChatGPT built it" — say "I used AI tools to accelerate development"
- Do not say "it supports microservices" — say "it is a modular monolith ready to be split"
- Do not say "plugins add new routes at runtime" — say "plugins use a dispatcher pattern"
- Do not say this talks to HubSpot or any external CRM — it does not, by design
- Do not over-explain. Short confident answers invite follow-up. Long nervous answers raise doubts.
