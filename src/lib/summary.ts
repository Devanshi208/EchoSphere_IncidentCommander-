import { IncidentState, IncidentSummary } from "./types";

const SUMMARY_TOOL = {
  name: "write_incident_summary",
  description: "Write the final structured incident report from the given state.",
  input_schema: {
    type: "object" as const,
    properties: {
      impact: {
        type: "string",
        description:
          "One or two sentences on customer/business impact, based ONLY on facts already in state. If impact was never established, say so plainly instead of guessing.",
      },
      confirmedFacts: { type: "array", items: { type: "string" } },
      hypotheses: { type: "array", items: { type: "string" } },
      conflictingEvidence: { type: "array", items: { type: "string" } },
      actionsTaken: { type: "array", items: { type: "string" } },
      decisions: { type: "array", items: { type: "string" } },
      unresolvedRisks: {
        type: "array",
        items: { type: "string" },
        description:
          "Open unknowns and unresolved conflicts — things the team should NOT treat as settled.",
      },
    },
    required: [
      "impact",
      "confirmedFacts",
      "hypotheses",
      "conflictingEvidence",
      "actionsTaken",
      "decisions",
      "unresolvedRisks",
    ],
  },
};

export async function generateSummary(state: IncidentState): Promise<IncidentSummary> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system:
        "You write the closing report for an incident-response tool. Rewrite the given state into clear prose bullet points. Do NOT add any fact, cause, or number that isn't already present in the state below — if something is unknown, say it's unknown rather than filling it in. Do not resolve unresolved conflicts yourself.",
      messages: [
        {
          role: "user",
          content: `INCIDENT STATE (JSON):\n${JSON.stringify(state, null, 2)}`,
        },
      ],
      tools: [SUMMARY_TOOL],
      tool_choice: { type: "tool", name: "write_incident_summary" },
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const toolUse = (data.content ?? []).find(
    (b: { type: string }) => b.type === "tool_use"
  );
  if (!toolUse) throw new Error("model did not return a summary");
  return toolUse.input as IncidentSummary;
}
