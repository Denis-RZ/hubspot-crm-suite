# Technical FAQ — HubSpot CRM Sandbox

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

> It is a separate PUT request to `/crm/v3/objects/deals/{dealId}/associations/contacts/{contactId}/{typeId}`. The type ID is a fixed HubSpot constant — 3 for deal-to-contact, 5 for deal-to-company. It is not a field on the deal object. Most people get this wrong the first time because they expect it to be a property they can PATCH.

**Q: Where do the association type IDs come from?**

> They are fixed constants defined by HubSpot. In production I would discover them through the association metadata API. For this sandbox I used the known values because they are stable across accounts.

---

## Data and validation

**Q: Where is the data stored?**

> There is no local database. All records live in HubSpot. The backend is a pure API proxy — it receives requests from the frontend, calls HubSpot, and returns the result. The only local state is the plugin files on disk and the module order in appsettings.

**Q: How do you handle HubSpot API errors?**

> One central parser in the API service extracts the message and field errors from the HubSpot response. It returns a structured error object. The shared UI helper on the frontend receives that object and renders a form summary, marks invalid fields with red styling, and adds inline hints. Every module uses the same helper — no duplicated error-handling code per module.

**Q: How does pipeline and stage validation work?**

> When the user selects a pipeline, the frontend fetches the stages for that pipeline from the backend, which calls `/crm/v3/pipelines/deals`. The stage dropdown is then replaced with only valid options for that pipeline. If the user somehow submits an invalid stage, HubSpot rejects it and the error is mapped back to the stage field.

---

## Architecture

**Q: Why no React, no bundler?**

> The requirement was native browser ES modules with no build step. I treated that as an architectural constraint and built small module descriptors instead of adding a framework. Each module exposes the same interface — renderNav, renderPanel, mount — and the registry loads them dynamically. It is more verbose than React but every line is visible and explainable.

**Q: Is this microservices?**

> No, it is a modular monolith. One ASP.NET process, one deployment. Each domain — deals, contacts, companies — owns its own endpoints and service class and does not reach into other modules. The module boundary is clean enough that each domain could be extracted into a separate service without rewriting the business logic.

**Q: How would you scale this to microservices if needed?**

> Each module already has a clear boundary. To split it I would add an API gateway, give each module its own deployment, and replace direct method calls with HTTP or a message bus for cross-domain events. The data model is already distributed — everything is in HubSpot, there is no shared local database to split.

---

## Security and production

**Q: How is authentication handled?**

> The frontend never calls HubSpot directly. It calls the local sandbox API. The backend holds the HubSpot private app token in an environment variable and attaches it to every outbound request as a Bearer token. No token is exposed to the browser.

**Q: Is this production-ready?**

> It is a sandbox that demonstrates integration thinking. Production next steps would be OAuth instead of a private app token, retry and rate-limit handling, persistent import history, stronger plugin security boundaries, and pagination hardening for large datasets. The architecture supports all of these additions without a rewrite.

**Q: What is the hardest part of this project?**

> Not the CRUD. The hardest part is keeping HubSpot metadata, the association model, validation, and the user workflow aligned so the app behaves like a real CRM tool instead of a set of disconnected forms. Getting associations right — separate PUT call, fixed type IDs, not a field on the deal — is where most HubSpot integrations fail first.

---

## Short version if time is limited

> The app calls real HubSpot endpoints — no mocks. Plugins load via ZIP upload and the frontend imports them as ES modules at runtime. Backend plugin actions use a dispatcher because Minimal API routes are registered at startup. Associations are separate PUT calls with fixed type IDs, not fields on the deal. Errors are parsed once and mapped to fields so the user sees exactly what to fix.

---

## What NOT to say

- Do not say "Claude and ChatGPT built it" — say "I used AI tools to accelerate development"
- Do not say "it supports microservices" — say "it is a modular monolith ready to be split"
- Do not say "plugins add new routes at runtime" — say "plugins use a dispatcher pattern"
- Do not over-explain. Short confident answers invite follow-up. Long nervous answers raise doubts.
