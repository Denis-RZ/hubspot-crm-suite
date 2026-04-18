using HubSpotDealsSandbox.HubSpot;
using HubSpotDealsSandbox.HubSpot.Models;

namespace HubSpotDealsSandbox.Modules.Companies;

public sealed class CompaniesService
{
    private readonly HubSpotDealsClient _client;

    public CompaniesService(HubSpotDealsClient client)
    {
        _client = client;
    }

    public async Task<IReadOnlyDictionary<string, object?>> BuildBootstrapAsync(
        CancellationToken cancellationToken = default)
    {
        var companiesTask = _client.ListCompaniesAsync(100, cancellationToken);
        var industryOptionsTask = _client.GetCompanyIndustryOptionsAsync(cancellationToken);

        await Task.WhenAll(companiesTask, industryOptionsTask);

        return new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["companies"] = await companiesTask,
            ["companyIndustryOptions"] = await industryOptionsTask
        };
    }

    public Task<IReadOnlyList<HubSpotCrmRecord>> ListAsync(
        int limit = 100,
        CancellationToken cancellationToken = default) =>
        _client.ListCompaniesAsync(limit, cancellationToken);

    public Task<HubSpotCrmRecord> CreateAsync(
        Dictionary<string, string?> properties,
        CancellationToken cancellationToken = default)
    {
        var request = new HubSpotCrmMutationRequest { Properties = properties };
        return _client.CreateCompanyAsync(request, cancellationToken);
    }

    public Task<HubSpotCrmRecord> UpdateAsync(
        string companyId,
        Dictionary<string, string?> properties,
        CancellationToken cancellationToken = default)
    {
        var request = new HubSpotCrmMutationRequest { Properties = properties };
        return _client.UpdateCompanyAsync(companyId, request, cancellationToken);
    }

    public Task DeleteAsync(
        string companyId,
        CancellationToken cancellationToken = default) =>
        _client.DeleteCompanyAsync(companyId, cancellationToken);
}
