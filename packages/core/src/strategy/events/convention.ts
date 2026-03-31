export class EventConvention {
  public extractEventPath(filePath: string): string {
    const p = filePath.replace(/\\/g, "/");
    return p.replace(/^(app\/)?events\//, "");
  }
}