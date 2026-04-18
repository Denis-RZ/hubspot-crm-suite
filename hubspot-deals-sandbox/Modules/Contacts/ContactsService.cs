using HubSpotDealsSandbox.HubSpot;
using HubSpotDealsSandbox.HubSpot.Models;

namespace HubSpotDealsSandbox.Modules.Contacts;

public sealed class ContactsService
{
    private readonly HubSpotDealsClient _client;

    public ContactsService(HubSpotDealsClient client)
    {
        _client = client;
    }

    public async Task<IReadOnlyDictionary<string, object?>> BuildBootstrapAsync(
        CancellationToken cancellationToken = default)
    {
        var contacts = await _client.ListContactsAsync(100, cancellationToken);

        return new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["contacts"] = contacts
        };
    }

    public Task<IReadOnlyList<HubSpotCrmRecord>> ListAsync(
        int limit = 100,
        CancellationToken cancellationToken = default) =>
        _client.ListContactsAsync(limit, cancellationToken);

    public Task<HubSpotCrmRecord> CreateAsync(
        Dictionary<string, string?> properties,
        CancellationToken cancellationToken = default)
    {
        var request = new HubSpotCrmMutationRequest { Properties = properties };
        return _client.CreateContactAsync(request, cancellationToken);
    }

    public Task<HubSpotCrmRecord> UpdateAsync(
        string contactId,
        Dictionary<string, string?> properties,
        CancellationToken cancellationToken = default)
    {
        var request = new HubSpotCrmMutationRequest { Properties = properties };
        return _client.UpdateContactAsync(contactId, request, cancellationToken);
    }

    public Task DeleteAsync(
        string contactId,
        CancellationToken cancellationToken = default) =>
        _client.DeleteContactAsync(contactId, cancellationToken);
}
