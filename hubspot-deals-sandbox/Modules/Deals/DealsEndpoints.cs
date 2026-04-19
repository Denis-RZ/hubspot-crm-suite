using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;

namespace HubSpotDealsSandbox.Modules.Deals;

public static class DealsEndpoints
{
    private static readonly HashSet<string> AllowedObjectTypes =
        new(["contacts", "companies"], StringComparer.OrdinalIgnoreCase);

    public static IEndpointRouteBuilder MapDealEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/deals", async (
            DealsService service,
            int? limit,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
                Results.Ok(await service.ListAsync(limit ?? 50, cancellationToken))));

        app.MapPost("/api/deals/search", async (
            DealsService service,
            [FromBody] DealSearchBody body,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
            {
                if (string.IsNullOrWhiteSpace(body.Property))
                    return Results.BadRequest(new { error = "'property' is required." });
                if (string.IsNullOrWhiteSpace(body.Operator))
                    return Results.BadRequest(new { error = "'operator' is required." });
                if (string.IsNullOrWhiteSpace(body.Value))
                    return Results.BadRequest(new { error = "'value' is required." });

                return Results.Ok(await service.SearchAsync(body.Property, body.Operator, body.Value, cancellationToken));
            }));

        app.MapPost("/api/deals", async (
            DealsService service,
            [FromBody] Dictionary<string, string?> properties,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
                Results.Ok(await service.CreateAsync(properties, cancellationToken))));

        app.MapPatch("/api/deals/{dealId}", async (
            DealsService service,
            string dealId,
            [FromBody] Dictionary<string, string?> properties,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
                Results.Ok(await service.UpdateAsync(dealId, properties, cancellationToken))));

        app.MapDelete("/api/deals/{dealId}", async (
            DealsService service,
            string dealId,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
            {
                await service.DeleteAsync(dealId, cancellationToken);
                return Results.Ok(new { message = $"Deleted deal {dealId}" });
            }));

        app.MapPost("/api/associate", async (
            DealsService service,
            [FromBody] AssociateBody body,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
            {
                if (string.IsNullOrWhiteSpace(body.DealId))
                    return Results.BadRequest(new { error = "'dealId' is required." });
                if (string.IsNullOrWhiteSpace(body.ObjectId))
                    return Results.BadRequest(new { error = "'objectId' is required." });
                if (!AllowedObjectTypes.Contains(body.ObjectType ?? string.Empty))
                    return Results.BadRequest(new { error = $"'objectType' must be one of: {string.Join(", ", AllowedObjectTypes)}." });

                await service.AssociateAsync(body.DealId, body.ObjectType!, body.ObjectId, cancellationToken);
                return Results.Ok(new
                {
                    message = $"Associated deal {body.DealId} -> {body.ObjectType}/{body.ObjectId}"
                });
            }));

        app.MapGet("/api/associations/{dealId}/{objectType}", async (
            DealsService service,
            string dealId,
            string objectType,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
            {
                if (!AllowedObjectTypes.Contains(objectType))
                    return Results.BadRequest(new { error = $"'objectType' must be one of: {string.Join(", ", AllowedObjectTypes)}." });

                return Results.Ok(await service.GetAssociationsAsync(dealId, objectType, cancellationToken));
            }));

        app.MapGet("/api/pipelines", async (
            DealsService service,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
                Results.Ok(await service.GetPipelinesAsync(cancellationToken))));

        return app;
    }

    public sealed record DealSearchBody(
        [property: Required] string Property,
        [property: Required] string Operator,
        [property: Required] string Value);

    public sealed record AssociateBody(
        [property: Required] string DealId,
        [property: Required] string ObjectType,
        [property: Required] string ObjectId);
}
