using System.Text.Json;
using System.Text.Json.Serialization;
using HubSpotDealsSandbox.HubSpot.Models;

namespace HubSpotDealsSandbox.Data;

/// <summary>
/// Fully self-contained CRM data layer - no external HubSpot account or
/// network call involved. Deals/contacts/companies, pipeline metadata,
/// property options, and associations all live in one JSON file on disk
/// and are loaded into memory on startup.
///
/// Public method names/signatures intentionally mirror what a real HubSpot
/// client would expose (ListDealsAsync, CreateContactAsync, AssociateDealAsync...)
/// so DealsService/ContactsService/CompaniesService/CrmCsvService did not need
/// to change - only what backs them did.
/// </summary>
public sealed class LocalCrmStore
{
    private static readonly JsonSerializerOptions FileJsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly string _filePath;
    private readonly object _lock = new();

    private readonly Dictionary<string, HubSpotDealRecord> _deals = new();
    private readonly Dictionary<string, HubSpotCrmRecord> _contacts = new();
    private readonly Dictionary<string, HubSpotCrmRecord> _companies = new();
    private readonly List<AssociationLink> _associations = new();

    private int _nextDealId = 90001;
    private int _nextContactId = 30001;
    private int _nextCompanyId = 40001;

    private static readonly IReadOnlyList<HubSpotPipeline> Pipelines =
    [
        new HubSpotPipeline
        {
            Id = "default",
            Label = "Sales Pipeline",
            Stages =
            [
                new HubSpotPipelineStage { Id = "appointmentscheduled", Label = "Appointment Scheduled" },
                new HubSpotPipelineStage { Id = "qualifiedtobuy", Label = "Qualified To Buy" },
                new HubSpotPipelineStage { Id = "presentationscheduled", Label = "Presentation Scheduled" },
                new HubSpotPipelineStage { Id = "decisionmakerboughtin", Label = "Decision Maker Bought-In" },
                new HubSpotPipelineStage { Id = "contractsent", Label = "Contract Sent" },
                new HubSpotPipelineStage { Id = "closedwon", Label = "Closed Won" },
                new HubSpotPipelineStage { Id = "closedlost", Label = "Closed Lost" },
            ]
        }
    ];

    private static readonly IReadOnlyList<HubSpotPropertyOption> CompanyIndustryOptions =
    [
        new HubSpotPropertyOption { Value = "COMPUTER_SOFTWARE", Label = "Computer Software", DisplayOrder = 0 },
        new HubSpotPropertyOption { Value = "MANUFACTURING", Label = "Manufacturing", DisplayOrder = 1 },
        new HubSpotPropertyOption { Value = "FINANCIAL_SERVICES", Label = "Financial Services", DisplayOrder = 2 },
        new HubSpotPropertyOption { Value = "LOGISTICS_AND_SUPPLY_CHAIN", Label = "Logistics & Supply Chain", DisplayOrder = 3 },
        new HubSpotPropertyOption { Value = "OTHER", Label = "Other", DisplayOrder = 4 },
    ];

    private static readonly IReadOnlyList<HubSpotPropertyOption> ContactLifecycleOptions =
    [
        new HubSpotPropertyOption { Value = "lead", Label = "Lead", DisplayOrder = 0 },
        new HubSpotPropertyOption { Value = "marketingqualifiedlead", Label = "Marketing Qualified Lead", DisplayOrder = 1 },
        new HubSpotPropertyOption { Value = "salesqualifiedlead", Label = "Sales Qualified Lead", DisplayOrder = 2 },
        new HubSpotPropertyOption { Value = "opportunity", Label = "Opportunity", DisplayOrder = 3 },
        new HubSpotPropertyOption { Value = "customer", Label = "Customer", DisplayOrder = 4 },
    ];

    public LocalCrmStore(string filePath)
    {
        _filePath = filePath;
        if (!LoadFromFile())
        {
            Seed();
            SaveToFile();
        }

        // Belt-and-suspenders: whatever path built the in-memory dictionaries
        // (fresh seed or a file saved by an older version of this store),
        // never let the next-id counters start at or below an id that
        // already exists - otherwise the next create silently overwrites it.
        _nextDealId = Math.Max(_nextDealId, MaxNumericId(_deals.Keys));
        _nextContactId = Math.Max(_nextContactId, MaxNumericId(_contacts.Keys));
        _nextCompanyId = Math.Max(_nextCompanyId, MaxNumericId(_companies.Keys));
    }

    private static int MaxNumericId(IEnumerable<string> ids) =>
        ids.Select(id => int.TryParse(id, out var n) ? n : 0).DefaultIfEmpty(0).Max();

    // ── Deals ────────────────────────────────────────────────────────────

    public Task<IReadOnlyList<HubSpotDealRecord>> ListDealsAsync(
        int limit = 10, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            IReadOnlyList<HubSpotDealRecord> results = _deals.Values
                .OrderByDescending(d => d.Properties.CreateDate)
                .Take(NormalizeLimit(limit))
                .ToArray();
            return Task.FromResult(results);
        }
    }

    public Task<HubSpotDealRecord> GetDealAsync(string dealId, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            if (!_deals.TryGetValue(dealId, out var deal))
            {
                throw new ArgumentException($"Deal '{dealId}' was not found.");
            }
            return Task.FromResult(deal);
        }
    }

    public Task<HubSpotDealRecord> CreateDealAsync(
        HubSpotDealMutationRequest request, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            var id = Interlocked.Increment(ref _nextDealId).ToString();
            var now = DateTimeOffset.UtcNow.ToString("O");
            var properties = MergeDealProperties(new HubSpotDealProperties(), request.Properties);
            properties = properties with { CreateDate = now, LastModifiedDate = now };

            var record = new HubSpotDealRecord { Id = id, Properties = properties };
            _deals[id] = record;
            SaveToFile();
            return Task.FromResult(record);
        }
    }

    public Task<HubSpotDealRecord> UpdateDealAsync(
        string dealId, HubSpotDealMutationRequest request, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            if (!_deals.TryGetValue(dealId, out var existing))
            {
                throw new ArgumentException($"Deal '{dealId}' was not found.");
            }

            var merged = MergeDealProperties(existing.Properties, request.Properties) with
            {
                LastModifiedDate = DateTimeOffset.UtcNow.ToString("O")
            };
            var updated = new HubSpotDealRecord { Id = dealId, Properties = merged };
            _deals[dealId] = updated;
            SaveToFile();
            return Task.FromResult(updated);
        }
    }

    public Task DeleteDealAsync(string dealId, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            _deals.Remove(dealId);
            _associations.RemoveAll(a => (a.FromType == "deals" && a.FromId == dealId) || (a.ToType == "deals" && a.ToId == dealId));
            SaveToFile();
            return Task.CompletedTask;
        }
    }

    public Task<IReadOnlyList<HubSpotPipeline>> GetDealPipelinesAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(Pipelines);

    // Local, in-memory equivalent of a HubSpot search call: same filter/operator
    // semantics (EQ/NEQ/LT/LTE/GT/GTE/HAS_PROPERTY/NOT_HAS_PROPERTY/CONTAINS_TOKEN),
    // evaluated against the deal dictionary instead of a remote index.
    public Task<IReadOnlyList<HubSpotDealRecord>> SearchDealsAsync(
        HubSpotSearchRequest request, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            bool MatchesGroup(HubSpotDealRecord deal, HubSpotFilterGroup group) =>
                group.Filters.All(filter => MatchesFilter(deal, filter));

            IReadOnlyList<HubSpotDealRecord> results = _deals.Values
                .Where(deal => request.FilterGroups.Count == 0 || request.FilterGroups.Any(g => MatchesGroup(deal, g)))
                .Take(request.Limit <= 0 ? 10 : request.Limit)
                .ToArray();
            return Task.FromResult(results);
        }
    }

    // ── Contacts ─────────────────────────────────────────────────────────

    public Task<IReadOnlyList<HubSpotCrmRecord>> ListContactsAsync(
        int limit = 100, CancellationToken cancellationToken = default) =>
        ListRecordsAsync(_contacts, limit);

    public Task<HubSpotCrmRecord> CreateContactAsync(
        HubSpotCrmMutationRequest request, CancellationToken cancellationToken = default)
    {
        EnsureEmailNotTaken(request.Properties.GetValueOrDefault("email"), excludeId: null);
        return CreateRecordAsync(_contacts, () => Interlocked.Increment(ref _nextContactId).ToString(), request);
    }

    public Task<HubSpotCrmRecord> UpdateContactAsync(
        string contactId, HubSpotCrmMutationRequest request, CancellationToken cancellationToken = default)
    {
        if (request.Properties.TryGetValue("email", out var email) && !string.IsNullOrWhiteSpace(email))
        {
            EnsureEmailNotTaken(email, excludeId: contactId);
        }
        return UpdateRecordAsync(_contacts, contactId, request, "Contact");
    }

    // Email is the contact's unique key - HubSpot enforces this server-side,
    // and this local store enforces the same rule so the "duplicate email"
    // validation-error UX still has something real to show.
    private void EnsureEmailNotTaken(string? email, string? excludeId)
    {
        if (string.IsNullOrWhiteSpace(email))
        {
            return;
        }

        lock (_lock)
        {
            var taken = _contacts.Values.Any(c =>
                c.Id != excludeId &&
                string.Equals(c.Properties.GetValueOrDefault("email"), email, StringComparison.OrdinalIgnoreCase));

            if (taken)
            {
                throw new ArgumentException($"Contact email '{email}' already exists.");
            }
        }
    }

    public Task DeleteContactAsync(string contactId, CancellationToken cancellationToken = default) =>
        DeleteRecordAsync(_contacts, "contacts", contactId);

    // ── Companies ────────────────────────────────────────────────────────

    public Task<IReadOnlyList<HubSpotCrmRecord>> ListCompaniesAsync(
        int limit = 100, CancellationToken cancellationToken = default) =>
        ListRecordsAsync(_companies, limit);

    public Task<HubSpotCrmRecord> CreateCompanyAsync(
        HubSpotCrmMutationRequest request, CancellationToken cancellationToken = default) =>
        CreateRecordAsync(_companies, () => Interlocked.Increment(ref _nextCompanyId).ToString(), request);

    public Task<HubSpotCrmRecord> UpdateCompanyAsync(
        string companyId, HubSpotCrmMutationRequest request, CancellationToken cancellationToken = default) =>
        UpdateRecordAsync(_companies, companyId, request, "Company");

    public Task DeleteCompanyAsync(string companyId, CancellationToken cancellationToken = default) =>
        DeleteRecordAsync(_companies, "companies", companyId);

    // ── Property options ─────────────────────────────────────────────────

    public Task<IReadOnlyList<HubSpotPropertyOption>> GetCompanyIndustryOptionsAsync(
        CancellationToken cancellationToken = default) =>
        Task.FromResult(CompanyIndustryOptions);

    public Task<IReadOnlyList<HubSpotPropertyOption>> GetContactLifecycleOptionsAsync(
        CancellationToken cancellationToken = default) =>
        Task.FromResult(ContactLifecycleOptions);

    // ── Associations ─────────────────────────────────────────────────────

    public Task AssociateDealAsync(
        string dealId, string toObjectType, string toObjectId, CancellationToken cancellationToken = default)
    {
        var normalized = NormalizeType(toObjectType);
        lock (_lock)
        {
            if (!_deals.ContainsKey(dealId))
            {
                throw new ArgumentException($"Deal '{dealId}' was not found.");
            }
            Link("deals", dealId, normalized, toObjectId);
            SaveToFile();
        }
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<HubSpotAssociationRecord>> GetDealAssociationsAsync(
        string dealId, string toObjectType, CancellationToken cancellationToken = default) =>
        GetObjectAssociationsAsync("deals", dealId, toObjectType, cancellationToken);

    public Task<IReadOnlyList<HubSpotAssociationRecord>> GetObjectAssociationsAsync(
        string fromObjectType, string objectId, string toObjectType, CancellationToken cancellationToken = default)
    {
        var fromType = NormalizeType(fromObjectType);
        var toType = NormalizeType(toObjectType);
        lock (_lock)
        {
            IReadOnlyList<HubSpotAssociationRecord> results = _associations
                .Where(a => a.FromType == fromType && a.FromId == objectId && a.ToType == toType)
                .Select(a => new HubSpotAssociationRecord { Id = a.ToId, Type = $"{Singular(fromType)}_to_{Singular(toType)}" })
                .ToArray();
            return Task.FromResult(results);
        }
    }

    // ── Internals ────────────────────────────────────────────────────────

    private bool MatchesFilter(HubSpotDealRecord deal, HubSpotFilter filter)
    {
        var actual = filter.PropertyName.ToLowerInvariant() switch
        {
            "dealname" => deal.Properties.DealName,
            "amount" => deal.Properties.Amount,
            "dealstage" => deal.Properties.DealStage,
            "pipeline" => deal.Properties.Pipeline,
            "closedate" => deal.Properties.CloseDate,
            "createdate" => deal.Properties.CreateDate,
            _ => null,
        };

        return filter.Operator.ToUpperInvariant() switch
        {
            "HAS_PROPERTY" => !string.IsNullOrWhiteSpace(actual),
            "NOT_HAS_PROPERTY" => string.IsNullOrWhiteSpace(actual),
            "EQ" => string.Equals(actual, filter.Value, StringComparison.OrdinalIgnoreCase),
            "NEQ" => !string.Equals(actual, filter.Value, StringComparison.OrdinalIgnoreCase),
            "CONTAINS_TOKEN" => actual is not null && filter.Value is not null &&
                actual.Contains(filter.Value, StringComparison.OrdinalIgnoreCase),
            "LT" or "LTE" or "GT" or "GTE" => CompareNumeric(actual, filter.Value, filter.Operator.ToUpperInvariant()),
            _ => true,
        };
    }

    private static bool CompareNumeric(string? actual, string? expected, string op)
    {
        if (!double.TryParse(actual, out var a) || !double.TryParse(expected, out var b))
        {
            return false;
        }
        return op switch
        {
            "LT" => a < b,
            "LTE" => a <= b,
            "GT" => a > b,
            "GTE" => a >= b,
            _ => false,
        };
    }

    private Task<IReadOnlyList<HubSpotCrmRecord>> ListRecordsAsync(
        Dictionary<string, HubSpotCrmRecord> store, int limit)
    {
        lock (_lock)
        {
            IReadOnlyList<HubSpotCrmRecord> results = store.Values
                .Take(NormalizeLimit(limit))
                .ToArray();
            return Task.FromResult(results);
        }
    }

    private Task<HubSpotCrmRecord> CreateRecordAsync(
        Dictionary<string, HubSpotCrmRecord> store,
        Func<string> nextId,
        HubSpotCrmMutationRequest request)
    {
        lock (_lock)
        {
            var id = nextId();
            var record = new HubSpotCrmRecord
            {
                Id = id,
                Properties = new Dictionary<string, string?>(request.Properties, StringComparer.OrdinalIgnoreCase),
            };
            store[id] = record;
            SaveToFile();
            return Task.FromResult(record);
        }
    }

    private Task<HubSpotCrmRecord> UpdateRecordAsync(
        Dictionary<string, HubSpotCrmRecord> store,
        string id,
        HubSpotCrmMutationRequest request,
        string kind)
    {
        lock (_lock)
        {
            if (!store.TryGetValue(id, out var existing))
            {
                throw new ArgumentException($"{kind} '{id}' was not found.");
            }

            var merged = new Dictionary<string, string?>(existing.Properties, StringComparer.OrdinalIgnoreCase);
            foreach (var (key, value) in request.Properties)
            {
                if (value is not null)
                {
                    merged[key] = value;
                }
            }

            var updated = new HubSpotCrmRecord { Id = id, Properties = merged };
            store[id] = updated;
            SaveToFile();
            return Task.FromResult(updated);
        }
    }

    private Task DeleteRecordAsync(Dictionary<string, HubSpotCrmRecord> store, string objectType, string id)
    {
        lock (_lock)
        {
            store.Remove(id);
            _associations.RemoveAll(a => (a.FromType == objectType && a.FromId == id) || (a.ToType == objectType && a.ToId == id));
            SaveToFile();
            return Task.CompletedTask;
        }
    }

    private void Link(string fromType, string fromId, string toType, string toId)
    {
        if (!_associations.Any(a => a.FromType == fromType && a.FromId == fromId && a.ToType == toType && a.ToId == toId))
        {
            _associations.Add(new AssociationLink(fromType, fromId, toType, toId));
        }
        if (!_associations.Any(a => a.FromType == toType && a.FromId == toId && a.ToType == fromType && a.ToId == fromId))
        {
            _associations.Add(new AssociationLink(toType, toId, fromType, fromId));
        }
    }

    private static string NormalizeType(string type) => type.Trim().ToLowerInvariant() switch
    {
        "deal" => "deals",
        "contact" => "contacts",
        "company" => "companies",
        var other => other,
    };

    private static string Singular(string type) => type switch
    {
        "companies" => "company",
        "deals" => "deal",
        "contacts" => "contact",
        "defects" => "defect",
        _ => type.TrimEnd('s'),
    };

    private static int NormalizeLimit(int limit) => limit <= 0 ? 10 : Math.Min(limit, 500);

    private static HubSpotDealProperties MergeDealProperties(
        HubSpotDealProperties current, Dictionary<string, string?> patch)
    {
        string? Get(string key) => patch.TryGetValue(key, out var v) ? v : null;

        return current with
        {
            DealName = Get("dealname") ?? current.DealName,
            Amount = Get("amount") ?? current.Amount,
            DealStage = Get("dealstage") ?? current.DealStage,
            Pipeline = Get("pipeline") ?? current.Pipeline,
            CloseDate = Get("closedate") ?? current.CloseDate,
        };
    }

    private void Seed()
    {
        var now = DateTimeOffset.UtcNow;

        _companies["40001"] = new HubSpotCrmRecord
        {
            Id = "40001",
            Properties = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
            {
                ["name"] = "Northwind Data Systems", ["domain"] = "northwind.example",
                ["city"] = "Taoyuan", ["industry"] = "COMPUTER_SOFTWARE",
            }
        };
        _companies["40002"] = new HubSpotCrmRecord
        {
            Id = "40002",
            Properties = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
            {
                ["name"] = "Contoso Thermal Labs", ["domain"] = "contoso.example",
                ["city"] = "Taipei", ["industry"] = "MANUFACTURING",
            }
        };

        _contacts["30001"] = new HubSpotCrmRecord
        {
            Id = "30001",
            Properties = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
            {
                ["email"] = "alice.chen@northwind.example", ["firstname"] = "Alice", ["lastname"] = "Chen",
                ["phone"] = "+886-3-555-0101", ["lifecyclestage"] = "lead",
            }
        };
        _contacts["30002"] = new HubSpotCrmRecord
        {
            Id = "30002",
            Properties = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
            {
                ["email"] = "ben.hsu@contoso.example", ["firstname"] = "Ben", ["lastname"] = "Hsu",
                ["phone"] = "+886-2-555-0147", ["lifecyclestage"] = "marketingqualifiedlead",
            }
        };

        _deals["90001"] = new HubSpotDealRecord
        {
            Id = "90001",
            Properties = new HubSpotDealProperties
            {
                DealName = "AI rack liquid cooling retrofit", Amount = "45000",
                DealStage = "qualifiedtobuy", Pipeline = "default",
                CloseDate = now.AddDays(20).ToString("O"), CreateDate = now.AddDays(-10).ToString("O"),
                LastModifiedDate = now.AddDays(-6).ToString("O"),
            }
        };
        _deals["90002"] = new HubSpotDealRecord
        {
            Id = "90002",
            Properties = new HubSpotDealProperties
            {
                DealName = "Prototype cold-plate evaluation", Amount = "18000",
                DealStage = "presentationscheduled", Pipeline = "default",
                CloseDate = now.AddDays(14).ToString("O"), CreateDate = now.AddDays(-9).ToString("O"),
                LastModifiedDate = now.AddDays(-5).ToString("O"),
            }
        };

        Link("deals", "90001", "contacts", "30001");
        Link("deals", "90001", "companies", "40001");
        Link("deals", "90002", "contacts", "30002");
        Link("deals", "90002", "companies", "40002");
        Link("contacts", "30001", "companies", "40001");
        Link("contacts", "30002", "companies", "40002");
    }

    private bool LoadFromFile()
    {
        if (!File.Exists(_filePath))
        {
            return false;
        }

        // The file exists. From here on, any failure is reported loudly instead
        // of being swallowed - silently falling back to a fresh seed would look
        // like the app "worked" while quietly discarding whatever was on disk.
        string json;
        try
        {
            json = File.ReadAllText(_filePath);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            throw new InvalidOperationException(
                $"Found '{_filePath}' but could not read it. Check that the application " +
                $"has read permission to this folder (App_Data), or check for a lock from " +
                $"another process. Underlying error: {ex.Message}", ex);
        }

        StoreSnapshot? snapshot;
        try
        {
            snapshot = JsonSerializer.Deserialize<StoreSnapshot>(json, FileJsonOptions);
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException(
                $"'{_filePath}' exists but is not valid JSON - it may be corrupted or was " +
                $"hand-edited incorrectly. Fix it, restore it from a backup, or delete it to " +
                $"start fresh (this discards existing data). Underlying error: {ex.Message}", ex);
        }

        if (snapshot is null)
        {
            return false;
        }

        foreach (var d in snapshot.Deals) _deals[d.Id] = d;
        foreach (var c in snapshot.Contacts) _contacts[c.Id] = c;
        foreach (var c in snapshot.Companies) _companies[c.Id] = c;
        _associations.AddRange(snapshot.Associations);
        _nextDealId = snapshot.NextDealId;
        _nextContactId = snapshot.NextContactId;
        _nextCompanyId = snapshot.NextCompanyId;
        return true;
    }

    private void SaveToFile()
    {
        var snapshot = new StoreSnapshot
        {
            Deals = _deals.Values.ToList(),
            Contacts = _contacts.Values.ToList(),
            Companies = _companies.Values.ToList(),
            Associations = _associations.ToList(),
            NextDealId = _nextDealId,
            NextContactId = _nextContactId,
            NextCompanyId = _nextCompanyId,
        };

        var directory = Path.GetDirectoryName(_filePath);
        var json = JsonSerializer.Serialize(snapshot, FileJsonOptions);

        try
        {
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            File.WriteAllText(_filePath, json);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            throw new InvalidOperationException(
                $"Could not save to '{_filePath}'. Grant write permission to this folder " +
                $"(App_Data) for the account running the app - on IIS that is usually the " +
                $"application pool identity. The change was not saved. " +
                $"Underlying error: {ex.Message}", ex);
        }
    }

    private sealed record AssociationLink(string FromType, string FromId, string ToType, string ToId);

    private sealed class StoreSnapshot
    {
        public List<HubSpotDealRecord> Deals { get; set; } = [];
        public List<HubSpotCrmRecord> Contacts { get; set; } = [];
        public List<HubSpotCrmRecord> Companies { get; set; } = [];
        public List<AssociationLink> Associations { get; set; } = [];
        public int NextDealId { get; set; } = 90001;
        public int NextContactId { get; set; } = 30001;
        public int NextCompanyId { get; set; } = 40001;
    }
}
