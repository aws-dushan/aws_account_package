namespace AwsAccounting.Api.Domain;

public class FileRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Kind { get; set; } = "";          // statement | customer | report
    public string OriginalName { get; set; } = "";
    public string? Mime { get; set; }
    public int? SizeBytes { get; set; }
    public string Sha256 { get; set; } = "";
    public string? StorageKey { get; set; }
    public Guid? UploadedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class ReconciliationRun
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Name { get; set; } = "";
    public string Status { get; set; } = "draft";   // draft|queued|running|completed|failed
    public string? Stage { get; set; }
    public Guid? StatementFileId { get; set; }
    public Guid? CustomerFileId { get; set; }
    public decimal? AutoMatchPct { get; set; }
    public decimal? MatchedValue { get; set; }
    public string? Error { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}

public class LedgerLine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RunId { get; set; }
    public Guid TenantId { get; set; }
    public string Side { get; set; } = "";          // statement | customer
    public string? Reference { get; set; }
    public string? NormRef { get; set; }
    public DateOnly? TxnDate { get; set; }
    public string? Description { get; set; }
    public decimal Debit { get; set; }
    public decimal Credit { get; set; }
    public decimal Amount { get; set; }
    public int? SourceRow { get; set; }
    public Guid? MatchId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class MatchEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RunId { get; set; }
    public Guid TenantId { get; set; }
    public string RuleCode { get; set; } = "";      // R, RA, RE, F, 1:M, M:1
    public string Method { get; set; } = "rule";    // rule | ai
    public decimal? Confidence { get; set; }
    public string Status { get; set; } = "auto";    // auto | ai_suggested | user_confirmed
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public class MatchLine
{
    public Guid MatchId { get; set; }
    public Guid LedgerLineId { get; set; }
}

public class ExceptionRow
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RunId { get; set; }
    public Guid TenantId { get; set; }
    public Guid? LedgerLineId { get; set; }
    public string CategoryCode { get; set; } = "";  // D, E, BAR, F, FR
    public string Severity { get; set; } = "";      // g|a|c|r|n
    public decimal? Amount { get; set; }
    public string? AiExplanation { get; set; }
    public string? AiRecommendation { get; set; }
    public string? AiModel { get; set; }
    public string Status { get; set; } = "open";    // open|ai_suggested|approved|adjusted|resolved
    public Guid? ResolvedBy { get; set; }
    public string? ResolutionNote { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Learned column mapping, keyed by header fingerprint per tenant.</summary>
public class LedgerMapping
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Fingerprint { get; set; } = "";
    public string? Side { get; set; }
    public string Mapping { get; set; } = "";       // JSON
    public string Source { get; set; } = "auto";    // auto | ai | manual
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
