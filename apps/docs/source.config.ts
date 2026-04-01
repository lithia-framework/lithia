import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { z } from "zod";

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: z.object({
      full: z.boolean().optional(),
      title: z.string(),
      description: z.string(),
      preview: z.string().optional(),
      index: z.boolean().optional(),
    }),
  },
});

export default defineConfig();