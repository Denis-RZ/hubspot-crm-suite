using Microsoft.AspNetCore.Mvc;

namespace HubSpotDealsSandbox.Modules.Companies;

public static class CompaniesEndpoints
{
    public static IEndpointRouteBuilder MapCompanyEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/companies", async (
            CompaniesService service,
            int? limit,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
                Results.Ok(await service.ListAsync(limit ?? 100, cancellationToken))));

        app.MapPost("/api/companies", async (
            CompaniesService service,
            [FromBody] Dictionary<string, string?> properties,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
                Results.Ok(await service.CreateAsync(properties, cancellationToken))));

        app.MapPatch("/api/companies/{companyId}", async (
            CompaniesService service,
            string companyId,
            [FromBody] Dictionary<string, string?> properties,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
                Results.Ok(await service.UpdateAsync(companyId, properties, cancellationToken))));

        app.MapDelete("/api/companies/{companyId}", async (
            CompaniesService service,
            string companyId,
            CancellationToken cancellationToken) =>
            await ApiEndpointHelpers.ExecuteAsync(async () =>
            {
                await service.DeleteAsync(companyId, cancellationToken);
                return Results.Ok(new { message = $"Deleted company {companyId}" });
            }));

        return app;
    }
}
