export class FunctionPathTransformer {
  private readonly removeGroups = /\(([^([\\/]+)\)[\\/]/g;

  public normalizeIdentifier(rawName: string): string {
    const withoutGroups = rawName.replace(this.removeGroups, "");

    return withoutGroups
      .replace(/\\/g, "/")
      .split("/")
      .filter((part) => part.length > 0)
      .join(":");
  }

  public formatDisplayName(identifier: string): string {
    return identifier
      .split(":")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
}