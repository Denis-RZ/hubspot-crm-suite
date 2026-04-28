using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using HubSpotDealsSandbox.HubSpot.Models;

namespace HubSpotDealsSandbox.HubSpot;

public sealed class HubSpotDealsClient
{
    private const int MaxObjectsPerRequest = 100;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly HttpClient _httpClient;

    public HubSpotDealsClient(HttpClient httpClient, string accessToken)
    {
        _httpClient = httpClient;
        _httpClient.BaseAddress ??= new Uri("https://api.hubapi.com/");
        _httpClient.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", accessToken);
        _httpClient.DefaultRequestHeaders.Accept.Add(
            new MediaTypeWithQualityHeaderValue("application/json"));
        _httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("HubSpotDealsSandbox/1.0");
    }

    // Deals 清單支援分頁抓取；對外保留簡單的 limit 介面，內部再處理 HubSpot 的 paging。
    public async Task<IReadOnlyList<HubSpotDealRecord>> ListDealsAsync(
        int limit = 10,
        CancellationToken cancellationToken = default)
    {
        return await ListPagedObjectsAsync<HubSpotDealRecord>(
            "crm/v3/objects/deals",
            ["dealname", "amount", "dealstage", "pipeline", "closedate", "createdate", "hs_lastmodifieddate"],
            limit,
            cancellationToken);
    }

    public Task<HubSpotDealRecord> GetDealAsync(
        string dealId,
        CancellationToken cancellationToken = default)
    {
        ValidateDealId(dealId);

        var route =
            $"crm/v3/objects/deals/{dealId}" +
            "?archived=false" +
            "&properties=dealname,amount,dealstage,pipeline,closedate,createdate,hs_lastmodifieddate";

        return SendAsync<HubSpotDealRecord>(HttpMethod.Get, route, payload: null, cancellationToken);
    }

    public Task<HubSpotDealRecord> CreateDealAsync(
        HubSpotDealMutationRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        return SendAsync<HubSpotDealRecord>(
            HttpMethod.Post,
            "crm/v3/objects/deals",
            request,
            cancellationToken);
    }

    public Task<HubSpotDealRecord> UpdateDealAsync(
        string dealId,
        HubSpotDealMutationRequest request,
        CancellationToken cancellationToken = default)
    {
        ValidateDealId(dealId);
        ArgumentNullException.ThrowIfNull(request);

        return SendAsync<HubSpotDealRecord>(
            HttpMethod.Patch,
            $"crm/v3/objects/deals/{dealId}",
            request,
            cancellationToken);
    }

    public async Task DeleteDealAsync(
        string dealId,
        CancellationToken cancellationToken = default)
    {
        ValidateDealId(dealId);

        await SendEmptyAsync(
            HttpMethod.Delete,
            $"crm/v3/objects/deals/{dealId}",
            cancellationToken);
    }

    public async Task<IReadOnlyList<HubSpotPipeline>> GetDealPipelinesAsync(
        CancellationToken cancellationToken = default)
    {
        var response = await SendAsync<HubSpotPipelineListResponse>(
            HttpMethod.Get,
            "crm/v3/pipelines/deals",
            payload: null,
            cancellationToken);

        return response.Results;
    }

    public Task<IReadOnlyList<HubSpotCrmRecord>> ListContactsAsync(
        int limit = 100,
        CancellationToken cancellationToken = default) =>
        ListObjectsAsync(
            "contacts",
            ["firstname", "lastname", "email", "phone", "lifecyclestage"],
            limit,
            cancellationToken);

    public Task<HubSpotCrmRecord> CreateContactAsync(
        HubSpotCrmMutationRequest request,
        CancellationToken cancellationToken = default) =>
        CreateObjectAsync("contacts", request, cancellationToken);

    public Task<HubSpotCrmRecord> UpdateContactAsync(
        string contactId,
        HubSpotCrmMutationRequest request,
        CancellationToken cancellationToken = default) =>
        UpdateObjectAsync("contacts", contactId, request, cancellationToken);

    public Task DeleteContactAsync(
        string contactId,
        CancellationToken cancellationToken = default) =>
        DeleteObjectAsync("contacts", contactId, cancellationToken);

    public Task<IReadOnlyList<HubSpotCrmRecord>> ListCompaniesAsync(
        int limit = 100,
        CancellationToken cancellationToken = default) =>
        ListObjectsAsync(
            "companies",
            ["name", "domain", "city", "industry"],
            limit,
            cancellationToken);

    public Task<HubSpotCrmRecord> CreateCompanyAsync(
        HubSpotCrmMutationRequest request,
        CancellationToken cancellationToken = default) =>
        CreateObjectAsync("companies", request, cancellationToken);

    public Task<HubSpotCrmRecord> UpdateCompanyAsync(
        string companyId,
        HubSpotCrmMutationRequest request,
        CancellationToken cancellationToken = default) =>
        UpdateObjectAsync("companies", companyId, request, cancellationToken);

    public Task DeleteCompanyAsync(
        string companyId,
        CancellationToken cancellationToken = default) =>
        DeleteObjectAsync("companies", companyId, cancellationToken);

    public async Task<IReadOnlyList<HubSpotPropertyOption>> GetCompanyIndustryOptionsAsync(
        CancellationToken cancellationToken = default)
    {
        // company.industry 在 HubSpot 是固定選項，不是自由文字；
        // UI 應讀取官方 options，避免使用者輸入無效值。
        var property = await SendAsync<HubSpotPropertyDefinition>(
            HttpMethod.Get,
            "crm/v3/properties/companies/industry",
            payload: null,
            cancellationToken);

        return property.Options
            .OrderBy(option => option.DisplayOrder)
            .ThenBy(option => option.Label, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<IReadOnlyList<HubSpotPropertyOption>> GetContactLifecycleOptionsAsync(
        CancellationToken cancellationToken = default)
    {
        var property = await SendAsync<HubSpotPropertyDefinition>(
            HttpMethod.Get,
            "crm/v3/properties/contacts/lifecyclestage",
            payload: null,
            cancellationToken);

        return property.Options
            .OrderBy(option => option.DisplayOrder)
            .ThenBy(option => option.Label, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    // 用 HubSpot 的 search API 依屬性條件查詢 deals。
    // 這裡用 POST，是因為 filter body 可能比 query string 更長也更複雜。
    public async Task<IReadOnlyList<HubSpotDealRecord>> SearchDealsAsync(
        HubSpotSearchRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var response = await SendAsync<HubSpotListResponse<HubSpotDealRecord>>(
            HttpMethod.Post,
            "crm/v3/objects/deals/search",
            request,
            cancellationToken);

        return response.Results;
    }

    // 建立 deal 與 contact/company 的關聯。
    // HubSpot 需要 association type id；標準物件的 type id 是固定值：
    // 3 = deal_to_contact
    // Deal-company uses the default/unlabeled v4 endpoint. The old v3 type id 5
    // means primary company and replaces the existing primary association.
    public async Task AssociateDealAsync(
        string dealId,
        string toObjectType,
        string toObjectId,
        CancellationToken cancellationToken = default)
    {
        ValidateDealId(dealId);

        var normalizedType = toObjectType.ToLowerInvariant();
        if (normalizedType is "companies" or "company")
        {
            await SendEmptyAsync(
                HttpMethod.Put,
                $"crm/objects/2026-03/deals/{dealId}/associations/default/companies/{toObjectId}",
                cancellationToken,
                sendJsonBody: false);
            return;
        }

        var typeId = normalizedType switch
        {
            "contacts" or "contact" => 3,  // deal → contact
            _ => throw new ArgumentException(
                     $"Unsupported object type '{toObjectType}'. Use 'contacts' or 'companies'.")
        };

        await SendEmptyAsync(
            HttpMethod.Put,
            $"crm/v3/objects/deals/{dealId}/associations/{toObjectType}/{toObjectId}/{typeId}",
            cancellationToken);
    }

    // 讀取某筆 deal 目前已關聯的 contact/company 清單。
    public async Task<IReadOnlyList<HubSpotAssociationRecord>> GetDealAssociationsAsync(
        string dealId,
        string toObjectType,
        CancellationToken cancellationToken = default)
    {
        ValidateDealId(dealId);

        if (toObjectType.Equals("companies", StringComparison.OrdinalIgnoreCase) ||
            toObjectType.Equals("company", StringComparison.OrdinalIgnoreCase))
        {
            var companyResponse = await SendAsync<HubSpotListResponse<HubSpotAssociationV4Record>>(
                HttpMethod.Get,
                $"crm/objects/2026-03/deals/{dealId}/associations/companies",
                payload: null,
                cancellationToken);

            return companyResponse.Results
                .Select(record => new HubSpotAssociationRecord
                {
                    Id = record.ToObjectId.ToString(),
                    Type = record.AssociationTypes.FirstOrDefault()?.Label ?? "deal_to_company",
                })
                .ToList();
        }

        var response = await SendAsync<HubSpotListResponse<HubSpotAssociationRecord>>(
            HttpMethod.Get,
            $"crm/v3/objects/deals/{dealId}/associations/{toObjectType}",
            payload: null,
            cancellationToken);

        return response.Results;
    }

    // 讀取任意 CRM 物件（contact/company）關聯的 deals 清單。
    public async Task<IReadOnlyList<HubSpotAssociationRecord>> GetObjectAssociationsAsync(
        string fromObjectType,
        string objectId,
        string toObjectType,
        CancellationToken cancellationToken = default)
    {
        if ((fromObjectType.Equals("companies", StringComparison.OrdinalIgnoreCase) ||
             fromObjectType.Equals("company", StringComparison.OrdinalIgnoreCase)) &&
            (toObjectType.Equals("deals", StringComparison.OrdinalIgnoreCase) ||
             toObjectType.Equals("deal", StringComparison.OrdinalIgnoreCase)))
        {
            var companyResponse = await SendAsync<HubSpotListResponse<HubSpotAssociationV4Record>>(
                HttpMethod.Get,
                $"crm/objects/2026-03/companies/{objectId}/associations/deals",
                payload: null,
                cancellationToken);

            return companyResponse.Results
                .Select(record => new HubSpotAssociationRecord
                {
                    Id = record.ToObjectId.ToString(),
                    Type = record.AssociationTypes.FirstOrDefault()?.Label ?? "company_to_deal",
                })
                .ToList();
        }

        var response = await SendAsync<HubSpotListResponse<HubSpotAssociationRecord>>(
            HttpMethod.Get,
            $"crm/v3/objects/{fromObjectType}/{objectId}/associations/{toObjectType}",
            payload: null,
            cancellationToken);

        return response.Results;
    }

    // 某些 HubSpot API 成功時幾乎不回 JSON，本方法專門處理這類「只看 HTTP 狀態」的呼叫。
    private async Task SendEmptyAsync(
        HttpMethod method,
        string route,
        CancellationToken cancellationToken,
        bool sendJsonBody = true)
    {
        using var request = new HttpRequestMessage(method, route);

        if (sendJsonBody && method != HttpMethod.Delete)
        {
            request.Content = new StringContent("{}", Encoding.UTF8, "application/json");
        }

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            ThrowApiError(body, response.StatusCode);
        }
    }

    // Contacts 與 Companies 的資料結構相近，因此共用同一組 list helper，
    // 讓 UI 維持簡單，同時仍走官方 CRM endpoints。
    private async Task<IReadOnlyList<HubSpotCrmRecord>> ListObjectsAsync(
        string objectType,
        IReadOnlyList<string> properties,
        int limit,
        CancellationToken cancellationToken)
        => await ListPagedObjectsAsync<HubSpotCrmRecord>(
            $"crm/v3/objects/{objectType}",
            properties,
            limit,
            cancellationToken);

    // HubSpot 單次最多只能抓 100 筆，所以這裡統一處理 after-based 分頁。
    private async Task<IReadOnlyList<TRecord>> ListPagedObjectsAsync<TRecord>(
        string routeBase,
        IReadOnlyList<string> properties,
        int limit,
        CancellationToken cancellationToken)
    {
        if (limit <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(limit), "Limit must be greater than zero.");
        }

        var propertyList = string.Join(",", properties);
        var remaining = limit;
        string? after = null;
        var records = new List<TRecord>(Math.Min(limit, MaxObjectsPerRequest));

        while (remaining > 0)
        {
            var pageSize = Math.Min(remaining, MaxObjectsPerRequest);
            var route =
                $"{routeBase}?limit={pageSize}&archived=false&properties={propertyList}" +
                (string.IsNullOrWhiteSpace(after) ? string.Empty : $"&after={Uri.EscapeDataString(after)}");

            var response = await SendAsync<HubSpotListResponse<TRecord>>(
                HttpMethod.Get,
                route,
                payload: null,
                cancellationToken);

            if (response.Results.Count == 0)
            {
                break;
            }

            records.AddRange(response.Results);
            remaining -= response.Results.Count;
            after = response.Paging?.Next?.After;

            if (string.IsNullOrWhiteSpace(after))
            {
                break;
            }
        }

        return records;
    }

    private Task<HubSpotCrmRecord> CreateObjectAsync(
        string objectType,
        HubSpotCrmMutationRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        return SendAsync<HubSpotCrmRecord>(
            HttpMethod.Post,
            $"crm/v3/objects/{objectType}",
            request,
            cancellationToken);
    }

    private Task<HubSpotCrmRecord> UpdateObjectAsync(
        string objectType,
        string objectId,
        HubSpotCrmMutationRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(objectId);
        ArgumentNullException.ThrowIfNull(request);

        return SendAsync<HubSpotCrmRecord>(
            HttpMethod.Patch,
            $"crm/v3/objects/{objectType}/{objectId}",
            request,
            cancellationToken);
    }

    private Task DeleteObjectAsync(
        string objectType,
        string objectId,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(objectId);

        return SendEmptyAsync(
            HttpMethod.Delete,
            $"crm/v3/objects/{objectType}/{objectId}",
            cancellationToken);
    }

    // 通用 HTTP helper：負責送 request、解析 JSON、把 HubSpot 錯誤統一包成自訂例外。
    private async Task<T> SendAsync<T>(
        HttpMethod method,
        string route,
        object? payload,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(method, route);

        if (payload is not null)
        {
            var body = JsonSerializer.Serialize(payload, JsonOptions);
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        }

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            ThrowApiError(responseBody, response.StatusCode);
        }

        var data = JsonSerializer.Deserialize<T>(responseBody, JsonOptions);
        if (data is null)
        {
            throw new InvalidOperationException("HubSpot returned an empty response body.");
        }

        return data;
    }

    private static void ValidateDealId(string dealId)
    {
        if (string.IsNullOrWhiteSpace(dealId))
        {
            throw new ArgumentException("Deal id is required.", nameof(dealId));
        }
    }

    // 保留 HubSpot 原始 response body，方便 UI 直接顯示 API 錯誤內容。
    private static void ThrowApiError(string responseBody, System.Net.HttpStatusCode statusCode)
    {
        string? message = null;

        if (!string.IsNullOrWhiteSpace(responseBody))
        {
            try
            {
                var error = JsonSerializer.Deserialize<HubSpotErrorResponse>(responseBody, JsonOptions);
                message = error?.Message;
            }
            catch (JsonException)
            {
                // 若 HubSpot 回傳的格式不符合預期，仍保留原始 body 供前端或除錯使用。
            }
        }

        throw new HubSpotApiException(
            (int)statusCode,
            message ?? "HubSpot request failed.",
            responseBody);
    }
}

public sealed class HubSpotApiException : Exception
{
    public HubSpotApiException(int statusCode, string message, string? responseBody)
        : base(message)
    {
        StatusCode = statusCode;
        ResponseBody = responseBody;
    }

    public int StatusCode { get; }

    public string? ResponseBody { get; }
}
