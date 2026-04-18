# HubSpot CRM Suite

This repository contains the CRM-related demo projects that were previously mixed into `hhupdate`.

## Projects

- `hubspot-deals-sandbox`
  Live HubSpot sandbox UI with deals, contacts, companies, associations, CSV import/export, helper bat files, and `sample-imports` CSV examples.

- `hubspot-crm-local-stand`
  Local mock CRM stand with Swagger and in-memory data.

- `hubspot-deals-sandbox-presentation`
  Presentation assets, screenshot capture scripts, and the PPTX/PDF candidate deck.

## Quick Start

### 1. Live HubSpot sandbox

From `hubspot-deals-sandbox`:

```powershell
set HUBSPOT_ACCESS_TOKEN=your-token
.\Start-HubSpotCrmSandbox.bat
```

Stop it with:

```powershell
.\Stop-HubSpotCrmSandbox.bat
```

### 2. Local mock stand

From `hubspot-crm-local-stand`:

```powershell
dotnet run
```

### 3. Presentation

From `hubspot-deals-sandbox-presentation`:

```powershell
npm install
powershell -ExecutionPolicy Bypass -File .\capture-screenshots.ps1
npm run build:pptx
```

## Notes

- The moved projects keep their original folder names, so their relative scripts and bat files continue to work.
- Build artifacts and `node_modules` are intentionally excluded from this repository.
