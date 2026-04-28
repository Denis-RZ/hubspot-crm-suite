# HubSpot CRM Sandbox Interview Talk Track

This file is the speaking script. Do not read it word for word during the
interview. Use it to understand the story and keep the demo simple.

## Main Idea

По-русски:

> Я сделал небольшое приложение-песочницу, которое подключается к настоящему
> HubSpot CRM. Оно показывает сделки, контакты и компании, позволяет создавать,
> редактировать и связывать записи, загружать плагины и импортировать CSV. Это
> не макет и не мок-данные - данные реально читаются и записываются через
> HubSpot API.

What to say in English:

> I built a small CRM sandbox that talks to real HubSpot data. It is not a
> static mockup. The app reads and writes deals, contacts, companies, pipeline
> metadata, and validation errors through the HubSpot API.

Short version:

> This project proves that I understand how to integrate a frontend and backend
> with a real CRM platform, not just how to render tables.

## What Is HubSpot?

По-русски:

HubSpot - это CRM-платформа. CRM означает Customer Relationship Management.
Проще говоря, это система, где бизнес хранит клиентов и продажи:

- Companies - компании, с которыми работает бизнес.
- Contacts - люди внутри этих компаний.
- Deals - сделки, продажи или потенциальные контракты.
- Pipelines and stages - этапы продаж, например appointment, contract sent,
  closed won.

Зачем это нужно:

- sales-команда видит, с кем она работает;
- менеджер понимает, на какой стадии каждая сделка;
- данные не лежат в Excel у одного человека, а хранятся централизованно;
- другие приложения могут подключаться через API.

What to say in English:

> HubSpot is a CRM platform. A CRM is where a business stores customers,
> companies, contacts, and sales opportunities. In HubSpot, deals represent
> sales opportunities, contacts are people, companies are organizations, and
> pipelines describe the sales process.

If they ask why HubSpot matters:

> The important part is that HubSpot is not just a database table. It has its
> own object model, metadata, validation rules, and relationship model. My app
> respects those rules instead of hardcoding fake CRM behavior.

## How My App Connects To HubSpot

По-русски:

Браузер не ходит в HubSpot напрямую. Схема такая:

1. User opens the frontend in the browser.
2. Frontend calls my local backend, for example `/api/deals`.
3. Backend calls HubSpot API using `HttpClient`.
4. HubSpot returns real CRM data.
5. Backend sends safe JSON back to the browser.

Почему так:

- токен не попадает в браузер;
- вся логика HubSpot API централизована на backend;
- ошибки HubSpot можно нормально распарсить и показать пользователю;
- frontend остается проще.

What to say in English:

> The browser never calls HubSpot directly. The frontend calls my ASP.NET
> Minimal API backend. The backend owns the HubSpot client, attaches the access
> token, calls HubSpot, parses errors, and returns clean JSON to the frontend.

Simple diagram to say:

```text
Browser UI -> Local ASP.NET API -> HubSpot API -> Real CRM data
```

## What Is The Token?

По-русски:

Токен - это секретный ключ доступа к HubSpot API. Он доказывает HubSpot, что
наш backend имеет право читать и записывать данные в конкретном HubSpot portal.

В запросе backend отправляет его примерно так:

```http
Authorization: Bearer <HUBSPOT_ACCESS_TOKEN>
```

Почему токен нужен:

- без токена HubSpot не даст читать deals/contacts/companies;
- токен определяет, к какому аккаунту HubSpot подключен backend;
- scopes токена определяют, что приложению разрешено делать;
- токен нельзя отдавать в браузер, потому что пользователь мог бы украсть его
  через DevTools.

What to say in English:

> The access token is the backend's credential for HubSpot. It is like a
> password for API calls, so it must stay on the server. The frontend never sees
> it. The backend sends it to HubSpot in the Authorization Bearer header.

## How I Get And Use The Token

По-русски:

Для этой песочницы используется HubSpot private app token.

Обычный порядок такой:

1. В HubSpot создается Private App.
2. Включаются нужные CRM scopes, например read/write для contacts, companies,
   deals и associations.
3. HubSpot выдает access token.
4. Я не кладу токен в git и не пишу его в JavaScript.
5. Я передаю его backend через environment variable:

```powershell
$env:HUBSPOT_ACCESS_TOKEN = "pat-..."
dotnet run -- web
```

What to say in English:

> For this sandbox I use a HubSpot private app token. I create a private app in
> HubSpot, give it the required CRM scopes, copy the token, and pass it to the
> backend through the `HUBSPOT_ACCESS_TOKEN` environment variable. It is not in
> source code and it is not exposed to the browser.

If they ask production:

> For a real multi-customer production app I would use OAuth instead of a single
> private app token. For a local sandbox connected to one HubSpot portal, a
> private app token is simple and appropriate.

## 30-Second Opening

Say this before slide 1:

> I built a small HubSpot CRM sandbox. It is an ASP.NET Minimal API backend with
> a browser ES-module frontend. The app talks to real HubSpot data through the
> backend: deals, contacts, companies, pipelines, stages, and validation errors.
> The goal is to show CRM integration thinking, not just a nice UI table.

Then say:

> The most important parts are live HubSpot metadata, correct object
> relationships, safe CSV import, runtime plugin panels, and centralized
> field-level API errors.

## Recommended Interview Flow

Do not go slide by slide like a school presentation. Use this order:

1. Slides 1-2: explain what HubSpot is and what the app does.
2. Switch to the live app for 2-3 minutes.
3. Slides 3-7: explain the technical proof behind what they just saw.
4. Slide 8: close with what the project proves.
5. Slide 9: only open if they ask about exact endpoints or authentication.

## Slide-By-Slide Script

### Slide 1 - Live CRM Sandbox

Goal: establish that this is real integration work.

Say:

> This is live HubSpot data, not mock data. If I create a contact here, it is
> written to HubSpot. If HubSpot rejects a field, the UI shows the exact field
> problem. Dropdowns like pipeline stages come from HubSpot metadata, not from
> hardcoded arrays.

Do not explain plugins yet. Just mention that plugins exist.

### Slide 2 - Real CRM Journey

Goal: show that you understand how CRM users work.

Say:

> The workflow follows a normal CRM process. First we have company and contact
> master data. Then we create a deal. Then we associate the deal with the
> relevant contact or company. That matters because in HubSpot a deal does not
> contain a contact inside it. The relationship is a separate association.

If they are non-technical, stop here and switch to the live app.

### Live Demo Sequence

Keep it short. Do not click every feature.

1. Open Deals.
2. Show pipeline and stage dropdowns.
3. Say the stage list comes from HubSpot metadata.
4. Open row menu and show Edit, Delete, Associate.
5. Open Associate modal and explain that it creates a HubSpot relationship.
6. Open Contacts and show field validation or duplicate email handling.
7. Open Settings and show that plugins/modules are configurable.
8. Open Audit plugin only if time allows.

Live demo sentence:

> I am not trying to demo every button. I want to show the integration points:
> metadata, real records, relationships, validation, CSV, and runtime plugins.

### Slide 3 - Deals

Goal: explain module ownership.

Say:

> The deal module owns its own UI and backend endpoints. Shared utilities handle
> API calls, state, rendering helpers, validation, and action menus. That makes
> the app easier to extend with another CRM object later.

Mention:

> I avoided React and a bundler because the constraint was native browser ES
> modules. Each module is explicit and easy to inspect.

### Slide 4 - Associations

Goal: explain HubSpot-specific relationship modeling simply.

Say:

> This is the HubSpot-specific part. A deal, a contact, and a company are
> separate CRM objects. Linking them is not a PATCH to the deal field. It is a
> separate HubSpot association API call. The UI hides that complexity behind the
> Associate button.

If asked about IDs:

> HubSpot association types have IDs. For this sandbox I use the known
> deal-to-contact and deal-to-company IDs. In production I would centralize them
> or read association metadata depending on the account setup.

Important:

> After associating, click ▶ at the start of any row to expand linked records
> inline. Deals show their contacts and companies; contacts and companies show
> their linked deals. Only one row can be open at a time — it auto-collapses
> when you open another. No separate screen needed.

### Slide 5 - CSV

Goal: show safe data workflow.

Say:

> CSV is not just export and import. The safe workflow is download a template,
> edit in a spreadsheet, preview validation, then apply. I do not want half the
> rows to write successfully and then show errors for the rest.

Mention:

> This follows the same principle as form validation: catch problems before
> writing to HubSpot when possible.

### Slide 6 - Plugins

Goal: explain plugin architecture honestly.

Say:

> The app has built-in modules and uploaded plugins in one Settings list. A
> plugin can add a frontend panel through ZIP upload. Backend plugin actions go
> through a host dispatcher because normal ASP.NET Minimal API routes are
> registered at startup.

If they ask about runtime backend routes:

> I do not pretend that Minimal API routes can be casually added at runtime.
> For runtime plugins, a dispatcher or proxy endpoint is the cleaner sandbox
> solution. Dynamic assemblies are possible, but that is a much heavier CMS-like
> architecture.

### Slide 7 - Validation UX

Goal: show user empathy and engineering discipline.

Say:

> The user should not see only "Failed to create contact". The API wrapper
> parses HubSpot errors once. Then the shared UI helper maps those errors to the
> active form, highlights invalid fields, and shows inline hints.

This is a strong point. Pause here if they care about frontend quality.

### Slide 8 - What This Proves

Goal: close cleanly.

Say:

> The value of this project is not the table UI. It proves that I understand
> live CRM data, HubSpot metadata, relationship modeling, safe import workflows,
> plugin tradeoffs, and user-friendly validation.

Then stop. Do not continue to API Reference unless asked.

### Slide 9 - Appendix API Reference

Only use if they ask:

> Which HubSpot endpoints did you call?
> How does authentication work?
> Does the frontend call HubSpot directly?

Say:

> The frontend calls local endpoints like `/api/deals` and `/api/contacts`.
> The backend wraps HubSpot API calls and attaches the private app token from
> `HUBSPOT_ACCESS_TOKEN`. This keeps credentials out of the browser.

## Questions They May Ask

### What is HubSpot in one sentence?

> HubSpot is a CRM platform where businesses manage companies, contacts, deals,
> sales pipelines, and customer relationships.

### Why not call HubSpot directly from JavaScript?

> Because the access token would be exposed in the browser. The browser calls my
> backend, and only the backend calls HubSpot.

### Why is the token in an environment variable?

> It keeps the secret out of source code and out of the frontend. The backend
> reads it at startup and uses it only for server-to-server HubSpot API calls.

### How do you get the token?

> For this sandbox I create a HubSpot private app, give it the needed CRM
> scopes, copy the generated access token, and set it as
> `HUBSPOT_ACCESS_TOKEN` before running the app.

### Why no React?

> The constraint was native browser ES modules with no bundler. I treated that
> as an architecture requirement and built small module descriptors instead of
> adding a framework.

### Can a plugin add backend routes without restart?

> Not as normal Minimal API routes in this simple model. Minimal API endpoints
> are registered at startup. For runtime plugins, I use a host dispatcher/proxy
> pattern.

### Is this production-ready?

> It is a sandbox, not production CRM middleware. Production next steps would be
> OAuth, persistent audit/import history, stronger plugin isolation,
> retry/rate-limit handling, and stronger pagination/search for large portals.

### What was the hardest part?

> The hardest part was not CRUD. It was keeping HubSpot metadata, associations,
> validation, and user workflow aligned so the app behaves like a CRM tool
> instead of disconnected forms.

### What would you improve next?

> I would add persistent audit history, plugin permission metadata, rate-limit
> handling, and a cleaner packaged plugin SDK. I would keep the same module
> descriptor idea because it is simple and explainable.

## Short Version If Time Is Limited

Use only slides 1, 2, 4, 6, 7, 8.

Script:

> This sandbox uses live HubSpot data, not mock data. HubSpot is a CRM platform
> for companies, contacts, deals, and sales pipelines. My frontend calls a local
> ASP.NET backend, and the backend calls HubSpot with a private app token stored
> in `HUBSPOT_ACCESS_TOKEN`. The token is never exposed to the browser. The app
> demonstrates real CRM workflows: create records, use HubSpot metadata, link
> records through associations, import CSV safely, load plugin panels, and map
> HubSpot errors back to form fields.

## What Not To Do

- Do not read every slide.
- Do not open the API Reference unless asked.
- Do not start with plugins. Start with HubSpot and CRM workflow.
- Do not over-explain association type IDs unless they ask.
- Do not say the frontend calls HubSpot directly. It does not.
- Do not claim this is production-ready. Say it is a sandbox with clear
  production next steps.

## Почему именно такая архитектура — простое объяснение для себя

Запомни три причины:

**1. Безопасность**
Токен нельзя класть в браузер. Поэтому между браузером и HubSpot стоит
мой backend. Браузер не знает токена — он знает только мой локальный API.

**2. Простота**
Я не использовал React и сборщик потому что задача была — показать что я
умею работать с CRM API, а не настраивать инфраструктуру. Нативные ES
модули — каждый файл виден, каждая строка объяснима.

**3. Расширяемость**
Каждый раздел — deals, contacts, companies — живёт в своём модуле.
Хочешь добавить новый объект CRM — добавляешь новый файл по той же схеме.
Плагины подключаются через ZIP без перезапуска фронтенда.

Одной фразой на интервью:

> I chose this architecture because it keeps the token safe on the server,
> keeps the frontend simple and inspectable, and makes each CRM domain
> easy to extend independently.
