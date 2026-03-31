export type MatchedMethodSuffix =
  | "DELETE"
  | "GET"
  | "HEAD"
  | "OPTIONS"
  | "PATCH"
  | "POST"
  | "PUT";

export interface ExtractedMethod {
  method: MatchedMethodSuffix | null;
  updatedPath: string;
}

export class RouteConvention {
  private readonly routeRegex =
    /(?:^|[\\/])route(\.(delete|get|head|options|patch|post|put))?\.(mts|mjs|ts|js)$/i;

  public extractMethod(filePath: string): ExtractedMethod {
    const normalizedPath = filePath.replace(/\\/g, "/");
    const match = normalizedPath.match(this.routeRegex);

    const methodStr = match?.[2]?.toUpperCase() as
      | MatchedMethodSuffix
      | undefined;

    const rawPath = normalizedPath.replace(this.routeRegex, "");

    return {
      method: methodStr || null,
      updatedPath: rawPath,
    };
  }
}