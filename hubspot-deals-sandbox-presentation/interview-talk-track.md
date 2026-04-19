# HubSpot CRM Sandbox Interview Talk Track

Use the deck as visual support, not as text to read. The story is:

> I built a small CRM sandbox that talks to real HubSpot data, shows the real CRM object model, and proves that the UI can be extended with modules/plugins without turning the app into a framework-heavy project.

## 30-second opening

Say this before slide 1:

> This is not a static UI mockup. It is an ASP.NET Minimal API app with a browser ES-module frontend. It reads and writes real HubSpot sandbox records: deals, contacts, companies, pipelines, stages, company industries, and associations. I kept it intentionally small: no React, no bundler, no npm. The point is to show CRM integration thinking, not just UI screens.

Then point to the first slide and say:

> The most important parts are live HubSpot metadata, the association model, runtime plugin panels, CSV round-trip, and centralized field-level API errors.

## Recommended interview flow

Do not go slide by slide like a school presentation. Use this order:

1. Slides 1-2: explain the product story and CRM workflow.
2. Switch to the live app for 2-3 minutes.
3. Slides 3-7: explain the technical proof behind what they just saw.
4. Slide 8: close with what the project proves.
5. Slide 9: only open if they ask about exact HubSpot endpoints.

## Slide-by-slide script

### Slide 1 - Live CRM sandbox

Goal: establish credibility quickly.

Say:

> The key point is that the app is using live HubSpot data. If I create a contact here, it is written to HubSpot. If HubSpot rejects a field, the UI shows the field error. Dropdowns are not hardcoded: pipeline stages and controlled options come from HubSpot metadata.

Do not over-explain the plugin system yet. Just mention it exists.

### Slide 2 - Real CRM journey

Goal: show you understand CRM workflow, not only CRUD.

Say:

> I structured the workflow the same way a real CRM user works. First create company and contact master data, then create a deal, then associate records. This matters because in HubSpot a deal does not contain the contact inside it. The relationship is a separate association.

If they are non-technical, stop here and switch to live demo.

### Live demo sequence

Keep it short. Do not click everything.

1. Open Deals.
2. Show pipeline/stage dropdown and say it comes from HubSpot metadata.
3. Open row menu and show Edit/Delete/Associate.
4. Open Associate modal and explain deal-contact/company association.
5. Open Contacts and intentionally trigger duplicate email if safe, or show the validation screenshot if not.
6. Open Settings and show the Audit plugin in the unified module list.
7. Open Audit only if time allows.

Live demo sentence:

> I am not trying to demo every button. I want to show the integration points: metadata, records, associations, validation, and plugin loading.

### Slide 3 - Deals

Goal: explain technical ownership.

Say:

> The deal module owns its own UI and backend endpoints. It uses shared utilities for table rendering, action menus, state, API fetch, and validation. That means adding another entity should not require editing the static shell.

Mention:

> This is why I avoided React or a bundler here: the assignment was about modular browser ES modules.

### Slide 4 - Associations

Goal: show HubSpot-specific knowledge.

Say:

> This slide is important for HubSpot. Associations are separate API calls. The UI hides the IDs from the user, but the backend still performs the correct HubSpot association request. That is the difference between a toy CRM form and a real HubSpot integration.

If asked:

> For this sandbox I used the known association type IDs for deal-to-contact and deal-to-company. In production I would usually centralize or discover association metadata depending on the HubSpot account setup.

### Slide 5 - CSV

Goal: show integration workflow maturity.

Say:

> CSV is not just export. The useful workflow is template, edit, preview validation, then apply. I do not want a user to upload a spreadsheet and discover errors after half the rows already wrote to HubSpot.

Mention:

> This is the same idea I used for API errors: validate early and show actionable feedback.

### Slide 6 - Plugins

Goal: explain the plugin architecture honestly.

Say:

> The app has built-in modules and uploaded plugins in one Settings list. The UI module can appear immediately after ZIP upload. Backend plugin actions go through a host dispatcher, because ASP.NET Minimal API route registration is not something you casually mutate at runtime without designing for it.

This is the mature answer if they ask about runtime routes:

> Static built-in modules can register normal Minimal API routes at startup. Runtime plugins should use a dispatcher or proxy endpoint unless you want to move into dynamic assembly and application-part complexity. I chose the dispatcher because it is appropriate for a sandbox and keeps the architecture explainable.

### Slide 7 - Validation UX

Goal: show user empathy and engineering discipline.

Say:

> The user should not see only 'Failed to create contact'. The API wrapper parses HubSpot responses once, emits a structured error, and the shared UI helper maps it to the active form. That gives a summary plus invalid field styling and inline hints.

This is a strong point. Pause here if they care about frontend quality.

### Slide 8 - What this proves

Goal: close confidently.

Say:

> The value of this project is not that it has a pretty table. It proves I understand live CRM data, HubSpot's association model, safe import workflows, runtime extensibility tradeoffs, and user-facing validation. The implementation is small enough to explain and extend.

Then stop. Do not continue to API Reference unless asked.

### Slide 9 - Appendix API Reference

Only use if they ask:

> Which HubSpot endpoints did you call?
> How did authentication work?
> Is the frontend calling HubSpot directly?

Say:

> The frontend never calls HubSpot directly. It calls the local sandbox API. The backend uses the private app token from the environment and calls HubSpot through a service wrapper.

## Questions they may ask

### Why no React?

> The constraint was native browser ES modules with no bundler. I treated that as an architecture requirement and built small module descriptors instead of adding a framework.

### Can a plugin add new backend routes without restart?

> Not as normal Minimal API routes in the simple model. Minimal API endpoints are registered at startup. For runtime plugins, I use a host dispatcher/proxy pattern. That lets plugin logic run without pretending the route table is dynamically rebuilt.

### Is this production-ready?

> It is a sandbox, not production CRM middleware. The production next steps would be OAuth, persistent storage for import history, stronger audit logging, pagination/search hardening, retry/rate-limit handling, and stricter plugin security boundaries.

### Why is the API token in an environment variable?

> For a local sandbox it is the simplest safe boundary: no token in source code, no token in the browser. A production app would use OAuth or a managed secret store.

### What is the hardest part?

> The hardest part is not CRUD. It is keeping HubSpot metadata, associations, validation, and user workflow aligned so the app behaves like a CRM tool instead of a set of disconnected forms.

### What would you improve next?

> I would add a persistent import/audit history, plugin permission metadata, rate-limit handling, and a cleaner packaged plugin SDK. I would keep the same module descriptor idea because it is simple and explainable.

## Short version if time is limited

Use only slides 1, 2, 4, 6, 7, 8.

Script:

> This sandbox uses live HubSpot data, not mock data. It follows the real CRM workflow: create company/contact, create deal, then associate records. The association step is important because HubSpot relationships are separate API records. I also added runtime plugin panels through ZIP upload, but backend actions use a dispatcher because normal Minimal API routes are startup-registered. Finally, API errors are centralized and mapped to fields so users know exactly what to fix. The project proves CRM integration thinking, not just frontend table rendering.

## What not to do

- Do not read every bullet.
- Do not open the API Reference unless asked.
- Do not spend more than 3 minutes in live demo before explaining architecture.
- Do not claim runtime plugins add arbitrary Minimal API routes directly.
- Do not present CSV as just "download/upload"; present it as safe preview-before-write workflow.

