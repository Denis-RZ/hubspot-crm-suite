using System.Text.Json.Serialization;

namespace HubSpotDealsSandbox.ImportExport;

public static class CrmObjectTypes
{
    public const string Deals = "deals";
    public const string Contacts = "contacts";
    public const string Companies = "companies";
}

public sealed record CsvColumnDefinition(
    string Header,
    string PropertyName,
    bool RequiredOnCreate = false);

public sealed record CsvObjectDefinition(
    string ObjectType,
    string FilePrefix,
    IReadOnlyList<CsvColumnDefinition> Columns);

public sealed record CsvFilePayload(
    string FileName,
    byte[] Content,
    string ContentType);

public sealed class ImportPreviewResponse
{
    [JsonPropertyName("objectType")]
    public string ObjectType { get; init; } = string.Empty;

    [JsonPropertyName("fileName")]
    public string FileName { get; init; } = string.Empty;

    [JsonPropertyName("expectedColumns")]
    public IReadOnlyList<string> ExpectedColumns { get; init; } = [];

    [JsonPropertyName("receivedColumns")]
    public IReadOnlyList<string> ReceivedColumns { get; init; } = [];

    [JsonPropertyName("totalRows")]
    public int TotalRows { get; init; }

    [JsonPropertyName("readyRows")]
    public int ReadyRows { get; init; }

    [JsonPropertyName("errorRows")]
    public int ErrorRows { get; init; }

    [JsonPropertyName("canApply")]
    public bool CanApply { get; init; }

    [JsonPropertyName("globalErrors")]
    public IReadOnlyList<string> GlobalErrors { get; init; } = [];

    [JsonPropertyName("rows")]
    public IReadOnlyList<ImportPreviewRow> Rows { get; init; } = [];
}

public sealed class ImportPreviewRow
{
    [JsonPropertyName("rowNumber")]
    public int RowNumber { get; init; }

    [JsonPropertyName("action")]
    public string Action { get; init; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; init; } = string.Empty;

    [JsonPropertyName("recordId")]
    public string? RecordId { get; init; }

    [JsonPropertyName("values")]
    public IReadOnlyDictionary<string, string?> Values { get; init; } =
        new Dictionary<string, string?>();

    [JsonPropertyName("errors")]
    public IReadOnlyList<string> Errors { get; init; } = [];

    [JsonPropertyName("warnings")]
    public IReadOnlyList<string> Warnings { get; init; } = [];
}

public sealed class ImportApplyResponse
{
    [JsonPropertyName("objectType")]
    public string ObjectType { get; init; } = string.Empty;

    [JsonPropertyName("fileName")]
    public string FileName { get; init; } = string.Empty;

    [JsonPropertyName("attemptedRows")]
    public int AttemptedRows { get; init; }

    [JsonPropertyName("succeededRows")]
    public int SucceededRows { get; init; }

    [JsonPropertyName("failedRows")]
    public int FailedRows { get; init; }

    [JsonPropertyName("results")]
    public IReadOnlyList<ImportApplyRowResult> Results { get; init; } = [];
}

public sealed class ImportApplyRowResult
{
    [JsonPropertyName("rowNumber")]
    public int RowNumber { get; init; }

    [JsonPropertyName("action")]
    public string Action { get; init; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; init; } = string.Empty;

    [JsonPropertyName("recordId")]
    public string? RecordId { get; init; }

    [JsonPropertyName("message")]
    public string Message { get; init; } = string.Empty;
}
