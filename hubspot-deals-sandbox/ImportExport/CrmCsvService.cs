using System.Globalization;
using System.Net.Mail;
using System.Text;
using HubSpotDealsSandbox.Data;
using HubSpotDealsSandbox.HubSpot.Models;

namespace HubSpotDealsSandbox.ImportExport;

public sealed class CrmCsvService
{
    private const int MaxRowsPerImport = 500;
    private static readonly UTF8Encoding Utf8WithBom = new(encoderShouldEmitUTF8Identifier: true);

    private static readonly IReadOnlyDictionary<string, CsvObjectDefinition> Definitions =
        new Dictionary<string, CsvObjectDefinition>(StringComparer.OrdinalIgnoreCase)
        {
            [CrmObjectTypes.Deals] = new(
                CrmObjectTypes.Deals,
                FilePrefix: "deals",
                Columns:
                [
                    new("record_id", "record_id"),
                    new("dealname", "dealname", RequiredOnCreate: true),
                    new("amount", "amount"),
                    new("pipeline", "pipeline", RequiredOnCreate: true),
                    new("dealstage", "dealstage", RequiredOnCreate: true),
                    new("closedate", "closedate")
                ]),
            [CrmObjectTypes.Contacts] = new(
                CrmObjectTypes.Contacts,
                FilePrefix: "contacts",
                Columns:
                [
                    new("record_id", "record_id"),
                    new("firstname", "firstname"),
                    new("lastname", "lastname"),
                    new("email", "email", RequiredOnCreate: true),
                    new("phone", "phone"),
                    new("lifecyclestage", "lifecyclestage")
                ]),
            [CrmObjectTypes.Companies] = new(
                CrmObjectTypes.Companies,
                FilePrefix: "companies",
                Columns:
                [
                    new("record_id", "record_id"),
                    new("name", "name", RequiredOnCreate: true),
                    new("domain", "domain"),
                    new("city", "city"),
                    new("industry", "industry")
                ])
        };

    public static bool SupportsObjectType(string objectType) =>
        Definitions.ContainsKey(objectType);

    // 產生標準匯入樣板，只保留系統允許的欄位，避免使用者自行拼錯欄位名稱。
    public CsvFilePayload BuildTemplate(string objectType)
    {
        var definition = GetDefinition(objectType);
        var content = WriteCsv(
            delimiter: ',',
            headers: definition.Columns.Select(column => column.Header).ToArray(),
            rows: []);

        return new CsvFilePayload(
            FileName: $"{definition.FilePrefix}-template.csv",
            Content: Utf8WithBom.GetBytes(content),
            ContentType: "text/csv; charset=utf-8");
    }

    // 匯出目前 HubSpot 資料，支援後續「匯出 -> 編輯 -> 預覽 -> 套用」的 round-trip 流程。
    public async Task<CsvFilePayload> ExportAsync(
        string objectType,
        LocalCrmStore client,
        CancellationToken cancellationToken = default)
    {
        var definition = GetDefinition(objectType);
        var rows = objectType.ToLowerInvariant() switch
        {
            CrmObjectTypes.Deals => await ExportDealsAsync(client, cancellationToken),
            CrmObjectTypes.Contacts => await ExportContactsAsync(client, cancellationToken),
            CrmObjectTypes.Companies => await ExportCompaniesAsync(client, cancellationToken),
            _ => throw CreateUnsupportedTypeException(objectType)
        };

        var content = WriteCsv(
            delimiter: ',',
            headers: definition.Columns.Select(column => column.Header).ToArray(),
            rows: rows);

        return new CsvFilePayload(
            FileName: $"{definition.FilePrefix}-export-{DateTime.UtcNow:yyyyMMdd-HHmmss}.csv",
            Content: Utf8WithBom.GetBytes(content),
            ContentType: "text/csv; charset=utf-8");
    }

    // 預覽階段只做解析、驗證與正規化，不會真正寫入 HubSpot。
    public async Task<ImportPreviewResponse> PreviewAsync(
        string objectType,
        string fileName,
        Stream csvStream,
        LocalCrmStore client,
        CancellationToken cancellationToken = default)
    {
        var analysis = await AnalyzeAsync(objectType, fileName, csvStream, client, cancellationToken);
        return analysis.Preview;
    }

    // 套用階段只在整份檔案通過預覽驗證後才逐列執行 create/update，避免半套資料進 CRM。
    public async Task<ImportApplyResponse> ApplyAsync(
        string objectType,
        string fileName,
        Stream csvStream,
        LocalCrmStore client,
        CancellationToken cancellationToken = default)
    {
        var analysis = await AnalyzeAsync(objectType, fileName, csvStream, client, cancellationToken);
        if (!analysis.Preview.CanApply)
        {
            return new ImportApplyResponse
            {
                ObjectType = analysis.Preview.ObjectType,
                FileName = analysis.Preview.FileName,
                AttemptedRows = 0,
                SucceededRows = 0,
                FailedRows = analysis.Preview.ErrorRows,
                Results = analysis.Rows
                    .Where(row => row.Errors.Count > 0)
                    .Select(row => new ImportApplyRowResult
                    {
                        RowNumber = row.RowNumber,
                        Action = row.Action,
                        Status = "ValidationError",
                        RecordId = row.RecordId,
                        Message = string.Join(" | ", row.Errors)
                    })
                    .ToList()
            };
        }

        var results = new List<ImportApplyRowResult>(analysis.Rows.Count);
        var succeededRows = 0;
        var failedRows = 0;

        foreach (var row in analysis.Rows)
        {
            try
            {
                var recordId = await ApplyRowAsync(objectType, row, client, cancellationToken);
                succeededRows++;
                results.Add(new ImportApplyRowResult
                {
                    RowNumber = row.RowNumber,
                    Action = row.Action,
                    Status = "Succeeded",
                    RecordId = recordId,
                    Message = row.Action == "Create" ? "Record created." : "Record updated."
                });
            }
            catch (Exception ex)
            {
                failedRows++;
                results.Add(new ImportApplyRowResult
                {
                    RowNumber = row.RowNumber,
                    Action = row.Action,
                    Status = "ApiError",
                    RecordId = row.RecordId,
                    Message = ex.Message
                });
            }
        }

        return new ImportApplyResponse
        {
            ObjectType = analysis.Preview.ObjectType,
            FileName = analysis.Preview.FileName,
            AttemptedRows = analysis.Rows.Count,
            SucceededRows = succeededRows,
            FailedRows = failedRows,
            Results = results
        };
    }

    // 這是匯入流程的核心：讀檔、檢查表頭、驗證每列資料、建立預覽結果。
    private async Task<ImportAnalysis> AnalyzeAsync(
        string objectType,
        string fileName,
        Stream csvStream,
        LocalCrmStore client,
        CancellationToken cancellationToken)
    {
        var definition = GetDefinition(objectType);
        var expectedColumns = definition.Columns.Select(column => column.Header).ToArray();
        var globalErrors = new List<string>();
        var rows = new List<ImportRowAnalysis>();

        string csvText;
        using (var reader = new StreamReader(
                   csvStream,
                   Encoding.UTF8,
                   detectEncodingFromByteOrderMarks: true,
                   bufferSize: 4096,
                   leaveOpen: true))
        {
            csvText = await reader.ReadToEndAsync(cancellationToken);
        }

        if (string.IsNullOrWhiteSpace(csvText))
        {
            globalErrors.Add("The uploaded CSV file is empty.");
            return BuildAnalysis(fileName, objectType, expectedColumns, [], rows, globalErrors);
        }

        ParsedCsvDocument document;
        try
        {
            document = ParseCsv(csvText);
        }
        catch (FormatException ex)
        {
            globalErrors.Add(ex.Message);
            return BuildAnalysis(fileName, objectType, expectedColumns, [], rows, globalErrors);
        }

        var receivedColumns = document.Headers.ToArray();
        globalErrors.AddRange(ValidateHeaders(document.Headers, definition));

        if (document.Rows.Count > MaxRowsPerImport)
        {
            globalErrors.Add($"The file contains {document.Rows.Count} data rows. The limit is {MaxRowsPerImport} rows per import.");
        }

        if (globalErrors.Count > 0)
        {
            return BuildAnalysis(fileName, objectType, expectedColumns, receivedColumns, rows, globalErrors);
        }

        var lookupCache = await BuildLookupCacheAsync(objectType, client, cancellationToken);

        for (var index = 0; index < document.Rows.Count; index++)
        {
            var rawValues = BuildRawValues(document.Headers, document.Rows[index], definition);
            if (rawValues.Values.All(string.IsNullOrWhiteSpace))
            {
                continue;
            }

            rows.Add(ValidateRow(definition, rawValues, index + 2, lookupCache));
        }

        MarkDuplicateRecordIds(rows);

        if (rows.Count == 0)
        {
            globalErrors.Add("No data rows were found after the header.");
        }

        return BuildAnalysis(fileName, objectType, expectedColumns, receivedColumns, rows, globalErrors);
    }

    private static ImportAnalysis BuildAnalysis(
        string fileName,
        string objectType,
        IReadOnlyList<string> expectedColumns,
        IReadOnlyList<string> receivedColumns,
        IReadOnlyList<ImportRowAnalysis> rows,
        IReadOnlyList<string> globalErrors)
    {
        var previewRows = rows.Select(row => row.ToPreviewRow()).ToList();
        var errorRows = rows.Count(row => row.Errors.Count > 0);
        var readyRows = rows.Count(row => row.Errors.Count == 0);

        return new ImportAnalysis(
            new ImportPreviewResponse
            {
                ObjectType = objectType,
                FileName = fileName,
                ExpectedColumns = expectedColumns,
                ReceivedColumns = receivedColumns,
                TotalRows = rows.Count,
                ReadyRows = readyRows,
                ErrorRows = errorRows,
                CanApply = globalErrors.Count == 0 && readyRows > 0 && errorRows == 0,
                GlobalErrors = globalErrors,
                Rows = previewRows
            },
            rows.ToList());
    }

    private async Task<List<Dictionary<string, string?>>> ExportDealsAsync(
        LocalCrmStore client,
        CancellationToken cancellationToken)
    {
        var deals = await client.ListDealsAsync(limit: 500, cancellationToken);
        return deals.Select(deal => new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
        {
            ["record_id"] = deal.Id,
            ["dealname"] = deal.Properties.DealName,
            ["amount"] = deal.Properties.Amount,
            ["pipeline"] = deal.Properties.Pipeline,
            ["dealstage"] = deal.Properties.DealStage,
            ["closedate"] = deal.Properties.CloseDate
        }).ToList();
    }

    private async Task<List<Dictionary<string, string?>>> ExportContactsAsync(
        LocalCrmStore client,
        CancellationToken cancellationToken)
    {
        var contacts = await client.ListContactsAsync(limit: 500, cancellationToken);
        return contacts.Select(contact => new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
        {
            ["record_id"] = contact.Id,
            ["firstname"] = GetProperty(contact.Properties, "firstname"),
            ["lastname"] = GetProperty(contact.Properties, "lastname"),
            ["email"] = GetProperty(contact.Properties, "email"),
            ["phone"] = GetProperty(contact.Properties, "phone"),
            ["lifecyclestage"] = GetProperty(contact.Properties, "lifecyclestage")
        }).ToList();
    }

    private async Task<List<Dictionary<string, string?>>> ExportCompaniesAsync(
        LocalCrmStore client,
        CancellationToken cancellationToken)
    {
        var companies = await client.ListCompaniesAsync(limit: 500, cancellationToken);
        return companies.Select(company => new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
        {
            ["record_id"] = company.Id,
            ["name"] = GetProperty(company.Properties, "name"),
            ["domain"] = GetProperty(company.Properties, "domain"),
            ["city"] = GetProperty(company.Properties, "city"),
            ["industry"] = GetProperty(company.Properties, "industry")
        }).ToList();
    }

    private static string? GetProperty(
        IReadOnlyDictionary<string, string?> properties,
        string key) =>
        properties.TryGetValue(key, out var value) ? value : null;

    private async Task<string> ApplyRowAsync(
        string objectType,
        ImportRowAnalysis row,
        LocalCrmStore client,
        CancellationToken cancellationToken)
    {
        // 依物件類型決定要呼叫哪個 HubSpot API，並回傳最後的 record id。
        switch (objectType.ToLowerInvariant())
        {
            case CrmObjectTypes.Deals:
            {
                var request = new HubSpotDealMutationRequest
                {
                    Properties = new Dictionary<string, string?>(row.Properties, StringComparer.OrdinalIgnoreCase)
                };

                var deal = row.Action == "Update"
                    ? await client.UpdateDealAsync(row.RecordId!, request, cancellationToken)
                    : await client.CreateDealAsync(request, cancellationToken);

                return deal.Id;
            }

            case CrmObjectTypes.Contacts:
            {
                var request = new HubSpotCrmMutationRequest
                {
                    Properties = new Dictionary<string, string?>(row.Properties, StringComparer.OrdinalIgnoreCase)
                };

                var contact = row.Action == "Update"
                    ? await client.UpdateContactAsync(row.RecordId!, request, cancellationToken)
                    : await client.CreateContactAsync(request, cancellationToken);

                return contact.Id;
            }

            case CrmObjectTypes.Companies:
            {
                var request = new HubSpotCrmMutationRequest
                {
                    Properties = new Dictionary<string, string?>(row.Properties, StringComparer.OrdinalIgnoreCase)
                };

                var company = row.Action == "Update"
                    ? await client.UpdateCompanyAsync(row.RecordId!, request, cancellationToken)
                    : await client.CreateCompanyAsync(request, cancellationToken);

                return company.Id;
            }

            default:
                throw CreateUnsupportedTypeException(objectType);
        }
    }

    private static Dictionary<string, string> BuildRawValues(
        IReadOnlyList<string> headers,
        IReadOnlyList<string> row,
        CsvObjectDefinition definition)
    {
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (var column in definition.Columns)
        {
            var index = headers
                .Select((header, position) => new { Header = header, Position = position })
                .First(item => item.Header.Equals(column.Header, StringComparison.OrdinalIgnoreCase))
                .Position;

            values[column.Header] = index < row.Count ? row[index].Trim() : string.Empty;
        }

        return values;
    }

    private static ImportRowAnalysis ValidateRow(
        CsvObjectDefinition definition,
        IReadOnlyDictionary<string, string> rawValues,
        int rowNumber,
        ImportLookupCache lookupCache)
    {
        var normalizedValues = definition.Columns.ToDictionary(
            column => column.Header,
            column => rawValues.TryGetValue(column.Header, out var rawValue) ? rawValue.Trim() : string.Empty,
            StringComparer.OrdinalIgnoreCase);

        var recordId = normalizedValues["record_id"];
        var action = string.IsNullOrWhiteSpace(recordId) ? "Create" : "Update";
        var errors = new List<string>();
        var warnings = new List<string>();

        if (!string.IsNullOrWhiteSpace(recordId) && !recordId.All(char.IsDigit))
        {
            errors.Add("record_id must be a numeric HubSpot object id.");
        }

        if (action == "Create")
        {
            foreach (var requiredColumn in definition.Columns.Where(column => column.RequiredOnCreate))
            {
                if (string.IsNullOrWhiteSpace(normalizedValues[requiredColumn.Header]))
                {
                    errors.Add($"{requiredColumn.Header} is required for create rows.");
                }
            }
        }
        else
        {
            var hasAnyWritableValue = definition.Columns
                .Where(column => !column.Header.Equals("record_id", StringComparison.OrdinalIgnoreCase))
                .Any(column => !string.IsNullOrWhiteSpace(normalizedValues[column.Header]));

            if (!hasAnyWritableValue)
            {
                errors.Add("Update rows must include at least one field besides record_id.");
            }
        }

        switch (definition.ObjectType)
        {
            case CrmObjectTypes.Deals:
                ValidateDealRow(normalizedValues, lookupCache, errors, warnings);
                break;

            case CrmObjectTypes.Contacts:
                ValidateContactRow(normalizedValues, action, errors);
                break;

            case CrmObjectTypes.Companies:
                ValidateCompanyRow(normalizedValues, lookupCache, errors, warnings);
                break;
        }

        var payload = definition.Columns
            .Where(column => !column.Header.Equals("record_id", StringComparison.OrdinalIgnoreCase))
            .ToDictionary(
                column => column.PropertyName,
                column => (string?)normalizedValues[column.Header],
                StringComparer.OrdinalIgnoreCase);

        return new ImportRowAnalysis(
            rowNumber,
            action,
            string.IsNullOrWhiteSpace(recordId) ? null : recordId,
            normalizedValues.ToDictionary(kvp => kvp.Key, kvp => (string?)kvp.Value, StringComparer.OrdinalIgnoreCase),
            payload,
            errors,
            warnings);
    }

    private static void ValidateDealRow(
        IDictionary<string, string> values,
        ImportLookupCache lookupCache,
        List<string> errors,
        List<string> warnings)
    {
        if (!string.IsNullOrWhiteSpace(values["amount"]))
        {
            if (!TryNormalizeAmount(values["amount"], out var normalizedAmount))
            {
                errors.Add("amount must be a valid decimal number.");
            }
            else
            {
                values["amount"] = normalizedAmount!;
            }
        }

        if (!string.IsNullOrWhiteSpace(values["closedate"]))
        {
            if (!TryNormalizeCloseDate(values["closedate"], out var normalizedCloseDate))
            {
                errors.Add("closedate must be a valid date or ISO timestamp.");
            }
            else
            {
                values["closedate"] = normalizedCloseDate!;
            }
        }

        var hasPipeline = !string.IsNullOrWhiteSpace(values["pipeline"]);
        var hasStage = !string.IsNullOrWhiteSpace(values["dealstage"]);

        if (hasPipeline ^ hasStage)
        {
            errors.Add("pipeline and dealstage must be supplied together.");
            return;
        }

        if (!hasPipeline)
        {
            return;
        }

        if (!TryResolvePipeline(values["pipeline"], lookupCache, out var pipelineId))
        {
            errors.Add($"pipeline '{values["pipeline"]}' was not found in HubSpot.");
            return;
        }

        values["pipeline"] = pipelineId!;

        if (!TryResolveStage(values["dealstage"], pipelineId!, lookupCache, out var stageId))
        {
            errors.Add($"dealstage '{values["dealstage"]}' does not belong to pipeline '{pipelineId}'.");
            return;
        }

        if (!stageId!.Equals(values["dealstage"], StringComparison.Ordinal))
        {
            warnings.Add($"dealstage normalized to '{stageId}'.");
        }

        values["dealstage"] = stageId;
    }

    private static void ValidateContactRow(
        IDictionary<string, string> values,
        string action,
        List<string> errors)
    {
        if (action == "Create" && string.IsNullOrWhiteSpace(values["email"]))
        {
            errors.Add("email is required for create rows.");
            return;
        }

        if (string.IsNullOrWhiteSpace(values["email"]))
        {
            return;
        }

        try
        {
            var address = new MailAddress(values["email"]);
            values["email"] = address.Address;
        }
        catch (FormatException)
        {
            errors.Add("email must be a valid email address.");
        }
    }

    private static void ValidateCompanyRow(
        IDictionary<string, string> values,
        ImportLookupCache lookupCache,
        List<string> errors,
        List<string> warnings)
    {
        if (string.IsNullOrWhiteSpace(values["industry"]))
        {
            return;
        }

        if (!TryResolveIndustry(values["industry"], lookupCache, out var industryValue))
        {
            errors.Add($"industry '{values["industry"]}' is not a valid HubSpot option.");
            return;
        }

        if (!industryValue!.Equals(values["industry"], StringComparison.Ordinal))
        {
            warnings.Add($"industry normalized to '{industryValue}'.");
        }

        values["industry"] = industryValue;
    }

    private static void MarkDuplicateRecordIds(IReadOnlyList<ImportRowAnalysis> rows)
    {
        var duplicates = rows
            .Where(row => !string.IsNullOrWhiteSpace(row.RecordId))
            .GroupBy(row => row.RecordId!, StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Count() > 1);

        foreach (var duplicate in duplicates)
        {
            foreach (var row in duplicate)
            {
                row.Errors.Add($"record_id '{duplicate.Key}' appears more than once in this file.");
            }
        }
    }

    private static IReadOnlyList<string> ValidateHeaders(
        IReadOnlyList<string> headers,
        CsvObjectDefinition definition)
    {
        var errors = new List<string>();

        if (headers.Count == 0)
        {
            errors.Add("The CSV file does not contain a header row.");
            return errors;
        }

        var duplicateHeaders = headers
            .GroupBy(header => header, StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .ToList();

        if (duplicateHeaders.Count > 0)
        {
            errors.Add($"Duplicate columns are not allowed: {string.Join(", ", duplicateHeaders)}.");
        }

        var expectedHeaders = definition.Columns
            .Select(column => column.Header)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var missingHeaders = definition.Columns
            .Select(column => column.Header)
            .Where(header => !headers.Contains(header, StringComparer.OrdinalIgnoreCase))
            .ToList();

        if (missingHeaders.Count > 0)
        {
            errors.Add($"Missing required columns: {string.Join(", ", missingHeaders)}.");
        }

        var unknownHeaders = headers
            .Where(header => !expectedHeaders.Contains(header))
            .ToList();

        if (unknownHeaders.Count > 0)
        {
            errors.Add($"Unexpected columns: {string.Join(", ", unknownHeaders)}.");
        }

        return errors;
    }

    private async Task<ImportLookupCache> BuildLookupCacheAsync(
        string objectType,
        LocalCrmStore client,
        CancellationToken cancellationToken)
    {
        // 先抓 HubSpot 的 lookup 資料，讓 preview 就能驗證 pipeline/stage 與 industry，
        // 不要等到 apply 時才被 API 拒絕。
        var cache = new ImportLookupCache();

        if (objectType.Equals(CrmObjectTypes.Deals, StringComparison.OrdinalIgnoreCase))
        {
            var pipelines = await client.GetDealPipelinesAsync(cancellationToken);
            foreach (var pipeline in pipelines)
            {
                cache.PipelinesById[pipeline.Id] = pipeline.Id;
                cache.PipelinesByLabel[pipeline.Label] = pipeline.Id;

                var stageMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var stage in pipeline.Stages)
                {
                    stageMap[stage.Id] = stage.Id;
                    stageMap[stage.Label] = stage.Id;
                }

                cache.StagesByPipelineId[pipeline.Id] = stageMap;
            }
        }

        if (objectType.Equals(CrmObjectTypes.Companies, StringComparison.OrdinalIgnoreCase))
        {
            var options = await client.GetCompanyIndustryOptionsAsync(cancellationToken);
            foreach (var option in options)
            {
                cache.IndustriesByValue[option.Value] = option.Value;
                cache.IndustriesByLabel[option.Label] = option.Value;
            }
        }

        return cache;
    }

    private static bool TryResolvePipeline(
        string input,
        ImportLookupCache cache,
        out string? pipelineId)
    {
        pipelineId = null;
        if (cache.PipelinesById.TryGetValue(input, out var byId))
        {
            pipelineId = byId;
            return true;
        }

        if (cache.PipelinesByLabel.TryGetValue(input, out var byLabel))
        {
            pipelineId = byLabel;
            return true;
        }

        return false;
    }

    private static bool TryResolveStage(
        string input,
        string pipelineId,
        ImportLookupCache cache,
        out string? stageId)
    {
        stageId = null;
        if (!cache.StagesByPipelineId.TryGetValue(pipelineId, out var stageMap))
        {
            return false;
        }

        if (stageMap.TryGetValue(input, out var resolved))
        {
            stageId = resolved;
            return true;
        }

        return false;
    }

    private static bool TryResolveIndustry(
        string input,
        ImportLookupCache cache,
        out string? industryValue)
    {
        industryValue = null;
        if (cache.IndustriesByValue.TryGetValue(input, out var byValue))
        {
            industryValue = byValue;
            return true;
        }

        if (cache.IndustriesByLabel.TryGetValue(input, out var byLabel))
        {
            industryValue = byLabel;
            return true;
        }

        return false;
    }

    private static bool TryNormalizeAmount(string input, out string? output)
    {
        output = null;
        var styles = NumberStyles.AllowLeadingSign |
                     NumberStyles.AllowDecimalPoint |
                     NumberStyles.AllowThousands |
                     NumberStyles.AllowLeadingWhite |
                     NumberStyles.AllowTrailingWhite;

        if (decimal.TryParse(input, styles, CultureInfo.InvariantCulture, out var invariant))
        {
            output = invariant.ToString(CultureInfo.InvariantCulture);
            return true;
        }

        if (decimal.TryParse(input, styles, CultureInfo.CurrentCulture, out var current))
        {
            output = current.ToString(CultureInfo.InvariantCulture);
            return true;
        }

        if (input.Contains(',', StringComparison.Ordinal) &&
            !input.Contains('.', StringComparison.Ordinal) &&
            decimal.TryParse(input.Replace(',', '.'), styles, CultureInfo.InvariantCulture, out var normalized))
        {
            output = normalized.ToString(CultureInfo.InvariantCulture);
            return true;
        }

        return false;
    }

    private static bool TryNormalizeCloseDate(string input, out string? output)
    {
        output = null;

        if (DateOnly.TryParse(input, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dateOnly) ||
            DateOnly.TryParse(input, CultureInfo.CurrentCulture, DateTimeStyles.None, out dateOnly))
        {
            output = new DateTimeOffset(
                dateOnly.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
                TimeSpan.Zero).ToString("O", CultureInfo.InvariantCulture);

            return true;
        }

        if (DateTimeOffset.TryParse(
                input,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var dto) ||
            DateTimeOffset.TryParse(
                input,
                CultureInfo.CurrentCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out dto))
        {
            output = dto.ToString("O", CultureInfo.InvariantCulture);
            return true;
        }

        return false;
    }

    private static ParsedCsvDocument ParseCsv(string csvText)
    {
        var delimiter = DetectDelimiter(csvText);
        var rows = new List<List<string>>();
        var row = new List<string>();
        var field = new StringBuilder();
        var inQuotes = false;

        for (var index = 0; index < csvText.Length; index++)
        {
            var character = csvText[index];

            if (inQuotes)
            {
                if (character == '"')
                {
                    if (index + 1 < csvText.Length && csvText[index + 1] == '"')
                    {
                        field.Append('"');
                        index++;
                    }
                    else
                    {
                        inQuotes = false;
                    }
                }
                else
                {
                    field.Append(character);
                }

                continue;
            }

            if (character == '"')
            {
                inQuotes = true;
                continue;
            }

            if (character == delimiter)
            {
                row.Add(field.ToString());
                field.Clear();
                continue;
            }

            if (character == '\r' || character == '\n')
            {
                row.Add(field.ToString());
                field.Clear();
                rows.Add(row);
                row = [];

                if (character == '\r' && index + 1 < csvText.Length && csvText[index + 1] == '\n')
                {
                    index++;
                }

                continue;
            }

            field.Append(character);
        }

        if (inQuotes)
        {
            throw new FormatException("The CSV file has an unmatched quote.");
        }

        if (field.Length > 0 || row.Count > 0)
        {
            row.Add(field.ToString());
            rows.Add(row);
        }

        if (rows.Count == 0)
        {
            return new ParsedCsvDocument([], []);
        }

        var headers = rows[0].Select(header => header.Trim()).ToList();
        var dataRows = rows.Skip(1).Select(currentRow => (IReadOnlyList<string>)currentRow).ToList();

        return new ParsedCsvDocument(headers, dataRows);
    }

    private static char DetectDelimiter(string csvText)
    {
        var counts = new Dictionary<char, int>
        {
            [','] = 0,
            [';'] = 0,
            ['\t'] = 0
        };

        var inQuotes = false;
        for (var index = 0; index < csvText.Length; index++)
        {
            var character = csvText[index];

            if (character == '"')
            {
                if (inQuotes && index + 1 < csvText.Length && csvText[index + 1] == '"')
                {
                    index++;
                }
                else
                {
                    inQuotes = !inQuotes;
                }

                continue;
            }

            if (inQuotes)
            {
                continue;
            }

            if (character is '\r' or '\n')
            {
                break;
            }

            if (counts.ContainsKey(character))
            {
                counts[character]++;
            }
        }

        return counts
            .OrderByDescending(entry => entry.Value)
            .First().Key;
    }

    private static string WriteCsv(
        char delimiter,
        IReadOnlyList<string> headers,
        IReadOnlyList<Dictionary<string, string?>> rows)
    {
        var builder = new StringBuilder();
        builder.AppendJoin(delimiter, headers.Select(header => EscapeCsvCell(header, delimiter)));
        builder.AppendLine();

        foreach (var row in rows)
        {
            builder.AppendJoin(
                delimiter,
                headers.Select(header =>
                {
                    row.TryGetValue(header, out var value);
                    return EscapeCsvCell(value ?? string.Empty, delimiter);
                }));
            builder.AppendLine();
        }

        return builder.ToString();
    }

    private static string EscapeCsvCell(string value, char delimiter)
    {
        if (value.IndexOfAny([delimiter, '"', '\r', '\n']) < 0)
        {
            return value;
        }

        return $"\"{value.Replace("\"", "\"\"", StringComparison.Ordinal)}\"";
    }

    private static CsvObjectDefinition GetDefinition(string objectType)
    {
        if (Definitions.TryGetValue(objectType, out var definition))
        {
            return definition;
        }

        throw CreateUnsupportedTypeException(objectType);
    }

    private static ArgumentException CreateUnsupportedTypeException(string objectType) =>
        new($"Unsupported object type '{objectType}'. Use deals, contacts, or companies.", nameof(objectType));

    private sealed record ImportAnalysis(
        ImportPreviewResponse Preview,
        IReadOnlyList<ImportRowAnalysis> Rows);

    private sealed class ImportRowAnalysis
    {
        public ImportRowAnalysis(
            int rowNumber,
            string action,
            string? recordId,
            IReadOnlyDictionary<string, string?> values,
            IReadOnlyDictionary<string, string?> properties,
            List<string> errors,
            List<string> warnings)
        {
            RowNumber = rowNumber;
            Action = action;
            RecordId = recordId;
            Values = values;
            Properties = properties;
            Errors = errors;
            Warnings = warnings;
        }

        public int RowNumber { get; }

        public string Action { get; }

        public string? RecordId { get; }

        public IReadOnlyDictionary<string, string?> Values { get; }

        public IReadOnlyDictionary<string, string?> Properties { get; }

        public List<string> Errors { get; }

        public List<string> Warnings { get; }

        public ImportPreviewRow ToPreviewRow() =>
            new()
            {
                RowNumber = RowNumber,
                Action = Action,
                Status = Errors.Count == 0 ? "Ready" : "Error",
                RecordId = RecordId,
                Values = Values,
                Errors = Errors.ToArray(),
                Warnings = Warnings.ToArray()
            };
    }

    private sealed class ImportLookupCache
    {
        public Dictionary<string, string> PipelinesById { get; } =
            new(StringComparer.OrdinalIgnoreCase);

        public Dictionary<string, string> PipelinesByLabel { get; } =
            new(StringComparer.OrdinalIgnoreCase);

        public Dictionary<string, Dictionary<string, string>> StagesByPipelineId { get; } =
            new(StringComparer.OrdinalIgnoreCase);

        public Dictionary<string, string> IndustriesByValue { get; } =
            new(StringComparer.OrdinalIgnoreCase);

        public Dictionary<string, string> IndustriesByLabel { get; } =
            new(StringComparer.OrdinalIgnoreCase);
    }

    private sealed record ParsedCsvDocument(
        IReadOnlyList<string> Headers,
        IReadOnlyList<IReadOnlyList<string>> Rows);
}
