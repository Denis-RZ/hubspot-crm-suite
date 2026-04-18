using Microsoft.AspNetCore.Mvc;

namespace HubSpotDealsSandbox.Modules.Contacts;

public static class ContactsEndpoints
{
    public static IEndpointRouteBuilder MapContactEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/contacts", async (
            ContactsService service,
            int? limit,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
                Results.Ok(await service.ListAsync(limit ?? 100, cancellationToken))));

        app.MapPost("/api/contacts", async (
            ContactsService service,
            [FromBody] Dictionary<string, string?> properties,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
                Results.Ok(await service.CreateAsync(properties, cancellationToken))));

        app.MapPatch("/api/contacts/{contactId}", async (
            ContactsService service,
            string contactId,
            [FromBody] Dictionary<string, string?> properties,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
                Results.Ok(await service.UpdateAsync(contactId, properties, cancellationToken))));

        app.MapDelete("/api/contacts/{contactId}", async (
            ContactsService service,
            string contactId,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
            {
                await service.DeleteAsync(contactId, cancellationToken);
                return Results.Ok(new { message = $"Deleted contact {contactId}" });
            }));

        return app;
    }
}
