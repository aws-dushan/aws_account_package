using AwsAccounting.Api.Data;
using AwsAccounting.Api.Reconciliation;
using AwsAccounting.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace AwsAccounting.Api.Workers;

/// <summary>
/// Consumes queued reconciliation runs and processes them off the request thread.
/// Replaces the Redis-backed worker from the Next.js design — no external broker.
/// A failed run is marked "failed" with its error message so the UI can surface it.
/// </summary>
public sealed class RunWorker(RunQueue queue, IServiceScopeFactory scopes, ILogger<RunWorker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var runId in queue.ReadAllAsync(stoppingToken))
        {
            try
            {
                using var scope = scopes.CreateScope();
                var processor = scope.ServiceProvider.GetRequiredService<RunProcessor>();
                await processor.ProcessAsync(runId, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Reconciliation run {RunId} failed", runId);
                await MarkFailed(runId, ex.Message);
            }
        }
    }

    private async Task MarkFailed(Guid runId, string message)
    {
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var run = await db.Runs.FirstOrDefaultAsync(r => r.Id == runId);
            if (run != null)
            {
                run.Status = "failed";
                run.Stage = null;
                run.Error = message.Length > 1000 ? message[..1000] : message;
                run.CompletedAt = DateTimeOffset.UtcNow;
                await db.SaveChangesAsync();
            }
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Could not mark run {RunId} as failed", runId);
        }
    }
}
