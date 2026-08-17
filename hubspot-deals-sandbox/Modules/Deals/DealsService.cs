using HubSpotDealsSandbox.Data;
using HubSpotDealsSandbox.HubSpot.Models;

namespace HubSpotDealsSandbox.Modules.Deals;

public sealed class DealsService
{
    private readonly LocalCrmStore _client;
    private readonly ModuleAvailability _moduleAvailability;

    public DealsService(
        LocalCrmStore client,
        ModuleAvailability moduleAvailability)
    {
        _client = client;
        _moduleAvailability = moduleAvailability;
    }

    public async Task<IReadOnlyDictionary<string, object?>> BuildBootstrapAsync(
        CancellationToken cancellationToken = default)
    {
        var pipelinesTask = _client.GetDealPipelinesAsync(cancellationToken);
        var dealsTask = _client.ListDealsAsync(50, cancellationToken);

        await Task.WhenAll(pipelinesTask, dealsTask);

        return new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["pipelines"] = await pipelinesTask,
            ["deals"] = await dealsTask
        };
    }

    public Task<IReadOnlyList<HubSpotDealRecord>> ListAsync(
        int limit = 50,
        CancellationToken cancellationToken = default) =>
        _client.ListDealsAsync(limit, cancellationToken);

    public Task<IReadOnlyList<HubSpotPipeline>> GetPipelinesAsync(
        CancellationToken cancellationToken = default) =>
        _client.GetDealPipelinesAsync(cancellationToken);

    public Task<IReadOnlyList<HubSpotDealRecord>> SearchAsync(
        string property,
        string @operator,
        string value,
        CancellationToken cancellationToken = default)
    {
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
                            PropertyName = property,
                            Operator = @operator.ToUpperInvariant(),
                            Value = value
                        }
                    ]
                }
            ]
        };

        return _client.SearchDealsAsync(request, cancellationToken);
    }

    public Task<HubSpotDealRecord> CreateAsync(
        Dictionary<string, string?> properties,
        CancellationToken cancellationToken = default)
    {
        var request = new HubSpotDealMutationRequest { Properties = properties };
        return _client.CreateDealAsync(request, cancellationToken);
    }

    public Task<HubSpotDealRecord> UpdateAsync(
        string dealId,
        Dictionary<string, string?> properties,
        CancellationToken cancellationToken = default)
    {
        var request = new HubSpotDealMutationRequest { Properties = properties };
        return _client.UpdateDealAsync(dealId, request, cancellationToken);
    }

    public Task DeleteAsync(
        string dealId,
        CancellationToken cancellationToken = default) =>
        _client.DeleteDealAsync(dealId, cancellationToken);

    public async Task AssociateAsync(
        string dealId,
        string objectType,
        string objectId,
        CancellationToken cancellationToken = default)
    {
        _moduleAvailability.EnsureEnabled(objectType);
        await _client.AssociateDealAsync(dealId, objectType, objectId, cancellationToken);
    }

    public Task<IReadOnlyList<HubSpotAssociationRecord>> GetAssociationsAsync(
        string dealId,
        string objectType,
        CancellationToken cancellationToken = default)
    {
        _moduleAvailability.EnsureEnabled(objectType);
        return _client.GetDealAssociationsAsync(dealId, objectType, cancellationToken);
    }

    public Task<IReadOnlyList<HubSpotAssociationRecord>> GetObjectAssociationsAsync(
        string fromObjectType,
        string objectId,
        string toObjectType,
        CancellationToken cancellationToken = default)
    {
        _moduleAvailability.EnsureEnabled(fromObjectType);
        _moduleAvailability.EnsureEnabled(toObjectType);
        return _client.GetObjectAssociationsAsync(fromObjectType, objectId, toObjectType, cancellationToken);
    }
}
