using System.Threading.Channels;

namespace AwsAccounting.Api.Services;

/// <summary>In-process queue of reconciliation run IDs awaiting background processing.</summary>
public sealed class RunQueue
{
    private readonly Channel<Guid> _channel = Channel.CreateUnbounded<Guid>(
        new UnboundedChannelOptions { SingleReader = true, SingleWriter = false });

    public ValueTask EnqueueAsync(Guid runId, CancellationToken ct = default) => _channel.Writer.WriteAsync(runId, ct);

    public IAsyncEnumerable<Guid> ReadAllAsync(CancellationToken ct) => _channel.Reader.ReadAllAsync(ct);
}
