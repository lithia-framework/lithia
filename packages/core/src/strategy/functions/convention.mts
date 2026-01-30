export type FunctionTrigger = "CRON" | "TASK";

export interface ExtractedFunction {
  trigger: FunctionTrigger;
  rawName: string;
}

export class FunctionConvention {
  private readonly functionRegex = 
    /^(.*?)(?:\.(cron))?\.(mts|mjs|ts|js)$/i;

  public extractFunction(filePath: string): ExtractedFunction {
    const cleanPath = filePath
      .replace(/\\/g, "/")
      .replace(/^(app\/)?functions\//, "");

    const match = cleanPath.match(this.functionRegex);
    
    const isCron = match?.[2]?.toLowerCase() === "cron";
    const rawName = match?.[1] || cleanPath;

    return {
      trigger: isCron ? "CRON" : "TASK",
      rawName,
    };
  }
}