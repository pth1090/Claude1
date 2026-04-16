import Anthropic from "@anthropic-ai/sdk";
import type { Author } from "./types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PRODUCT_TAGS = [
  "Flow / Microreactor",
  "SyrDos",
  "LabMan",
  "LabVision",
  "LabKit",
  "LabBox",
  "RAMOS",
  "AutoSam",
  "Filtration",
  "DOE",
];

const FOCUS_TAGS = [
  "Flow Chemistry",
  "Crystallization",
  "Calorimetry",
  "Polymerization",
  "Biotechnology (OTR/RAMOS)",
  "Solvent Extraction",
  "Self-optimization / Machine Learning",
  "Scale-up",
  "Hydrogenation",
  "Spectroscopy / PAT",
];

export interface CategorizationResult {
  summary: string;
  product_tags: string[];
  focus_tags: string[];
}

export async function summarizeAndCategorize(params: {
  title: string;
  authors: Author[];
  year: number | null;
  journal: string | null;
  abstract: string | null;
}): Promise<CategorizationResult> {
  const authorStr =
    params.authors.length > 0
      ? params.authors.map((a) => `${a.given} ${a.family}`).join(", ")
      : "Unknown authors";

  const abstractText = params.abstract
    ? params.abstract
    : "Abstract not available — please infer from the title and journal context.";

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system:
      "You are a research assistant for HaiBay, a laboratory automation company. " +
      "Given a scientific paper's metadata, write a concise 2–3 sentence summary explaining what the research " +
      "demonstrates and how it relates to laboratory automation or HaiBay products. " +
      "Then identify which product tags and research focus tags from the provided lists apply to the paper. " +
      "Only select tags that clearly match — do not guess. Return your answer using the provided tool.",
    tools: [
      {
        name: "categorize_paper",
        description: "Return a summary and tag categorization for the paper",
        input_schema: {
          type: "object" as const,
          properties: {
            summary: {
              type: "string",
              description:
                "2–3 sentence summary of the paper and its relevance to lab automation",
            },
            product_tags: {
              type: "array",
              items: { type: "string" },
              description: "Matching product tags from the provided list",
            },
            focus_tags: {
              type: "array",
              items: { type: "string" },
              description: "Matching research focus tags from the provided list",
            },
          },
          required: ["summary", "product_tags", "focus_tags"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "categorize_paper" },
    messages: [
      {
        role: "user",
        content: `Please categorize the following paper:

Title: ${params.title}
Authors: ${authorStr}
Year: ${params.year ?? "Unknown"}
Journal: ${params.journal ?? "Unknown"}
Abstract: ${abstractText}

Available product tags (select all that apply):
${PRODUCT_TAGS.map((t) => `- ${t}`).join("\n")}

Available research focus tags (select all that apply):
${FOCUS_TAGS.map((t) => `- ${t}`).join("\n")}`,
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a tool_use response");
  }

  const result = toolUse.input as CategorizationResult;

  // Validate that returned tags are from the allowed lists
  result.product_tags = result.product_tags.filter((t) => PRODUCT_TAGS.includes(t));
  result.focus_tags = result.focus_tags.filter((t) => FOCUS_TAGS.includes(t));

  return result;
}
