# Project Structure

This file briefly explains what each folder in `hubspot-deals-sandbox` is for.

## Root Folders

- `CsvGenerator/`
  Standalone helper subproject for generating CSV files from a desktop UI.

- `HubSpot/`
  HubSpot integration layer.
  Contains the main API client and HubSpot-specific models.

- `ImportExport/`
  CSV import/export workflow.
  Contains validation, preview, template generation, export, and apply logic.

- `Properties/`
  Local launch configuration for running the web app from IDE tools.

- `wwwroot/`
  Frontend static files.
  The main browser UI lives here in `index.html`.

## Important Nested Folders

- `HubSpot/Models/`
  DTOs and response/request models used by the HubSpot API client.

## Important Root Files

- `HubSpotDealsSandbox.csproj`
  Main web project file.

- `Program.cs`
  CLI entry point and command routing.

- `WebServer.cs`
  Minimal API web server used by the browser UI.

- `README.md`
  General notes for the sandbox project.

- `SITE-API-SCHEMA.md`
  API schema for the website and its frontend/backend flow.

- `Start-HubSpotCrmSandbox.bat`
  Start script for the local web demo.

- `Stop-HubSpotCrmSandbox.bat`
  Stop script for the local web demo.

## Generated / Disposable Items

These should not be treated as project source files:

- `.vs/`
- `bin/`
- `obj/`
- `CsvGenerator/bin/`
- `CsvGenerator/obj/`
- `webserver.stdout.log`
- `webserver.stderr.log`
