using System.Text.Json;
using System.Text.Json.Serialization;

namespace HubSpotDealsSandbox.HubSpot.Models;

public sealed class HubSpotListResponse<T>
{
    [JsonPropertyName("results")]
    public List<T> Results { get; init; } = [];

    [JsonPropertyName("paging")]
    public HubSpotPaging? Paging { get; init; }
}

public sealed class HubSpotPaging
{
    [JsonPropertyName("next")]
    public HubSpotPagingNext? Next { get; init; }
}

public sealed class HubSpotPagingNext
{
    [JsonPropertyName("after")]
    public string? After { get; init; }

    [JsonPropertyName("link")]
    public string? Link { get; init; }
}

public sealed class HubSpotDealRecord
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [JsonPropertyName("archived")]
    public bool Archived { get; init; }

    [JsonPropertyName("properties")]
    public HubSpotDealProperties Properties { get; init; } = new();
}

public sealed record HubSpotDealProperties
{
    [JsonPropertyName("dealname")]
    public string? DealName { get; init; }

    [JsonPropertyName("amount")]
    public string? Amount { get; init; }

    [JsonPropertyName("dealstage")]
    public string? DealStage { get; init; }

    [JsonPropertyName("pipeline")]
    public string? Pipeline { get; init; }

    [JsonPropertyName("closedate")]
    public string? CloseDate { get; init; }

    [JsonPropertyName("createdate")]
    public string? CreateDate { get; init; }

    [JsonPropertyName("hs_lastmodifieddate")]
    public string? LastModifiedDate { get; init; }
}

public sealed class HubSpotDealMutationRequest
{
    [JsonPropertyName("properties")]
    public Dictionary<string, string?> Properties { get; init; } = [];
}

public sealed class HubSpotPipelineListResponse
{
    [JsonPropertyName("results")]
    public List<HubSpotPipeline> Results { get; init; } = [];
}

public sealed class HubSpotPipeline
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [JsonPropertyName("label")]
    public string Label { get; init; } = string.Empty;

    [JsonPropertyName("stages")]
    public List<HubSpotPipelineStage> Stages { get; init; } = [];
}

public sealed class HubSpotPipelineStage
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [JsonPropertyName("label")]
    public string Label { get; init; } = string.Empty;
}

public sealed class HubSpotCrmRecord
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [JsonPropertyName("archived")]
    public bool Archived { get; init; }

    [JsonPropertyName("properties")]
    public Dictionary<string, string?> Properties { get; init; } = [];
}

public sealed class HubSpotCrmMutationRequest
{
    [JsonPropertyName("properties")]
    public Dictionary<string, string?> Properties { get; init; } = [];
}

public sealed class HubSpotPropertyDefinition
{
    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("label")]
    public string Label { get; init; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; init; } = string.Empty;

    [JsonPropertyName("fieldType")]
    public string FieldType { get; init; } = string.Empty;

    [JsonPropertyName("options")]
    public List<HubSpotPropertyOption> Options { get; init; } = [];
}

public sealed class HubSpotPropertyOption
{
    [JsonPropertyName("label")]
    public string Label { get; init; } = string.Empty;

    [JsonPropertyName("value")]
    public string Value { get; init; } = string.Empty;

    [JsonPropertyName("displayOrder")]
    public int DisplayOrder { get; init; }
}

// ─── Search models ────────────────────────────────────────────────────────

// Full request body sent to POST /crm/v3/objects/deals/search.
//
// HubSpot uses a two-level filter model:
//   FilterGroups  →  OR  (any group can match)
//   Filters       →  AND (all filters inside one group must match)
//
// Example: find deals where stage=closed AND amount>1000
//   one FilterGroup with two Filters inside it.
public sealed class HubSpotSearchRequest
{
    [JsonPropertyName("filterGroups")]
    public List<HubSpotFilterGroup> FilterGroups { get; init; } = [];

    // Which properties to include in each returned deal record.
    [JsonPropertyName("properties")]
    public List<string> Properties { get; init; } =
    [
        "dealname", "amount", "dealstage", "pipeline", "closedate", "createdate"
    ];

    [JsonPropertyName("limit")]
    public int Limit { get; init; } = 10;

    // Optional sort — most-recent first by default.
    [JsonPropertyName("sorts")]
    public List<HubSpotSearchSort> Sorts { get; init; } =
    [
        new HubSpotSearchSort { PropertyName = "createdate", Direction = "DESCENDING" }
    ];
}

// One group of filters — all filters inside are AND-ed together.
public sealed class HubSpotFilterGroup
{
    [JsonPropertyName("filters")]
    public List<HubSpotFilter> Filters { get; init; } = [];
}

public sealed class HubSpotFilter
{
    // HubSpot internal property name, e.g. "dealstage", "amount", "dealname".
    [JsonPropertyName("propertyName")]
    public string PropertyName { get; init; } = string.Empty;

    // Comparison operator.
    // Common values: EQ, NEQ, LT, LTE, GT, GTE, HAS_PROPERTY, NOT_HAS_PROPERTY, CONTAINS_TOKEN
    [JsonPropertyName("operator")]
    public string Operator { get; init; } = string.Empty;

    // Value to compare against. Not needed for HAS_PROPERTY / NOT_HAS_PROPERTY.
    [JsonPropertyName("value")]
    public string? Value { get; init; }
}

public sealed class HubSpotSearchSort
{
    [JsonPropertyName("propertyName")]
    public string PropertyName { get; init; } = string.Empty;

    // ASCENDING or DESCENDING
    [JsonPropertyName("direction")]
    public string Direction { get; init; } = "DESCENDING";
}

// ─── Association models ───────────────────────────────────────────────────

// One entry returned by GET /crm/v3/objects/deals/{id}/associations/{toObjectType}.
// "id" is the ID of the linked object (contact ID, company ID, etc.).
// "type" is a label like "deal_to_contact" or "deal_to_company".
public sealed class HubSpotAssociationRecord
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; init; } = string.Empty;
}

// ─── Error model ──────────────────────────────────────────────────────────

public sealed class HubSpotAssociationV4Record
{
    [JsonPropertyName("toObjectId")]
    public long ToObjectId { get; init; }

    [JsonPropertyName("associationTypes")]
    public List<HubSpotAssociationV4Type> AssociationTypes { get; init; } = [];
}

public sealed class HubSpotAssociationV4Type
{
    [JsonPropertyName("label")]
    public string? Label { get; init; }

    [JsonPropertyName("typeId")]
    public int TypeId { get; init; }
}

public sealed class HubSpotErrorResponse
{
    [JsonPropertyName("message")]
    public string? Message { get; init; }

    [JsonPropertyName("correlationId")]
    public string? CorrelationId { get; init; }

    [JsonPropertyName("category")]
    public string? Category { get; init; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? AdditionalData { get; init; }
}
