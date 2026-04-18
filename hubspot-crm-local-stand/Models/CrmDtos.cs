using System.Text.Json.Serialization;

namespace HubSpotCrmLocalStand.Models;

public sealed class ListResponse<T>
{
    [JsonPropertyName("results")]
    public IReadOnlyList<T> Results { get; init; } = [];
}

public sealed class CrmOverviewDto
{
    [JsonPropertyName("name")]
    public string Name { get; init; } = "HubSpot-like CRM Local Stand";

    [JsonPropertyName("notes")]
    public IReadOnlyList<string> Notes { get; init; } = [];

    [JsonPropertyName("endpoints")]
    public IReadOnlyList<string> Endpoints { get; init; } = [];
}

public sealed class CrmEntityResponse<TProperties>
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [JsonPropertyName("createdAt")]
    public DateTimeOffset CreatedAt { get; init; }

    [JsonPropertyName("updatedAt")]
    public DateTimeOffset UpdatedAt { get; init; }

    [JsonPropertyName("archived")]
    public bool Archived { get; init; }

    [JsonPropertyName("properties")]
    public TProperties Properties { get; init; } = default!;

    [JsonPropertyName("associations")]
    public IReadOnlyList<AssociationReference> Associations { get; init; } = [];
}

public sealed class CrmMutationRequest<TProperties>
{
    [JsonPropertyName("properties")]
    public TProperties Properties { get; init; } = default!;

    [JsonPropertyName("associations")]
    public IReadOnlyList<AssociationReference> Associations { get; init; } = [];
}

public sealed class AssociationReference
{
    [JsonPropertyName("toObjectType")]
    public string ToObjectType { get; init; } = string.Empty;

    [JsonPropertyName("toObjectId")]
    public string ToObjectId { get; init; } = string.Empty;
}

public sealed class PropertyDefinitionDto
{
    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [JsonPropertyName("label")]
    public string Label { get; init; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; init; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; init; } = string.Empty;

    [JsonPropertyName("example")]
    public string Example { get; init; } = string.Empty;

    [JsonPropertyName("requiredForCreate")]
    public bool RequiredForCreate { get; init; }
}

public sealed class PipelineListResponse
{
    [JsonPropertyName("results")]
    public IReadOnlyList<PipelineDto> Results { get; init; } = [];
}

public sealed class PipelineDto
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [JsonPropertyName("label")]
    public string Label { get; init; } = string.Empty;

    [JsonPropertyName("displayOrder")]
    public int DisplayOrder { get; init; }

    [JsonPropertyName("stages")]
    public IReadOnlyList<PipelineStageDto> Stages { get; init; } = [];
}

public sealed class PipelineStageDto
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [JsonPropertyName("label")]
    public string Label { get; init; } = string.Empty;

    [JsonPropertyName("displayOrder")]
    public int DisplayOrder { get; init; }
}

public sealed class DealProperties
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
    public DateTimeOffset? CloseDate { get; init; }
}

public sealed class ContactProperties
{
    [JsonPropertyName("email")]
    public string? Email { get; init; }

    [JsonPropertyName("firstname")]
    public string? FirstName { get; init; }

    [JsonPropertyName("lastname")]
    public string? LastName { get; init; }

    [JsonPropertyName("phone")]
    public string? Phone { get; init; }

    [JsonPropertyName("lifecyclestage")]
    public string? LifecycleStage { get; init; }
}

public sealed class CompanyProperties
{
    [JsonPropertyName("name")]
    public string? Name { get; init; }

    [JsonPropertyName("domain")]
    public string? Domain { get; init; }

    [JsonPropertyName("city")]
    public string? City { get; init; }

    [JsonPropertyName("industry")]
    public string? Industry { get; init; }
}

public sealed class NoteProperties
{
    [JsonPropertyName("hs_note_body")]
    public string? Body { get; init; }

    [JsonPropertyName("hs_timestamp")]
    public DateTimeOffset? Timestamp { get; init; }

    [JsonPropertyName("hubspot_owner_id")]
    public string? OwnerId { get; init; }
}

public sealed class TaskProperties
{
    [JsonPropertyName("hs_task_subject")]
    public string? Subject { get; init; }

    [JsonPropertyName("hs_task_body")]
    public string? Body { get; init; }

    // NOT_STARTED | IN_PROGRESS | WAITING | DEFERRED | COMPLETED
    [JsonPropertyName("hs_task_status")]
    public string? Status { get; init; }

    // HIGH | MEDIUM | LOW
    [JsonPropertyName("hs_task_priority")]
    public string? Priority { get; init; }

    [JsonPropertyName("hs_timestamp")]
    public DateTimeOffset? DueDate { get; init; }

    [JsonPropertyName("hubspot_owner_id")]
    public string? OwnerId { get; init; }
}

public sealed class OwnerDto
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [JsonPropertyName("email")]
    public string Email { get; init; } = string.Empty;

    [JsonPropertyName("firstName")]
    public string FirstName { get; init; } = string.Empty;

    [JsonPropertyName("lastName")]
    public string LastName { get; init; } = string.Empty;

    [JsonPropertyName("userId")]
    public int UserId { get; init; }
}
