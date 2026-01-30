const withBase = (path: string, base: string): string => {
  if (!base || base === "/") return path;
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
};

export class EventPathTransformer {
  private readonly removeExt = /\.(mts|mjs|ts|js)$/i;
  private readonly removeGroups = /\(([^([\\/]+)\)[\\/]/g;


  public normalize(pathStr: string): string {
    const s = pathStr
      .replace(/\\/g, "/")
      .replace(this.removeExt, "")
      .replace(this.removeGroups, "");

    return s.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
  }

  public normalizePath(pathStr: string, globalPrefix: string = ""): string {
    const combined = withBase(pathStr, globalPrefix);

    const noTrailing =
      combined.endsWith("/") && combined.length > 1
        ? combined.slice(0, -1)
        : combined;

    return noTrailing.startsWith("/") ? noTrailing : `/${noTrailing}`;
  }
}