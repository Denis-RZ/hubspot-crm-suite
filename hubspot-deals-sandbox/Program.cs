using System.Globalization;
using System.Text.Json;
using HubSpotDealsSandbox;
using HubSpotDealsSandbox.HubSpot;
using HubSpotDealsSandbox.HubSpot.Models;

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
                await WebServer.RunAsync(accessToken);
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
