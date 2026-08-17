using System.Globalization;
using System.Reflection;
using System.Text.Json;
using HubSpotDealsSandbox;
using HubSpotDealsSandbox.Data;
using HubSpotDealsSandbox.HubSpot.Models;
using HubSpotDealsSandbox.ImportExport;
using HubSpotDealsSandbox.Modules;
using HubSpotDealsSandbox.Plugins;

var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web)
{
    WriteIndented = true
};
var settingsJsonOptions = new JsonSerializerOptions
{
    WriteIndented = true
};

var exitCode = await RunAsync(args);
return exitCode;

async Task<int> RunAsync(string[] args)
{
    if (args.Length > 0 && IsHelpCommand(args[0]))
    {
        PrintUsage();
        return 0;
    }

    var client = new LocalCrmStore(GetCrmStorePath(Directory.GetCurrentDirectory()));

    var command = args.Length == 0 ? "web" : args[0].ToLowerInvariant();

    try
    {
        switch (command)
        {
            case "list":
                await ListDealsAsync(client, args);
                break;

            case "get":
                await GetDealAsync(client, args);
                break;

            case "create-from-file":
                await CreateDealFromFileAsync(client, args);
                break;

            case "update-from-file":
                await UpdateDealFromFileAsync(client, args);
                break;

            case "web":
                await RunWebAsync();
                return 0;

            case "search":
                await SearchDealsAsync(client, args);
                break;

            case "associate":
                await AssociateDealAsync(client, args);
                break;

            case "associations":
                await GetAssociationsAsync(client, args);
                break;

            default:
                Console.Error.WriteLine($"Unknown command: {command}");
                PrintUsage();
                return 1;
        }

        return 0;
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine(ex.Message);
        return 1;
    }
}

async Task ListDealsAsync(LocalCrmStore client, string[] args)
{
    const int defaultLimit = 5;
    var limit = defaultLimit;

    if (args.Length > 1 &&
        !int.TryParse(args[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out limit))
    {
        throw new ArgumentException("list accepts an optional integer limit.");
    }

    var deals = await client.ListDealsAsync(limit);
    if (deals.Count == 0)
    {
        Console.WriteLine("No deals returned.");
        return;
    }

    foreach (var deal in deals)
    {
        Console.WriteLine(
            $"{deal.Id,-12}  {TrimToWidth(deal.Properties.DealName, 32),-32}  " +
            $"stage={deal.Properties.DealStage ?? "-",-24}  " +
            $"amount={deal.Properties.Amount ?? "-",-12}  " +
            $"pipeline={deal.Properties.Pipeline ?? "-"}");
    }
}

async Task GetDealAsync(LocalCrmStore client, string[] args)
{
    if (args.Length < 2)
    {
        throw new ArgumentException("get requires a deal id.");
    }

    var deal = await client.GetDealAsync(args[1]);
    Console.WriteLine(JsonSerializer.Serialize(deal, jsonOptions));
}

async Task CreateDealFromFileAsync(LocalCrmStore client, string[] args)
{
    if (args.Length < 2)
    {
        throw new ArgumentException("create-from-file requires a path to a JSON file.");
    }

    var request = await ReadMutationRequestAsync(args[1]);
    var deal = await client.CreateDealAsync(request);

    Console.WriteLine("Created deal:");
    Console.WriteLine(JsonSerializer.Serialize(deal, jsonOptions));
}

async Task UpdateDealFromFileAsync(LocalCrmStore client, string[] args)
{
    if (args.Length < 3)
    {
        throw new ArgumentException("update-from-file requires a deal id and a path to a JSON file.");
    }

    var request = await ReadMutationRequestAsync(args[2]);
    var deal = await client.UpdateDealAsync(args[1], request);

    Console.WriteLine("Updated deal:");
    Console.WriteLine(JsonSerializer.Serialize(deal, jsonOptions));
}

// search <property> <operator> <value>
// Builds a single-filter search request and prints matching deals.
// The HubSpot search API is POST-based because the filter body can be complex.
//
// Examples:
//   dotnet run -- search dealstage EQ appointmentscheduled
//   dotnet run -- search amount GTE 5000
//   dotnet run -- search dealname CONTAINS_TOKEN Acme
async Task SearchDealsAsync(LocalCrmStore client, string[] args)
{
    if (args.Length < 4)
    {
        throw new ArgumentException(
            "search requires: <property> <operator> <value>\n" +
            "  Operators: EQ, NEQ, LT, LTE, GT, GTE, HAS_PROPERTY, NOT_HAS_PROPERTY, CONTAINS_TOKEN");
    }

    // One FilterGroup with one Filter = a simple single-condition search.
    // In real integrations you often combine multiple filters per group.
    var request = new HubSpotSearchRequest
    {
        FilterGroups =
        [
            new HubSpotFilterGroup
            {
                Filters =
                [
                    new HubSpotFilter
                    {
                        PropertyName = args[1],
                        Operator     = args[2].ToUpperInvariant(),
                        Value        = args[3]
                    }
                ]
            }
        ]
    };

    var deals = await client.SearchDealsAsync(request);

    if (deals.Count == 0)
    {
        Console.WriteLine("No deals matched the search criteria.");
        return;
    }

    Console.WriteLine($"Found {deals.Count} deal(s):");
    foreach (var deal in deals)
    {
        Console.WriteLine(
            $"{deal.Id,-12}  {TrimToWidth(deal.Properties.DealName, 32),-32}  " +
            $"stage={deal.Properties.DealStage ?? "-",-24}  " +
            $"amount={deal.Properties.Amount ?? "-"}");
    }
}

// associate <dealId> <objectType> <objectId>
// Creates a link between a deal and a contact or company.
// HubSpot calls this an "association" — it is stored separately from properties.
//
// Example:
//   dotnet run -- associate 123456789 contacts 987654321
async Task AssociateDealAsync(LocalCrmStore client, string[] args)
{
    if (args.Length < 4)
    {
        throw new ArgumentException(
            "associate requires: <dealId> <objectType> <objectId>\n" +
            "  Object types: contacts, companies\n" +
            "  Example: dotnet run -- associate 123456789 contacts 987654321");
    }

    await client.AssociateDealAsync(args[1], args[2], args[3]);
    Console.WriteLine($"Associated deal {args[1]} → {args[2]}/{args[3]}.");
}

// associations <dealId> <objectType>
// Lists all objects of the given type that are linked to a deal.
//
// Example:
//   dotnet run -- associations 123456789 contacts
async Task GetAssociationsAsync(LocalCrmStore client, string[] args)
{
    if (args.Length < 3)
    {
        throw new ArgumentException(
            "associations requires: <dealId> <objectType>\n" +
            "  Object types: contacts, companies\n" +
            "  Example: dotnet run -- associations 123456789 contacts");
    }

    var records = await client.GetDealAssociationsAsync(args[1], args[2]);

    if (records.Count == 0)
    {
        Console.WriteLine($"Deal {args[1]} has no associated {args[2]}.");
        return;
    }

    Console.WriteLine($"Deal {args[1]} → {args[2]} ({records.Count} record(s)):");
    foreach (var r in records)
    {
        Console.WriteLine($"  id={r.Id}  type={r.Type}");
    }
}

async Task<HubSpotDealMutationRequest> ReadMutationRequestAsync(string path)
{
    var fullPath = Path.GetFullPath(path);
    if (!File.Exists(fullPath))
    {
        throw new FileNotFoundException("JSON payload file was not found.", fullPath);
    }

    var json = await File.ReadAllTextAsync(fullPath);
    var payload = JsonSerializer.Deserialize<HubSpotDealMutationRequest>(json, jsonOptions);

    if (payload is null || payload.Properties.Count == 0)
    {
        throw new InvalidOperationException("The payload must contain a non-empty properties object.");
    }

    return payload;
}

bool IsHelpCommand(string command) =>
    command.Equals("help", StringComparison.OrdinalIgnoreCase) ||
    command.Equals("--help", StringComparison.OrdinalIgnoreCase) ||
    command.Equals("-h", StringComparison.OrdinalIgnoreCase);

string TrimToWidth(string? value, int width)
{
    if (string.IsNullOrWhiteSpace(value))
    {
        return "-";
    }

    return value.Length <= width ? value : $"{value[..(width - 3)]}...";
}

string GetCrmStorePath(string contentRootPath) =>
    Path.Combine(contentRootPath, "App_Data", "crm-store.json");

string GetRuntimeSettingsPath(string contentRootPath) =>
    Path.Combine(contentRootPath, "App_Data", "runtime-settings.json");

RuntimeModuleSettings? LoadRuntimeModuleSettings(string contentRootPath)
{
    var settingsPath = GetRuntimeSettingsPath(contentRootPath);
    if (!File.Exists(settingsPath))
    {
        return null;
    }

    try
    {
        var settings = JsonSerializer.Deserialize<RuntimeModuleSettings>(
            File.ReadAllText(settingsPath),
            settingsJsonOptions);
        return settings?.Modules is { Length: > 0 } ? settings : null;
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"[Settings] Could not read {settingsPath}: {ex.Message}");
        return null;
    }
}

async Task SaveRuntimeModuleSettingsAsync(string contentRootPath, string[] moduleIds)
{
    var appDataPath = Path.Combine(contentRootPath, "App_Data");
    Directory.CreateDirectory(appDataPath);

    var settingsPath = GetRuntimeSettingsPath(contentRootPath);
    var json = JsonSerializer.Serialize(
        new RuntimeModuleSettings(moduleIds),
        settingsJsonOptions);

    await File.WriteAllTextAsync(settingsPath, json);
}

IResult BuildSettingsSaveProblem(string contentRootPath, Exception ex)
{
    var appDataPath = Path.Combine(contentRootPath, "App_Data");
    Console.Error.WriteLine($"[Settings] Could not save module settings to {appDataPath}: {ex}");
    return Results.Problem(
        title: "Could not save module settings",
        detail: $"Grant Modify/Write permission to the IIS application pool for '{appDataPath}'. {ex.Message}",
        statusCode: StatusCodes.Status500InternalServerError);
}

void PrintUsage()
{
    Console.WriteLine(
        """
        CRM sandbox (self-contained, file-backed - no external account needed)

        Commands:
          dotnet run -- web
          dotnet run -- list [limit]
          dotnet run -- get <dealId>
          dotnet run -- create-from-file <jsonPath>
          dotnet run -- update-from-file <dealId> <jsonPath>
          dotnet run -- search <property> <operator> <value>
          dotnet run -- associate <dealId> <objectType> <objectId>
          dotnet run -- associations <dealId> <objectType>

        Data is stored in App_Data/crm-store.json - nothing to configure.

        Examples:
          dotnet run -- list 10
          dotnet run -- get 123456789
          dotnet run -- create-from-file .\sample-create-deal.json
          dotnet run -- search dealstage EQ appointmentscheduled
          dotnet run -- search amount GTE 5000
          dotnet run -- associate 123456789 contacts 987654321
          dotnet run -- associations 123456789 contacts

        Search operators: EQ, NEQ, LT, LTE, GT, GTE, HAS_PROPERTY, NOT_HAS_PROPERTY, CONTAINS_TOKEN
        Association object types: contacts, companies
        """);
}

async Task RunWebAsync()
{
    var builder = WebApplication.CreateBuilder(Array.Empty<string>());
    var isHostedByIis =
        !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ASPNETCORE_PORT")) ||
        !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ASPNETCORE_IIS_PHYSICAL_PATH"));

    if (!isHostedByIis)
    {
        builder.WebHost.UseUrls("http://localhost:5100");
    }

    builder.Logging.SetMinimumLevel(LogLevel.Warning);

    var runtimeSettings = LoadRuntimeModuleSettings(builder.Environment.ContentRootPath);
    var configuredModuleIds = runtimeSettings?.Modules ??
        builder.Configuration.GetSection("Modules").Get<string[]>();
    var settingsSourceName = runtimeSettings is null
        ? "appsettings.json"
        : GetRuntimeSettingsPath(builder.Environment.ContentRootPath);

    var enabledModules = CrmModuleCatalog.LoadEnabledModules(
        configuredModuleIds,
        Assembly.GetExecutingAssembly(),
        settingsSourceName);

    builder.Services.AddSingleton(new LocalCrmStore(GetCrmStorePath(builder.Environment.ContentRootPath)));
    builder.Services.AddSingleton(new ModuleAvailability(enabledModules));
    builder.Services.AddSingleton<CrmCsvService>();
    builder.Services.AddSingleton<PluginRegistry>();

    foreach (var module in enabledModules)
    {
        module.RegisterServices(builder.Services);
    }

    var app = builder.Build();

    // Load any plugins that were previously installed
    app.Services.GetRequiredService<PluginRegistry>().LoadFromDirectory();

    app.Use(async (context, next) =>
    {
        context.Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
        context.Response.Headers["Pragma"] = "no-cache";
        context.Response.Headers["Expires"] = "0";

        await next();
    });

    app.UseDefaultFiles();
    app.UseStaticFiles();

    app.MapGet("/api/modules", () =>
        Results.Ok(enabledModules.Select((module, index) =>
            new EnabledModuleDescriptor(module.Id, module.Label, (index + 1) * 100))));

    var allModules = CrmModuleCatalog.DiscoverAllModules(Assembly.GetExecutingAssembly());

    app.MapGet("/api/modules/available", () =>
    {
        // Enabled modules first in their current config order, disabled ones after sorted by navOrder
        var enabledIds = enabledModules.Select(m => m.Id).ToList();
        var ordered = allModules.OrderBy(m =>
        {
            var idx = enabledIds.FindIndex(id => string.Equals(id, m.Id, StringComparison.OrdinalIgnoreCase));
            return idx >= 0 ? idx : enabledIds.Count + m.NavOrder;
        });
        return Results.Ok(ordered.Select(m => new
        {
            id      = m.Id,
            label   = m.Label,
            navOrder = m.NavOrder,
            enabled = enabledIds.Any(id => string.Equals(id, m.Id, StringComparison.OrdinalIgnoreCase)),
        }));
    });

    app.MapPost("/api/modules", async (
        ModuleSettingsRequest request,
        IWebHostEnvironment env,
        IHostApplicationLifetime lifetime,
        PluginRegistry plugins) =>
    {
        var moduleIds = request.Modules
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (moduleIds.Length == 0)
            return Results.BadRequest(new { error = "At least one module must be enabled." });

        var validIds = new HashSet<string>(allModules.Select(m => m.Id), StringComparer.OrdinalIgnoreCase);
        var unknown  = moduleIds.Where(id => !validIds.Contains(id)).ToArray();
        if (unknown.Length > 0)
            return Results.BadRequest(new { error = $"Unknown module(s): {string.Join(", ", unknown)}" });

        try
        {
            if (request.Plugins is not null)
            {
                var pluginOrders = request.Plugins
                    .Where(item => !string.IsNullOrWhiteSpace(item.Id))
                    .GroupBy(item => item.Id, StringComparer.OrdinalIgnoreCase)
                    .ToDictionary(
                        group => group.Key,
                        group => group.Last().NavOrder,
                        StringComparer.OrdinalIgnoreCase);

                if (pluginOrders.Count > 0)
                {
                    var unknownPlugins = plugins.SaveOrder(pluginOrders);
                    if (unknownPlugins.Length > 0)
                    {
                        return Results.BadRequest(new { error = $"Unknown plugin(s): {string.Join(", ", unknownPlugins)}" });
                    }
                }
            }

            await SaveRuntimeModuleSettingsAsync(env.ContentRootPath, moduleIds);
        }
        catch (UnauthorizedAccessException ex)
        {
            return BuildSettingsSaveProblem(env.ContentRootPath, ex);
        }
        catch (IOException ex)
        {
            return BuildSettingsSaveProblem(env.ContentRootPath, ex);
        }

        // Give the response time to reach the browser before shutting down.
        _ = Task.Run(async () =>
        {
            await Task.Delay(600);
            lifetime.StopApplication();
        });

        return Results.Ok(new { message = "Saved. Server is restarting…" });
    });

    app.MapGet("/api/bootstrap", async (
        IServiceScopeFactory scopeFactory,
        CancellationToken cancellationToken) =>
        await ApiEndpointHelpers.ExecuteAsync(async () =>
        {
            using var scope = scopeFactory.CreateScope();

            var payload = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            var moduleErrors = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

            foreach (var module in enabledModules)
            {
                // Each module's bootstrap fragment is isolated: a failure in one
                // integration (e.g. HubSpot unreachable) must not take down
                // modules that do not depend on it (e.g. the local Defects store).
                try
                {
                    var fragment = await module.BuildBootstrapAsync(scope.ServiceProvider, cancellationToken);
                    foreach (var item in fragment)
                    {
                        payload[item.Key] = item.Value;
                    }
                }
                catch (Exception ex)
                {
                    moduleErrors[module.Id] = ex.Message;
                }
            }

            if (moduleErrors.Count > 0)
            {
                payload["moduleErrors"] = moduleErrors;
            }

            return Results.Ok(payload);
        }));

    app.MapGet("/api/export/{objectType}", async (
        string objectType,
        ModuleAvailability moduleAvailability,
        CrmCsvService csvService,
        LocalCrmStore client,
        CancellationToken cancellationToken) =>
        await ApiEndpointHelpers.ExecuteAsync(async () =>
        {
            moduleAvailability.EnsureEnabled(objectType);
            if (!CrmCsvService.SupportsObjectType(objectType))
            {
                throw new ArgumentException($"Unsupported object type '{objectType}'.");
            }

            var export = await csvService.ExportAsync(objectType, client, cancellationToken);
            return Results.File(export.Content, export.ContentType, export.FileName);
        }));

    app.MapGet("/api/export/{objectType}/template", async (
        string objectType,
        ModuleAvailability moduleAvailability,
        CrmCsvService csvService) =>
        await ApiEndpointHelpers.ExecuteAsync(() =>
        {
            moduleAvailability.EnsureEnabled(objectType);
            if (!CrmCsvService.SupportsObjectType(objectType))
            {
                throw new ArgumentException($"Unsupported object type '{objectType}'.");
            }

            var template = csvService.BuildTemplate(objectType);
            return Task.FromResult<IResult>(
                Results.File(template.Content, template.ContentType, template.FileName));
        }));

    app.MapPost("/api/import/{objectType}/preview", async (
        string objectType,
        ModuleAvailability moduleAvailability,
        CrmCsvService csvService,
        LocalCrmStore client,
        HttpRequest request,
        CancellationToken cancellationToken) =>
        await ApiEndpointHelpers.ExecuteAsync(async () =>
        {
            moduleAvailability.EnsureEnabled(objectType);
            if (!CrmCsvService.SupportsObjectType(objectType))
            {
                throw new ArgumentException($"Unsupported object type '{objectType}'.");
            }

            var file = await ApiEndpointHelpers.ReadUploadedCsvAsync(request, cancellationToken);
            await using var stream = file.OpenReadStream();
            var preview = await csvService.PreviewAsync(
                objectType,
                file.FileName,
                stream,
                client,
                cancellationToken);

            return Results.Ok(preview);
        }));

    app.MapPost("/api/import/{objectType}/apply", async (
        string objectType,
        ModuleAvailability moduleAvailability,
        CrmCsvService csvService,
        LocalCrmStore client,
        HttpRequest request,
        CancellationToken cancellationToken) =>
        await ApiEndpointHelpers.ExecuteAsync(async () =>
        {
            moduleAvailability.EnsureEnabled(objectType);
            if (!CrmCsvService.SupportsObjectType(objectType))
            {
                throw new ArgumentException($"Unsupported object type '{objectType}'.");
            }

            var file = await ApiEndpointHelpers.ReadUploadedCsvAsync(request, cancellationToken);
            await using var stream = file.OpenReadStream();
            var apply = await csvService.ApplyAsync(
                objectType,
                file.FileName,
                stream,
                client,
                cancellationToken);

            return apply.AttemptedRows == 0 && apply.FailedRows > 0
                ? Results.BadRequest(apply)
                : Results.Ok(apply);
        }));

    foreach (var module in enabledModules)
    {
        module.MapEndpoints(app);
    }

    // ── Plugin API ─────────────────────────────────────────────────────────────

    app.MapGet("/api/admin/plugins", (PluginRegistry plugins) =>
        Results.Ok(plugins.All.Select(m => new { m.Id, m.Label, m.NavOrder })));

    app.MapPost("/api/admin/plugins/upload", async (HttpRequest request, PluginRegistry plugins) =>
        await ApiEndpointHelpers.ExecuteAsync(async () =>
        {
            if (!request.HasFormContentType)
                return Results.BadRequest(new { error = "Multipart form required." });

            var form = await request.ReadFormAsync();
            var file = form.Files.GetFile("file");
            if (file is null)
                return Results.BadRequest(new { error = "No file uploaded. Field name: 'file'." });

            if (!file.FileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "Only .zip files are accepted." });

            await using var stream = file.OpenReadStream();
            var id = await plugins.InstallZipAsync(stream);
            return Results.Ok(new { id, message = $"Plugin '{id}' installed successfully." });
        }));

    app.MapDelete("/api/admin/plugins/{id}", (string id, PluginRegistry plugins) =>
        plugins.Unload(id)
            ? Results.Ok(new { message = $"Plugin '{id}' unloaded." })
            : Results.NotFound(new { error = $"Plugin '{id}' not found." }));

    // Dispatcher — handles all HTTP methods for plugin actions
    app.Map("/api/plugin/{moduleId}/{**action}", async (
        string moduleId,
        string action,
        HttpContext ctx,
        PluginRegistry plugins) =>
    {
        if (!plugins.TryGet(moduleId, out var module) || module is null)
            return Results.NotFound(new { error = $"Plugin '{moduleId}' is not loaded." });

        try
        {
            var actionParts = action.Split('/', 2, StringSplitOptions.RemoveEmptyEntries);
            if (actionParts.Length == 0)
                return Results.BadRequest(new { error = "Plugin action is required." });

            ctx.Request.RouteValues["pluginTail"] =
                actionParts.Length == 2 ? actionParts[1] : string.Empty;

            var result = await module.HandleAsync(actionParts[0], ctx.Request, ctx.RequestAborted);
            return Results.Ok(result);
        }
        catch (NotSupportedException ex) { return Results.BadRequest(new { error = ex.Message }); }
        catch (ArgumentException ex)     { return Results.BadRequest(new { error = ex.Message }); }
        catch (Exception ex)             { return Results.Problem(ex.Message); }
    });

    app.Lifetime.ApplicationStarted.Register(() =>
    {
        Console.WriteLine(isHostedByIis
            ? "Web UI running behind IIS."
            : "Web UI running at http://localhost:5100");
        Console.WriteLine("Press Ctrl+C to stop.");

        if (!isHostedByIis)
        {
            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("http://localhost:5100")
                {
                    UseShellExecute = true
                });
            }
            catch
            {
                // Opening the browser is optional.
            }
        }
    });

    await app.RunAsync();
}

public sealed record ModuleSettingsRequest(string[] Modules, PluginOrderRequest[]? Plugins);

public sealed record PluginOrderRequest(string Id, int NavOrder);

public sealed record RuntimeModuleSettings(string[] Modules);
