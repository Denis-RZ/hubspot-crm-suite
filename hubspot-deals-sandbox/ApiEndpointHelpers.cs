using System.Text.Json;
using HubSpotDealsSandbox.HubSpot;

namespace HubSpotDealsSandbox;

public static class ApiEndpointHelpers
{
    public static async Task<IResult> ExecuteAsync(Func<Task<IResult>> action)
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

    public static async Task<IFormFile> ReadUploadedCsvAsync(
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

    public static IResult CreateHubSpotErrorResult(HubSpotApiException ex)
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
}
