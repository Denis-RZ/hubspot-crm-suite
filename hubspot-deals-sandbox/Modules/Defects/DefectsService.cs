using HubSpotDealsSandbox.HubSpot.Models;

namespace HubSpotDealsSandbox.Modules.Defects;

/// <summary>
/// Self-contained module: unlike Deals/Contacts/Companies, this does not call
/// HubSpot. It keeps its own in-memory store so it can represent a
/// non-CRM domain (manufacturing QA / defect tracking) using the same
/// ICrmSandboxModule contract. This is the proof that the module system is
/// not HubSpot-specific - a new domain only needs a service + endpoints +
/// module descriptor that follow the same shape.
/// </summary>
public sealed class DefectsService
{
    private readonly Dictionary<string, HubSpotCrmRecord> _defects = new(StringComparer.OrdinalIgnoreCase);
    private int _nextId = 5001;
    private readonly object _lock = new();

    public static readonly IReadOnlyList<string> SeverityOptions =
        ["Low", "Medium", "High", "Critical"];

    public static readonly IReadOnlyList<string> StatusOptions =
        ["Open", "InReview", "Resolved"];

    public static readonly IReadOnlyList<string> SourceOptions =
        ["Manual", "VisionSystem"];

    public DefectsService()
    {
        Seed();
    }

    public Task<IReadOnlyDictionary<string, object?>> BuildBootstrapAsync(
        CancellationToken cancellationToken = default)
    {
        IReadOnlyDictionary<string, object?> result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["defects"] = ListAsync().Result,
            ["defectSeverityOptions"] = SeverityOptions,
            ["defectStatusOptions"] = StatusOptions,
            ["defectSourceOptions"] = SourceOptions,
        };

        return Task.FromResult(result);
    }

    public Task<IReadOnlyList<HubSpotCrmRecord>> ListAsync(
        int limit = 100,
        CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            IReadOnlyList<HubSpotCrmRecord> results = _defects.Values
                .OrderByDescending(record => record.Properties.GetValueOrDefault("detectedat"))
                .Take(limit <= 0 ? 100 : Math.Min(limit, 200))
                .ToArray();

            return Task.FromResult(results);
        }
    }

    public Task<HubSpotCrmRecord> CreateAsync(
        Dictionary<string, string?> properties,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(properties.GetValueOrDefault("sku")))
        {
            throw new ArgumentException("sku is required.");
        }
        if (string.IsNullOrWhiteSpace(properties.GetValueOrDefault("defecttype")))
        {
            throw new ArgumentException("defecttype is required.");
        }

        lock (_lock)
        {
            var id = Interlocked.Increment(ref _nextId).ToString();
            var merged = new Dictionary<string, string?>(properties, StringComparer.OrdinalIgnoreCase)
            {
                ["status"] = properties.GetValueOrDefault("status") is { Length: > 0 } s ? s : "Open",
                ["detectedat"] = properties.GetValueOrDefault("detectedat") is { Length: > 0 } d
                    ? d
                    : DateTimeOffset.UtcNow.ToString("O"),
            };

            var record = new HubSpotCrmRecord { Id = id, Properties = merged };
            _defects[id] = record;
            return Task.FromResult(record);
        }
    }

    public Task<HubSpotCrmRecord> UpdateAsync(
        string defectId,
        Dictionary<string, string?> properties,
        CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            if (!_defects.TryGetValue(defectId, out var existing))
            {
                throw new ArgumentException($"Defect '{defectId}' was not found.");
            }

            var merged = new Dictionary<string, string?>(existing.Properties, StringComparer.OrdinalIgnoreCase);
            foreach (var (key, value) in properties)
            {
                if (value is not null)
                {
                    merged[key] = value;
                }
            }

            var updated = new HubSpotCrmRecord { Id = defectId, Properties = merged };
            _defects[defectId] = updated;
            return Task.FromResult(updated);
        }
    }

    public Task DeleteAsync(string defectId, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            _defects.Remove(defectId);
            return Task.CompletedTask;
        }
    }

    private void Seed()
    {
        var now = DateTimeOffset.UtcNow;

        void Add(string sku, string station, string defectType, string severity, string status, string source, string reportedBy, TimeSpan agoOffset, string notes, string? companyId = null)
        {
            var id = Interlocked.Increment(ref _nextId).ToString();
            _defects[id] = new HubSpotCrmRecord
            {
                Id = id,
                Properties = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
                {
                    ["sku"] = sku,
                    ["station"] = station,
                    ["defecttype"] = defectType,
                    ["severity"] = severity,
                    ["status"] = status,
                    ["source"] = source,
                    ["reportedby"] = reportedBy,
                    ["detectedat"] = now.Subtract(agoOffset).ToString("O"),
                    ["notes"] = notes,
                    ["companyid"] = companyId,
                }
            };
        }

        // "40001"/"40002" match the seeded companies in LocalCrmStore - shows
        // the optional cross-module link without the two stores knowing about
        // each other beyond a plain id string.
        Add("PCB-4471", "Line 2 - AOI Station", "Solder bridge", "High", "Open", "VisionSystem", "AOI-Cam-02",
            TimeSpan.FromHours(3), "Flagged by automated optical inspection, pin 14-15 bridging.", "40001");
        Add("PCB-4471", "Line 2 - Final QC", "Missing component", "Critical", "InReview", "Manual", "Inspector: Wu",
            TimeSpan.FromHours(20), "C22 capacitor missing, held for rework before shipment.", "40001");
        Add("ENC-1187", "Line 1 - Housing Assembly", "Surface scratch", "Low", "Resolved", "Manual", "Inspector: Lin",
            TimeSpan.FromDays(2), "Cosmetic only, reworked with polishing pass.", "40002");
        Add("PCB-4502", "Line 2 - AOI Station", "Dimension mismatch", "Medium", "Open", "VisionSystem", "AOI-Cam-01",
            TimeSpan.FromHours(6), "Board outline 0.4mm out of tolerance, awaiting engineering review.");
    }
}
