using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using HubSpotSandbox.Plugin.Abstractions;
using Microsoft.AspNetCore.Http;

namespace HubSpotPlugin.DealAudit;

public sealed class DealAuditModule : IPluginModule
{
    private const int DefaultLimit = 100;
    private const int MaxLimit = 250;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public string Id => "deal-audit";

    public string Label => "Audit";

    public int NavOrder => 80;

    public async Task<object?> HandleAsync(string action, HttpRequest request, CancellationToken ct)
    {
        return action.ToLowerInvariant() switch
        {
            "run" => await RunAuditAsync(request, ct),
            "export" => await ExportAuditAsync(request, ct),
            _ => throw new NotSupportedException($"Unknown deal-audit action '{action}'.")
        };
    }

    private static async Task<AuditReport> RunAuditAsync(HttpRequest request, CancellationToken ct)
    {
        var limit = ReadLimit(request);
        using var client = CreateHubSpotClient();

        var deals = await ListPagedObjectsAsync<CrmObject>(
            client,
            "crm/v3/objects/deals",
            ["dealname", "amount", "dealstage", "pipeline", "closedate", "createdate", "hs_lastmodifieddate"],
            limit,
            ct);

        var rows = new List<DealAuditRow>(deals.Count);
        foreach (var deal in deals)
        {
            var contactCountTask = CountAssociationsAsync(client, deal.Id, "contacts", ct);
            var companyCountTask = CountAssociationsAsync(client, deal.Id, "companies", ct);
            await Task.WhenAll(contactCountTask, companyCountTask);

            rows.Add(BuildRow(deal, contactCountTask.Result, companyCountTask.Result));
        }

        var summary = new AuditSummary(
            DealsScanned: rows.Count,
            CleanDeals: rows.Count(row => row.Issues.Count == 0),
            MissingContacts: rows.Count(row => row.ContactCount == 0),
            MissingCompanies: rows.Count(row => row.CompanyCount == 0),
            MissingAmount: rows.Count(row => HasIssue(row, "missing_amount")),
            MissingCloseDate: rows.Count(row => HasIssue(row, "missing_close_date")),
            HighRiskDeals: rows.Count(row => row.Severity == "high"),
            AverageScore: rows.Count == 0 ? 100 : Math.Round(rows.Average(row => row.Score), 1));

        return new AuditReport(
            GeneratedAtUtc: DateTimeOffset.UtcNow,
            Limit: limit,
            Summary: summary,
            Rows: rows
                .OrderBy(row => SeverityRank(row.Severity))
                .ThenBy(row => row.Score)
                .ThenBy(row => row.Name, StringComparer.OrdinalIgnoreCase)
                .ToArray());
    }

    private static async Task<object> ExportAuditAsync(HttpRequest request, CancellationToken ct)
    {
        var report = await RunAuditAsync(request, ct);
        return new
        {
            fileName = $"deal-quality-audit-{DateTime.UtcNow:yyyyMMdd-HHmmss}.csv",
            contentType = "text/csv;charset=utf-8",
            csv = BuildCsv(report)
        };
    }

    private static DealAuditRow BuildRow(CrmObject deal, int contactCount, int companyCount)
    {
        var props = deal.Properties;
        var name = Value(props, "dealname", $"Deal {deal.Id}");
        var stage = Value(props, "dealstage", "");
        var pipeline = Value(props, "pipeline", "");
        var amount = Value(props, "amount", "");
        var closeDate = Value(props, "closedate", "");
        var lastModified = Value(props, "hs_lastmodifieddate", "");
        var issues = new List<AuditIssue>();

        if (contactCount == 0)
        {
            issues.Add(new("missing_contact", "Missing contact", "No contact is associated with this deal.", 20));
        }

        if (companyCount == 0)
        {
            issues.Add(new("missing_company", "Missing company", "No company is associated with this deal.", 15));
        }

        if (string.IsNullOrWhiteSpace(amount))
        {
            issues.Add(new("missing_amount", "Missing amount", "Deal amount is empty.", 15));
        }
        else if (!decimal.TryParse(amount, NumberStyles.Number, CultureInfo.InvariantCulture, out _))
        {
            issues.Add(new("invalid_amount", "Invalid amount", "Deal amount is not numeric.", 10));
        }

        if (string.IsNullOrWhiteSpace(closeDate))
        {
            issues.Add(new("missing_close_date", "Missing close date", "Close date is empty.", 10));
        }

        if (string.IsNullOrWhiteSpace(stage))
        {
            issues.Add(new("missing_stage", "Missing stage", "Deal stage is empty.", 15));
        }

        if (string.IsNullOrWhiteSpace(pipeline))
        {
            issues.Add(new("missing_pipeline", "Missing pipeline", "Pipeline is empty.", 10));
        }

        if (IsLateStage(stage) && contactCount == 0)
        {
            issues.Add(new("late_stage_without_contact", "Late-stage deal without contact", "A late-stage deal should have a known contact.", 20));
        }

        if (IsClosedStage(stage) && string.IsNullOrWhiteSpace(amount))
        {
            issues.Add(new("closed_without_amount", "Closed deal without amount", "Closed deals should have a final amount.", 20));
        }

        if (IsStaleOpenDeal(stage, lastModified))
        {
            issues.Add(new("stale_open_deal", "Stale open deal", "Open deal has not been modified in 30+ days.", 10));
        }

        var score = Math.Max(0, 100 - issues.Sum(issue => issue.Weight));
        var severity = score < 60 ? "high" : score < 85 ? "medium" : issues.Count == 0 ? "clean" : "low";

        return new DealAuditRow(
            Id: deal.Id,
            Name: name,
            Stage: stage,
            Pipeline: pipeline,
            Amount: amount,
            CloseDate: closeDate,
            ContactCount: contactCount,
            CompanyCount: companyCount,
            Score: score,
            Severity: severity,
            Issues: issues);
    }

    private static async Task<int> CountAssociationsAsync(
        HttpClient client,
        string dealId,
        string toObjectType,
        CancellationToken ct)
    {
        var response = await SendAsync<ListResponse<AssociationRecord>>(
            client,
            $"crm/v3/objects/deals/{Uri.EscapeDataString(dealId)}/associations/{toObjectType}",
            ct);

        return response.Results.Count;
    }

    private static async Task<IReadOnlyList<T>> ListPagedObjectsAsync<T>(
        HttpClient client,
        string routeBase,
        IReadOnlyList<string> properties,
        int limit,
        CancellationToken ct)
    {
        var results = new List<T>(Math.Min(limit, 100));
        var remaining = limit;
        string? after = null;

        while (remaining > 0)
        {
            var pageSize = Math.Min(remaining, 100);
            var route = new StringBuilder(routeBase)
                .Append("?archived=false")
                .Append("&limit=").Append(pageSize)
                .Append("&properties=").Append(Uri.EscapeDataString(string.Join(",", properties)));

            if (!string.IsNullOrWhiteSpace(after))
            {
                route.Append("&after=").Append(Uri.EscapeDataString(after));
            }

            var page = await SendAsync<ListResponse<T>>(client, route.ToString(), ct);
            results.AddRange(page.Results);

            if (page.Results.Count == 0 || string.IsNullOrWhiteSpace(page.Paging?.Next?.After))
            {
                break;
            }

            remaining -= page.Results.Count;
            after = page.Paging.Next.After;
        }

        return results;
    }

    private static async Task<T> SendAsync<T>(HttpClient client, string route, CancellationToken ct)
    {
        using var response = await client.GetAsync(route, ct);
        var body = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            var message = ExtractHubSpotError(body) ?? response.ReasonPhrase ?? "HubSpot request failed.";
            throw new InvalidOperationException($"HubSpot API error {(int)response.StatusCode}: {message}");
        }

        return JsonSerializer.Deserialize<T>(body, JsonOptions)
            ?? throw new InvalidOperationException("HubSpot returned an empty response body.");
    }

    private static HttpClient CreateHubSpotClient()
    {
        var token = Environment.GetEnvironmentVariable("HUBSPOT_ACCESS_TOKEN");
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new InvalidOperationException("HUBSPOT_ACCESS_TOKEN is not set.");
        }

        var client = new HttpClient
        {
            BaseAddress = new Uri("https://api.hubapi.com/")
        };
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        client.DefaultRequestHeaders.UserAgent.ParseAdd("HubSpotDealAuditPlugin/1.0");
        return client;
    }

    private static int ReadLimit(HttpRequest request)
    {
        var raw = request.Query["limit"].FirstOrDefault();
        if (!int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var limit))
        {
            return DefaultLimit;
        }

        return Math.Clamp(limit, 1, MaxLimit);
    }

    private static string BuildCsv(AuditReport report)
    {
        var rows = new List<string>
        {
            CsvRow(["deal_id", "deal_name", "stage", "pipeline", "amount", "close_date", "contacts", "companies", "score", "severity", "issues"])
        };

        rows.AddRange(report.Rows.Select(row => CsvRow([
            row.Id,
            row.Name,
            row.Stage,
            row.Pipeline,
            row.Amount,
            row.CloseDate,
            row.ContactCount.ToString(CultureInfo.InvariantCulture),
            row.CompanyCount.ToString(CultureInfo.InvariantCulture),
            row.Score.ToString(CultureInfo.InvariantCulture),
            row.Severity,
            string.Join("; ", row.Issues.Select(issue => issue.Label))
        ])));

        return string.Join("\r\n", rows);
    }

    private static string CsvRow(IEnumerable<string> values) =>
        string.Join(",", values.Select(value => $"\"{value.Replace("\"", "\"\"", StringComparison.Ordinal)}\""));

    private static string Value(Dictionary<string, string?> properties, string key, string fallback) =>
        properties.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value)
            ? value
            : fallback;

    private static bool HasIssue(DealAuditRow row, string code) =>
        row.Issues.Any(issue => issue.Code == code);

    private static bool IsClosedStage(string stage) =>
        stage.Contains("closed", StringComparison.OrdinalIgnoreCase);

    private static bool IsLateStage(string stage)
    {
        var normalized = stage.Replace("_", "", StringComparison.OrdinalIgnoreCase)
            .Replace("-", "", StringComparison.OrdinalIgnoreCase)
            .Replace(" ", "", StringComparison.OrdinalIgnoreCase);

        return normalized.Contains("contract", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("decision", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("presentation", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("closed", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsStaleOpenDeal(string stage, string lastModified)
    {
        if (IsClosedStage(stage))
        {
            return false;
        }

        return DateTimeOffset.TryParse(lastModified, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed)
            && DateTimeOffset.UtcNow - parsed > TimeSpan.FromDays(30);
    }

    private static int SeverityRank(string severity) =>
        severity switch
        {
            "high" => 0,
            "medium" => 1,
            "low" => 2,
            _ => 3
        };

    private static string? ExtractHubSpotError(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            return doc.RootElement.TryGetProperty("message", out var message)
                ? message.GetString()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private sealed record ListResponse<T>(
        [property: JsonPropertyName("results")] List<T> Results,
        [property: JsonPropertyName("paging")] Paging? Paging);

    private sealed record Paging([property: JsonPropertyName("next")] PagingNext? Next);

    private sealed record PagingNext([property: JsonPropertyName("after")] string? After);

    private sealed record CrmObject(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("properties")] Dictionary<string, string?> Properties);

    private sealed record AssociationRecord([property: JsonPropertyName("id")] string Id);

    private sealed record AuditReport(
        DateTimeOffset GeneratedAtUtc,
        int Limit,
        AuditSummary Summary,
        IReadOnlyList<DealAuditRow> Rows);

    private sealed record AuditSummary(
        int DealsScanned,
        int CleanDeals,
        int MissingContacts,
        int MissingCompanies,
        int MissingAmount,
        int MissingCloseDate,
        int HighRiskDeals,
        double AverageScore);

    private sealed record DealAuditRow(
        string Id,
        string Name,
        string Stage,
        string Pipeline,
        string Amount,
        string CloseDate,
        int ContactCount,
        int CompanyCount,
        int Score,
        string Severity,
        IReadOnlyList<AuditIssue> Issues);

    private sealed record AuditIssue(string Code, string Label, string Description, int Weight);
}
