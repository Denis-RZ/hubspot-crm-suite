# CRM Sandbox Interview Talk Track

This file is the speaking script. Do not read it word for word during the
interview. Use it to understand the story and keep the demo simple.

## Main Idea

По-русски:

> Я сделал небольшое CRM-приложение, полностью написанное с нуля. Оно
> показывает сделки, контакты и компании, позволяет создавать, редактировать
> и связывать записи, загружать плагины и импортировать CSV. Все данные
> хранятся в собственном файловом хранилище, которое я сам спроектировал и
> написал - никакого стороннего сервиса, никакого API-ключа, ничего не нужно
> настраивать.

What to say in English:

> I built a small CRM system entirely from scratch. It shows deals, contacts,
> and companies, lets you create, edit, and link records, load plugins, and
> import CSV files. Every piece of data lives in a data layer I designed and
> wrote myself - no external service, no API key, nothing to configure.

Short version:

> This project proves that I can design and build a full CRM data model and
> UI from the ground up, not just consume someone else's API.

## What Does This App Do?

По-русски:

Это CRM-система - Customer Relationship Management. Простыми словами, это
система, где бизнес хранит клиентов и продажи:

- Companies - компании, с которыми работает бизнес.
- Contacts - люди внутри этих компаний.
- Deals - сделки, продажи или потенциальные контракты.
- Pipelines and stages - этапы продаж, например appointment, contract sent,
  closed won.
- Defects (QA) - отдельный модуль для производства: учёт дефектов,
  совершенно другой домен, но построен на той же архитектуре модулей.

Зачем это нужно:

- sales-команда видит, с кем она работает;
- менеджер понимает, на какой стадии каждая сделка;
- данные не лежат в Excel у одного человека, а хранятся централизованно;
- модульная архитектура позволяет добавлять новые разделы (как Defects) без
  переписывания ядра системы.

What to say in English:

> This is a CRM. A CRM is where a business stores customers, companies,
> contacts, and sales opportunities. Deals represent sales opportunities,
> contacts are people, companies are organizations, and pipelines describe
> the sales process. I also added a Defects module for manufacturing QA -
> a completely different domain, built on the same module contract, to prove
> the architecture isn't tied to CRM specifically.

If they ask why build it this way:

> The important part is that this isn't just a database table with a form on
> top. It has its own object model, metadata, validation rules, and a proper
> relationship model between deals, contacts, and companies - the same kind
> of design a real CRM platform would use, except I designed and built all of
> it myself.

## How My App Is Built

По-русски:

Всё работает в одном процессе, без внешних вызовов:

1. User opens the frontend in the browser.
2. Frontend calls my local backend, for example `/api/deals`.
3. Backend reads/writes to `LocalCrmStore` - my own in-memory + file-backed
   data layer.
4. Every change is immediately persisted to a JSON file on disk.
5. Backend sends JSON back to the browser.

Почему так:

- никаких секретов и токенов вообще не нужно;
- вся бизнес-логика (валидация, связи между сущностями, генерация ID)
  находится на backend, централизованно;
- данные переживают перезапуск сервера - файл читается заново при старте;
- frontend остаётся простым и не знает деталей хранения.

What to say in English:

> The browser never talks to any external service. The frontend calls my
> ASP.NET Minimal API backend. The backend owns a class called
> `LocalCrmStore`, which keeps everything in memory for speed and writes to
> one JSON file after every change, so data survives a restart.

Simple diagram to say:

```text
Browser UI -> Local ASP.NET API -> LocalCrmStore -> App_Data/crm-store.json
```

## Why No External Service?

По-русски:

Изначально я хотел показать интеграцию с реальным внешним API. Но потом
понял, что для интервью с вопросом "можешь ли ты построить систему с нуля"
гораздо более прямой ответ - показать систему, где я сам спроектировал и
данные, и API, и связи между сущностями, без зависимости от чужого сервиса.

Что это доказывает:

- я умею проектировать модель данных с нуля (сущности, связи, валидация);
- я умею строить API поверх этой модели;
- я понимаю, как обеспечить сохранность данных (persistence) без базы
  данных уровня production;
- систему можно запустить где угодно одной командой, без учётных записей.

What to say in English:

> I deliberately kept this fully self-contained. There's no account to set
> up, no token to request - clone the repo, run one command, and it works.
> Everything from the data model to the association logic to the file
> persistence is code I designed and wrote myself.

If they ask about production readiness:

> For a real multi-user production system I'd add a real database, proper
> concurrency control, and authentication. For a portfolio demo, a
> file-backed in-memory store is simple, transparent, and easy to read end
> to end in five minutes.

## 30-Second Opening

Say this before slide 1:

> I built a small CRM system, entirely from scratch. It's an ASP.NET Minimal
> API backend with a browser ES-module frontend. Every piece of data - deals,
> contacts, companies, pipelines, stages - lives in a data layer I designed
> and wrote myself, persisted to a local file. No external service involved.

Then say:

> The most important parts are the association model, safe CSV import,
> runtime plugin panels, centralized field-level errors, and a second,
> completely different module - manufacturing defect tracking - built on the
> same architecture to prove it generalizes.

## Recommended Interview Flow

Do not go slide by slide like a school presentation. Use this order:

1. Slides 1-2: explain what the app does and the CRM object order.
2. Switch to the live app for 2-3 minutes.
3. Slides 3-7: explain the technical proof behind what they just saw.
4. Slide 8: close with what the project proves.
5. Slide 9: only open if they ask about exact endpoints.

## Slide-By-Slide Script

### Slide 1 - A CRM built entirely from scratch

Goal: establish that this is real, working, self-built software.

Say:

> Nothing here is a mockup and nothing is wired to a third-party CRM. If I
> create a deal, it's written to my own file-backed store. The UI, the API,
> and the data model are all code I wrote.

Do not explain plugins yet. Just mention that plugins exist.

### Slide 2 - The right order matters

Goal: show that you understand how CRM users work.

Say:

> The workflow follows a normal CRM process. First we have company and
> contact master data. Then we create a deal. Then we associate the deal
> with the relevant contact or company. A deal does not contain a contact
> inside it - the relationship is a separate link.

If they are non-technical, stop here and switch to the live app.

### Live Demo Sequence

Keep it short. Do not click every feature.

1. Open Deals.
2. Show pipeline and stage dropdowns.
3. Open row menu and show Edit, Delete, Associate.
4. Open Associate modal and explain that it creates a link between two
   records.
5. Open Contacts and show field validation or duplicate email handling.
6. Open Defects (QA) and show it's a different domain, same module system -
   including the optional link to a Company record.
7. Open Settings and show that plugins/modules are configurable.

Live demo sentence:

> I am not trying to demo every button. I want to show the integration
> points: the data model, relationships, validation, CSV, runtime plugins,
> and a second unrelated module using the same architecture.

### Slide 3 - Deals

Goal: explain module ownership.

Say:

> The deal module owns its own UI and backend endpoints. Shared utilities
> handle API calls, state, rendering helpers, validation, and action menus.
> That makes the app easier to extend with another object later - which is
> exactly what the Defects module is.

Mention:

> I avoided React and a bundler because the constraint was native browser ES
> modules. Each module is explicit and easy to inspect.

### Slide 4 - Associations

Goal: explain the relationship model simply.

Say:

> A deal, a contact, and a company are separate objects. Linking them isn't
> a field on the deal - it's a proper link record, written both directions
> at once, so either side can query it directly.

Important:

> After associating, click ▶ at the start of any row to expand linked
> records inline. Deals show their contacts and companies; contacts and
> companies show their linked deals. Only one row can be open at a time - it
> auto-collapses when you open another. No separate screen needed.

### Slide 5 - CSV

Goal: show safe data workflow.

Say:

> CSV is not just export and import. The safe workflow is download a
> template, edit in a spreadsheet, preview validation, then apply. I do not
> want half the rows to write successfully and then show errors for the
> rest.

### Slide 6 - Plugins

Goal: explain plugin architecture honestly.

Say:

> The app has built-in modules and uploaded plugins in one Settings list. A
> plugin can add a frontend panel through ZIP upload. Backend plugin actions
> go through a host dispatcher because normal ASP.NET Minimal API routes are
> registered at startup.

If they ask about runtime backend routes:

> I do not pretend that Minimal API routes can be casually added at runtime.
> For runtime plugins, a dispatcher or proxy endpoint is the cleaner
> solution. Dynamic assemblies are possible, but that is a much heavier
> CMS-like architecture.

### Slide 7 - Validation UX

Goal: show user empathy and engineering discipline.

Say:

> The user should not see only "Failed to create contact". The API wrapper
> parses errors once. Then the shared UI helper maps those errors to the
> active form, highlights invalid fields, and shows inline hints.

This is a strong point. Pause here if they care about frontend quality.

### Slide 8 - What This Proves

Goal: close cleanly.

Say:

> The value of this project is not the table UI. It proves that I can design
> a data model, build relationship logic, write a safe import workflow,
> reason about plugin tradeoffs, and build user-friendly validation - all
> without leaning on someone else's platform to do the hard part for me.

Then stop. Do not continue to API Reference unless asked.

### Slide 9 - Appendix API Reference

Only use if they ask:

> What endpoints does the frontend call?
> Where does the data actually live?

Say:

> The frontend calls local endpoints like `/api/deals` and `/api/contacts`.
> The backend reads and writes through `LocalCrmStore`, which persists to
> `App_Data/crm-store.json`. No credentials anywhere in the request path.

## Questions They May Ask

### Why did you build your own data layer instead of using a real database?

> For a portfolio piece I wanted something anyone can clone and run in ten
> seconds with zero setup. A file-backed store does that. For production
> scale I'd swap it for a real database - the module contract doesn't care
> what's behind `LocalCrmStore`.

### Is this production-ready?

> It's a well-architected demo, not a production CRM. Production next steps
> would be a real database, concurrency control, authentication, and
> persistent audit history.

### What was the hardest part?

> Keeping the association model, validation, and CSV round-trip consistent
> so the app behaves like a real CRM tool instead of disconnected forms -
> and doing it without a framework doing that work for me.

### Why no React?

> The constraint was native browser ES modules with no bundler. I treated
> that as an architecture requirement and built small module descriptors
> instead of adding a framework.

### Can a plugin add backend routes without restart?

> Not as normal Minimal API routes in this simple model. Minimal API
> endpoints are registered at startup. For runtime plugins, I use a host
> dispatcher/proxy pattern.

### What would you improve next?

> A real database, persistent audit history, plugin permission metadata,
> and a cleaner packaged plugin SDK. I would keep the same module descriptor
> idea because it is simple and explainable.

### How does the Defects module relate to the CRM part?

> It doesn't have to - that's the point. It's a different domain
> (manufacturing QA) on the same module contract, with its own storage. It
> can optionally link to a Company record, which shows the architecture
> supports both fully independent modules and cross-module references.

## Short Version If Time Is Limited

Script:

> This is a CRM built entirely from scratch - no external service, nothing
> to configure. My frontend calls a local ASP.NET backend, and the backend
> reads and writes through a data layer I designed myself, persisted to a
> file. The app demonstrates real CRM workflows: create records, link them
> through associations, import CSV safely, load plugin panels, map errors
> back to form fields, and even run a second, unrelated module (manufacturing
> defect tracking) on the same architecture.

## What Not To Do

- Do not read every slide.
- Do not open the API Reference unless asked.
- Do not start with plugins. Start with the CRM workflow.
- Do not claim this is production-ready. Say it is a well-built demo with
  clear production next steps.
- Do not say the frontend talks to any external service. It does not.

## Почему именно такая архитектура — простое объяснение для себя

Запомни три причины:

**1. Самостоятельность**
Я не хотел, чтобы главный аргумент проекта зависел от чужого сервиса.
Собственный data layer доказывает, что я умею проектировать модель данных,
а не только вызывать чужой API.

**2. Простота**
Я не использовал React и сборщик потому что задача была - показать, что я
умею работать с архитектурой без лишней инфраструктуры. Нативные ES
модули - каждый файл виден, каждая строка объяснима.

**3. Расширяемость**
Каждый раздел - deals, contacts, companies, defects - живёт в своём модуле.
Хочешь добавить новый объект - добавляешь новый файл по той же схеме.
Плагины подключаются через ZIP без перезапуска фронтенда.

Одной фразой на интервью:

> I chose this architecture because it needs zero setup, keeps the frontend
> simple and inspectable, and makes each domain - CRM or manufacturing QA -
> easy to add independently.
