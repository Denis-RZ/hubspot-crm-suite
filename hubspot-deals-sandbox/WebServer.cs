using System.Text.Json;
using HubSpotDealsSandbox.HubSpot;
using HubSpotDealsSandbox.HubSpot.Models;
using HubSpotDealsSandbox.ImportExport;
using Microsoft.AspNetCore.Mvc;

namespace HubSpotDealsSandbox;

public static class WebServer
{
    public static async Task RunAsync(string accessToken)
    {
        var builder = WebApplication.CreateBuilder(Array.Empty<string>());
        builder.WebHost.UseUrls("http://localhost:5100");
        builder.Logging.SetMinimumLevel(LogLevel.Warning);

        var app = builder.Build();
        var httpClient = new HttpClient();
        var client = new HubSpotDealsClient(httpClient, accessToken);
        var csvService = new CrmCsvService();

        // 這個 demo UI 會頻繁調整，因此停用瀏覽器快取，避免重啟後還載到舊版 HTML/JS。
        app.Use(async (context, next) =>
        {
            context.Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
            context.Response.Headers["Pragma"] = "no-cache";
            context.Response.Headers["Expires"] = "0";

            await next();
        });

        app.UseDefaultFiles();
        app.UseStaticFiles();

        // 前端啟動時需要多組 lookup 資料；集中成一個 bootstrap payload，
        // 可以減少瀏覽器端的複雜度，也避免一開始打太多平行 request。
        app.MapGet("/api/bootstrap", async () =>
            await ExecuteAsync(async () =>
            {
                var pipelinesTask = client.GetDealPipelinesAsync();
                var dealsTask = client.ListDealsAsync(50);
                var contactsTask = client.ListContactsAsync(100);
                var companiesTask = client.ListCompaniesAsync(100);
                var companyIndustryOptionsTask = client.GetCompanyIndustryOptionsAsync();

                await Task.WhenAll(
                    pipelinesTask,
                    dealsTask,
                    contactsTask,
                    companiesTask,
                    companyIndustryOptionsTask);

                return Results.Ok(new BootstrapPayload(
                    Pipelines: await pipelinesTask,
                    Deals: await dealsTask,
                    Contacts: await contactsTask,
                    Companies: await companiesTask,
                    CompanyIndustryOptions: await companyIndustryOptionsTask));
            }));

        app.MapGet("/api/deals", async (int? limit) =>
            await ExecuteAsync(async () => Results.Ok(await client.ListDealsAsync(limit ?? 50))));

        app.MapPost("/api/deals/search", async ([FromBody] SearchBody body) =>
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
                                PropertyName = body.Property,
                                Operator = body.Operator.ToUpperInvariant(),
                                Value = body.Value
                            }
                        ]
                    }
                ]
            };

            return await ExecuteAsync(async () => Results.Ok(await client.SearchDealsAsync(request)));
        });

        app.MapPost("/api/deals", async ([FromBody] Dictionary<string, string?> properties) =>
        {
            var request = new HubSpotDealMutationRequest { Properties = properties };
            return await ExecuteAsync(async () => Results.Ok(await client.CreateDealAsync(request)));
        });

        app.MapPatch("/api/deals/{dealId}", async (string dealId, [FromBody] Dictionary<string, string?> properties) =>
        {
            var request = new HubSpotDealMutationRequest { Properties = properties };
            return await ExecuteAsync(async () => Results.Ok(await client.UpdateDealAsync(dealId, request)));
        });

        app.MapDelete("/api/deals/{dealId}", async (string dealId) =>
            await ExecuteAsync(async () =>
            {
                await client.DeleteDealAsync(dealId);
                return Results.Ok(new { message = $"Deleted deal {dealId}" });
            }));

        app.MapGet("/api/contacts", async (int? limit) =>
            await ExecuteAsync(async () => Results.Ok(await client.ListContactsAsync(limit ?? 100))));

        app.MapPost("/api/contacts", async ([FromBody] Dictionary<string, string?> properties) =>
        {
            var request = new HubSpotCrmMutationRequest { Properties = properties };
            return await ExecuteAsync(async () => Results.Ok(await client.CreateContactAsync(request)));
        });

        app.MapPatch("/api/contacts/{contactId}", async (string contactId, [FromBody] Dictionary<string, string?> properties) =>
        {
            var request = new HubSpotCrmMutationRequest { Properties = properties };
            return await ExecuteAsync(async () => Results.Ok(await client.UpdateContactAsync(contactId, request)));
        });

        app.MapDelete("/api/contacts/{contactId}", async (string contactId) =>
            await ExecuteAsync(async () =>
            {
                await client.DeleteContactAsync(contactId);
                return Results.Ok(new { message = $"Deleted contact {contactId}" });
            }));

        app.MapGet("/api/companies", async (int? limit) =>
            await ExecuteAsync(async () => Results.Ok(await client.ListCompaniesAsync(limit ?? 100))));

        app.MapPost("/api/companies", async ([FromBody] Dictionary<string, string?> properties) =>
        {
            var request = new HubSpotCrmMutationRequest { Properties = properties };
            return await ExecuteAsync(async () => Results.Ok(await client.CreateCompanyAsync(request)));
        });

        app.MapPatch("/api/companies/{companyId}", async (string companyId, [FromBody] Dictionary<string, string?> properties) =>
        {
            var request = new HubSpotCrmMutationRequest { Properties = properties };
            return await ExecuteAsync(async () => Results.Ok(await client.UpdateCompanyAsync(companyId, request)));
        });

        app.MapDelete("/api/companies/{companyId}", async (string companyId) =>
            await ExecuteAsync(async () =>
            {
                await client.DeleteCompanyAsync(companyId);
                return Results.Ok(new { message = $"Deleted company {companyId}" });
            }));

        app.MapPost("/api/associate", async ([FromBody] AssociateBody body) =>
            await ExecuteAsync(async () =>
            {
                await client.AssociateDealAsync(body.DealId, body.ObjectType, body.ObjectId);
                return Results.Ok(new
                {
                    message = $"Associated deal {body.DealId} -> {body.ObjectType}/{body.ObjectId}"
                });
            }));

        app.MapGet("/api/associations/{dealId}/{objectType}", async (string dealId, string objectType) =>
            await ExecuteAsync(async () => Results.Ok(await client.GetDealAssociationsAsync(dealId, objectType))));

        app.MapGet("/api/pipelines", async () =>
            await ExecuteAsync(async () => Results.Ok(await client.GetDealPipelinesAsync())));

        app.MapGet("/api/export/{objectType}", async (string objectType, CancellationToken cancellationToken) =>
            await ExecuteAsync(async () =>
            {
                var export = await csvService.ExportAsync(objectType, client, cancellationToken);
                return Results.File(export.Content, export.ContentType, export.FileName);
            }));

        app.MapGet("/api/export/{objectType}/template", (string objectType) =>
            ExecuteAsync(() =>
            {
                var template = csvService.BuildTemplate(objectType);
                return Task.FromResult<IResult>(
                    Results.File(template.Content, template.ContentType, template.FileName));
            }));

        app.MapPost("/api/import/{objectType}/preview", async (
            string objectType,
            HttpRequest request,
            CancellationToken cancellationToken) =>
            await ExecuteAsync(async () =>
            {
                var file = await ReadUploadedCsvAsync(request, cancellationToken);
                await using var stream = file.OpenReadStream();
                var preview = await csvService.PreviewAsync(
                    objectType,
                    file.FileName,
                    stream,
                    client,
                    cancellationToken);

                return Results.Ok(preview);
            }));

        app.MapPost("/api/import/{objectType}/apply", async (
            string objectType,
            HttpRequest request,
            CancellationToken cancellationToken) =>
            await ExecuteAsync(async () =>
            {
                var file = await ReadUploadedCsvAsync(request, cancellationToken);
                await using var stream = file.OpenReadStream();
                var apply = await csvService.ApplyAsync(
                    objectType,
                    file.FileName,
                    stream,
                    client,
                    cancellationToken);

                return apply.AttemptedRows == 0 && apply.FailedRows > 0
                    ? Results.BadRequest(apply)
                    : Results.Ok(apply);
            }));

        // 保留第一版 sandbox 的舊 API 路徑，避免既有按鈕或腳本失效。
        app.MapGet("/api/list", async (int? limit) =>
            await ExecuteAsync(async () => Results.Ok(await client.ListDealsAsync(limit ?? 50))));

        app.MapPost("/api/search", async ([FromBody] SearchBody body) =>
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
                                PropertyName = body.Property,
                                Operator = body.Operator.ToUpperInvariant(),
                                Value = body.Value
                            }
                        ]
                    }
                ]
            };

            return await ExecuteAsync(async () => Results.Ok(await client.SearchDealsAsync(request)));
        });

        app.MapPost("/api/create", async ([FromBody] Dictionary<string, string?> properties) =>
        {
            var request = new HubSpotDealMutationRequest { Properties = properties };
            return await ExecuteAsync(async () => Results.Ok(await client.CreateDealAsync(request)));
        });

        app.Lifetime.ApplicationStarted.Register(() =>
        {
            Console.WriteLine("Web UI running at http://localhost:5100");
            Console.WriteLine("Press Ctrl+C to stop.");

            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("http://localhost:5100")
                {
                    UseShellExecute = true
                });
            }
            catch
            {
                // Opening the browser is optional.
            }
        });

        await app.RunAsync();
    }

    // 統一把參數錯誤、HubSpot API 錯誤轉成前端可讀的 HTTP response。
    private static async Task<IResult> ExecuteAsync(Func<Task<IResult>> action)
    {
        try
        {
            return await action();
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { message = ex.Message });
        }
        catch (HubSpotApiException ex)
        {
            return CreateHubSpotErrorResult(ex);
        }
    }

    // 匯入只接受 form field 名稱為 file 的非空 CSV 檔。
    private static async Task<IFormFile> ReadUploadedCsvAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var form = await request.ReadFormAsync(cancellationToken);
        var file = form.Files["file"];

        if (file is null || file.Length == 0)
        {
            throw new InvalidOperationException("Upload a non-empty CSV file in the form field named 'file'.");
        }

        return file;
    }

    // 優先把 HubSpot 原始錯誤 JSON 透傳給前端，方便直接在 UI 顯示細節。
    private static IResult CreateHubSpotErrorResult(HubSpotApiException ex)
    {
        object payload;

        if (!string.IsNullOrWhiteSpace(ex.ResponseBody))
        {
            try
            {
                payload = JsonSerializer.Deserialize<JsonElement>(ex.ResponseBody);
            }
            catch (JsonException)
            {
                payload = new
                {
                    message = ex.Message,
                    details = ex.ResponseBody
                };
            }
        }
        else
        {
            payload = new { message = ex.Message };
        }

        return Results.Json(payload, statusCode: ex.StatusCode);
    }

    public record SearchBody(string Property, string Operator, string Value);
    public record AssociateBody(string DealId, string ObjectType, string ObjectId);
    public record BootstrapPayload(
        IReadOnlyList<HubSpotPipeline> Pipelines,
        IReadOnlyList<HubSpotDealRecord> Deals,
        IReadOnlyList<HubSpotCrmRecord> Contacts,
        IReadOnlyList<HubSpotCrmRecord> Companies,
        IReadOnlyList<HubSpotPropertyOption> CompanyIndustryOptions);
}
