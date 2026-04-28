# HubSpot CRM Sandbox

A portfolio project — a fully working CRM interface that reads and writes real data to a live HubSpot sandbox account.

**Not a mockup.** Create a deal here and it appears in HubSpot. Pick the wrong pipeline stage and HubSpot rejects it. The UI shows exactly which field to fix.

---

## What it demonstrates

| Area | Detail |
|---|---|
| **HubSpot API** | Deals, contacts, companies — full CRUD via private app token |
| **Associations** | Separate PUT calls with fixed type IDs (deal↔contact = 3, deal↔company = 5) |
| **Live metadata** | Pipeline stages, lifecycle stages, and industry options loaded from HubSpot — not hardcoded |
| **Runtime plugins** | Upload a ZIP with a `.plugin.dll` + `.js` module — a new panel appears without touching the shell |
| **CSV import/export** | Preview validation per row before anything is written to HubSpot |
| **Error handling** | HubSpot rejection messages parsed and mapped to the exact form field |

---

## Screenshots

| Deals panel | Contacts panel | Companies panel |
|---|---|---|
| ![Deals](hubspot-deals-sandbox-presentation/screenshots/deals-panel.png) | ![Contacts](hubspot-deals-sandbox-presentation/screenshots/contacts-panel.png) | ![Companies](hubspot-deals-sandbox-presentation/screenshots/companies-panel.png) |

Expand any row (▶) to see linked records inline. No separate screen.

---

## Tech stack

**Backend** — C# · ASP.NET Minimal API · `HttpClient` (no SDK)  
**Frontend** — Native ES modules · No React · No bundler  
**HubSpot** — Private app token · REST API v3  
**Runtime plugins** — Managed plugin loading · Host dispatcher · Shared module order

---

## Architecture

```
hubspot-crm-suite/
├── hubspot-deals-sandbox/          # Main project
│   ├── HubSpot/                    # HubSpotDealsClient — all API calls
│   ├── Modules/                    # Deals, Contacts, Companies — each owns its routes + service
│   ├── wwwroot/
│   │   ├── js/modules/             # Frontend modules — one file per panel
│   │   └── js/                     # Shared: state, renders, forms, pagination, inline-edit
│   └── Program.cs                  # Minimal API host + plugin loader
└── hubspot-deals-sandbox-presentation/
    ├── presentation.html           # Slide deck (self-contained HTML)
    └── screenshots/                # Panel screenshots
```

Each backend module registers its own routes and owns its HubSpot service calls.  
Each frontend module exports `{ id, renderPanel(), renderNav(), mount() }` — the shell loads them in order.

---

## Key features

- **Inline expand rows** — click ▶ on any deal, contact, or company row to see linked records without leaving the table
- **Inline edit** — edit a record directly in the table row, no form switching
- **Pagination** — configurable page size, persists per module
- **Filters** — name, stage/lifecycle, pipeline — with active-filter indicator
- **Module ordering** — reorder panels in Settings; order persists across reloads
- **Plugin system** — drop a ZIP to install a new panel; enable/disable/delete without restart

---

## Running locally

```powershell
# Set your HubSpot private app token
set HUBSPOT_ACCESS_TOKEN=your-token-here

# Start (from hubspot-deals-sandbox/)
.\Start-HubSpotCrmSandbox.bat

# Opens at http://localhost:5100
```

Minimum HubSpot scopes: `crm.objects.deals.read/write` · `crm.objects.contacts.read/write` · `crm.objects.companies.read/write` · association read/write

---

## Presentation

`hubspot-deals-sandbox-presentation/presentation.html` — open in a browser.  
Press `→` to advance, `N` for presenter notes, `F` for fullscreen, `中文` to toggle Chinese subtitles.
