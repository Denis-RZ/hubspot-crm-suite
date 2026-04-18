using System.Globalization;
using System.Reflection;
using System.Text.Json;
using HubSpotDealsSandbox;
using HubSpotDealsSandbox.HubSpot;
using HubSpotDealsSandbox.HubSpot.Models;
using HubSpotDealsSandbox.ImportExport;
using HubSpotDealsSandbox.Modules;

var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web)
{
    WriteIndented = true
};

var exitCode = await RunAsync(args);
return exitCode;

async Task<int> RunAsync(string[] args)
{
    if (args.Length == 0 || IsHelpCommand(args[0]))
    {
        PrintUsage();
        return 0;
    }

    var accessToken = Environment.GetEnvironmentVariable("HUBSPOT_ACCESS_TOKEN");
    if (string.IsNullOrWhiteSpace(accessToken))
    {
        Console.Error.WriteLine("Set HUBSPOT_ACCESS_TOKEN before running this sandbox.");
        return 1;
    }

    using var httpClient = new HttpClient();
    var client = new HubSpotDealsClient(httpClient, accessToken);

    try
    {
        switch (args[0].ToLowerInvariant())
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
                await RunWebAsync(accessToken);
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
                Console.Error.WriteLine($"Unknown command: {args[0]}");
                PrintUsage();
                return 1;
        }

        return 0;
    }
    catch (HubSpotApiException ex)
    {
        Console.Error.WriteLine(
            $"HubSpot API error ({ex.StatusCode}): {ex.Message}");

        if (!string.IsNullOrWhiteSpace(ex.ResponseBody))
        {
            Console.Error.WriteLine(ex.ResponseBody);
        }

        return 1;
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine(ex.Message);
        return 1;
    }
}

async Task ListDealsAsync(HubSpotDealsClient client, string[] args)
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

async Task GetDealAsync(HubSpotDealsClient client, string[] args)
{
    if (args.Length < 2)
    {
        throw new ArgumentException("get requires a deal id.");
    }

    var deal = await client.GetDealAsync(args[1]);
    Console.WriteLine(JsonSerializer.Serialize(deal, jsonOptions));
}

async Task CreateDealFromFileAsync(HubSpotDealsClient client, string[] args)
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

async Task UpdateDealFromFileAsync(HubSpotDealsClient client, string[] args)
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
async Task SearchDealsAsync(HubSpotDealsClient client, string[] args)
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
async Task AssociateDealAsync(HubSpotDealsClient client, string[] args)
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
async Task GetAssociationsAsync(HubSpotDealsClient client, string[] args)
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

void PrintUsage()
{
    Console.WriteLine(
        """
        HubSpot Deals sandbox

        Commands:
          dotnet run -- web
          dotnet run -- list [limit]
          dotnet run -- get <dealId>
          dotnet run -- create-from-file <jsonPath>
          dotnet run -- update-from-file <dealId> <jsonPath>
          dotnet run -- search <property> <operator> <value>
          dotnet run -- associate <dealId> <objectType> <objectId>
          dotnet run -- associations <dealId> <objectType>

        Required environment variable:
          HUBSPOT_ACCESS_TOKEN

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

async Task RunWebAsync(string accessToken)
{
    var builder = WebApplication.CreateBuilder(Array.Empty<string>());
    builder.WebHost.UseUrls("http://localhost:5100");
    builder.Logging.SetMinimumLevel(LogLevel.Warning);

    var enabledModules = CrmModuleCatalog.LoadEnabledModules(
        builder.Configuration,
        Assembly.GetExecutingAssembly());

    builder.Services.AddHttpClient("HubSpot");
    builder.Services.AddSingleton(sp =>
        new HubSpotDealsClient(
            sp.GetRequiredService<IHttpClientFactory>().CreateClient("HubSpot"),
            accessToken));
    builder.Services.AddSingleton(new ModuleAvailability(enabledModules));
    builder.Services.AddSingleton<CrmCsvService>();

    foreach (var module in enabledModules)
    {
        module.RegisterServices(builder.Services);
    }

    var app = builder.Build();

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
        Results.Ok(enabledModules.Select(module =>
            new EnabledModuleDescriptor(module.Id, module.Label, module.NavOrder))));

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
        string[] moduleIds,
        IWebHostEnvironment env,
        IHostApplicationLifetime lifetime) =>
    {
        if (moduleIds.Length == 0)
            return Results.BadRequest(new { error = "At least one module must be enabled." });

        var validIds = new HashSet<string>(allModules.Select(m => m.Id), StringComparer.OrdinalIgnoreCase);
        var unknown  = moduleIds.Where(id => !validIds.Contains(id)).ToArray();
        if (unknown.Length > 0)
            return Results.BadRequest(new { error = $"Unknown module(s): {string.Join(", ", unknown)}" });

        var settingsPath = Path.Combine(env.ContentRootPath, "appsettings.json");
        var json = System.Text.Json.JsonSerializer.Serialize(
            new { Modules = moduleIds },
            new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
        await File.WriteAllTextAsync(settingsPath, json);

        // Give the response time to reach the browser before shutting down
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
            foreach (var module in enabledModules)
            {
                var fragment = await module.BuildBootstrapAsync(scope.ServiceProvider, cancellationToken);
                foreach (var item in fragment)
                {
                    payload[item.Key] = item.Value;
                }
            }

            return Results.Ok(payload);
        }));

    app.MapGet("/api/export/{objectType}", async (
        string objectType,
        ModuleAvailability moduleAvailability,
        CrmCsvService csvService,
        HubSpotDealsClient client,
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
        HubSpotDealsClient client,
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
        HubSpotDealsClient client,
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

    app.Lifetime.ApplicationStarted.Register(() =>
    {
        Console.WriteLine("Web UI running at http://localhost:5100");
        Console.WriteLine("Press Ctrl+C to stop.");

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
    });

    await app.RunAsync();
}
