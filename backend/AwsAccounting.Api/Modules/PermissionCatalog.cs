namespace AwsAccounting.Api.Modules;

/// <summary>Single source of truth for modules and their capability keys.</summary>
public static class PermissionCatalog
{
    public record Feature(string Key, string Label);
    public record Module(string Key, string Name, Feature[] Features);

    public static readonly Module[] Modules =
    [
        new("ar-reconciliation", "AR Reconciliation",
        [
            new("view", "View runs & dashboard"),
            new("run.create", "Create & execute a reconciliation"),
            new("exception.approve", "Approve exceptions"),
            new("exception.adjust", "Manually adjust matches"),
            new("report.export", "Export reports"),
            new("rules.configure", "Configure rules & tolerances"),
            new("run.delete", "Delete runs"),
        ]),
    ];

    public static readonly HashSet<string> AllKeys =
        Modules.SelectMany(m => m.Features.Select(f => $"{m.Key}.{f.Key}")).ToHashSet();

    public static bool IsValid(string key) => AllKeys.Contains(key);
}
