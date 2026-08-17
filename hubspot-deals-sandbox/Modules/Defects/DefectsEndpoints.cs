using Microsoft.AspNetCore.Mvc;

namespace HubSpotDealsSandbox.Modules.Defects;

public static class DefectsEndpoints
{
    public static IEndpointRouteBuilder MapDefectEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/defects", async (
            DefectsService service,
            int? limit,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
                Results.Ok(await service.ListAsync(limit ?? 100, cancellationToken))));

        app.MapPost("/api/defects", async (
            DefectsService service,
            [FromBody] Dictionary<string, string?> properties,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
                Results.Ok(await service.CreateAsync(properties, cancellationToken))));

        app.MapPatch("/api/defects/{defectId}", async (
            DefectsService service,
            string defectId,
            [FromBody] Dictionary<string, string?> properties,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
                Results.Ok(await service.UpdateAsync(defectId, properties, cancellationToken))));

        app.MapDelete("/api/defects/{defectId}", async (
            DefectsService service,
            string defectId,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
            {
                await service.DeleteAsync(defectId, cancellationToken);
                return Results.Ok(new { message = $"Deleted defect {defectId}" });
            }));

        return app;
    }
}
