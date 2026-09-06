import { ExtractionResult, IncidentState } from "./types";

// This is the ONE place the LLM touches the incident state. It never writes
// directly to state — it only returns structured JSON (via forced tool use),
// which merge.ts then validates and applies. That separation is what keeps
// a weird model output from corrupting the whole incident.

const EXTRACTION_TOOL = {
  name: "record_incident_events",
  description:
    "Record what happened in this transcript line as structured incident events. Only include fields that genuinely apply — most lines will only touch one or two.",
  input_schema: {
    type: "object" as const,
    properties: {
      facts: {
        type: "array",
        description:
          "Concrete claims made in this line. type='fact' ONLY if stated with certainty (checked, confirmed, saw it directly). type='hypothesis' if hedged (\"I think\", \"maybe\", \"could be\", \"seems like\").",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            type: { type: "string", enum: ["fact", "hypothesis"] },
          },
          required: ["text", "type"],
        },
      },
      conflicts: {
        type: "array",
        description:
          "Only include if this line contradicts something already in CURRENT STATE below.",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            relatedFactTexts: {
              type: "array",
              items: { type: "string" },
              description:
                "Short quotes/paraphrases identifying the existing fact(s)/hypothesis(es) this conflicts with.",
            },
          },
          required: ["description", "relatedFactTexts"],
        },
      },
      unknowns: {
        type: "array",
        description:
          "Important open questions this line raises or implies, that aren't yet answered anywhere in CURRENT STATE.",
        items: {
          type: "object",
          properties: { question: { type: "string" } },
          required: ["question"],
        },
      },
      actions: {
        type: "array",
        description:
          "Tasks someone commits to doing (\"I'll check X\", \"can someone verify Y\").",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            owner: { type: ["string", "null"] },
            requiresApproval: {
              type: "boolean",
              description:
                "true if this action would touch external systems (tickets, deploys, pages) and needs human approval before executing.",
            },
          },
          required: ["description", "owner", "requiresApproval"],
        },
      },
      decisions: {
        type: "array",
        description: "Explicit team decisions/agreements stated in this line.",
        items: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
      },
      aiShouldSpeak: {
        type: "boolean",
        description:
          "Set this true whenever ANY of these just happened in this line: (1) a new conflict was just detected against existing state, (2) a new important unknown was raised, (3) an action was proposed or assigned and needs an owner, (4) a decision was made and should be confirmed as recorded, (5) an action requires approval before it can execute, (6) the team seems stuck or confused and a status recap would help. Default false only for plain factual statements that don't need a reaction. Err toward speaking up when in doubt — this is a live incident room, a commander that stays silent through a detected conflict is failing its job.",
      },
      aiSpeech: {
        type: "string",
        description:
          "One to three short sentences to speak into the room, only if aiShouldSpeak is true. Be concise and operational, matching these patterns:\n" +
          "- New fact: \"Confirmed. Checkout failures began at approximately 14:07 UTC.\"\n" +
          "- Hypothesis flagged: \"That's currently a hypothesis, not a confirmed cause.\"\n" +
          "- Conflict: \"I have a conflict: Maya reports the database is slow, Jordan reports it's normal. Which should we verify?\"\n" +
          "- Unknown: \"We don't yet know whether this affects all regions. Can someone verify?\"\n" +
          "- Action needs owner: \"We need someone to check the payment provider. Who owns that?\"\n" +
          "- Decision recorded: \"Decision recorded. We're rolling back the deployment.\"\n" +
          "CRITICAL RULE: if this action requiresApproval, aiSpeech MUST phrase it as a question awaiting human confirmation — e.g. \"Rollback the payment service deployment? I need confirmation before that executes.\" NEVER phrase an approval-required action as already done or in progress (e.g. never \"Rolling back now\") — that misrepresents an action that hasn't actually been approved or executed yet.",
      },
    },
    required: [],
  },
};

function summarizeStateForPrompt(state: IncidentState): string {
  const lines: string[] = [];
  state.facts.forEach((f) => lines.push(`FACT: ${f.text}`));
  state.hypotheses.forEach((h) => lines.push(`HYPOTHESIS: ${h.text}`));
  state.unknowns
    .filter((u) => !u.resolved)
    .forEach((u) => lines.push(`OPEN UNKNOWN: ${u.question}`));
  state.actions.forEach((a) =>
    lines.push(`ACTION (${a.status}, owner=${a.owner ?? "unassigned"}): ${a.description}`)
  );
  return lines.length ? lines.join("\n") : "(nothing recorded yet)";
}

export async function extractFromLine(
  speaker: string,
  text: string,
  state: IncidentState
): Promise<ExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (see README)."
    );
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system:
        "You are EchoSphere, an AI Incident Commander participating in a live technical incident room. " +
        "Your job is not to guess the root cause — it is to listen, organize evidence, make uncertainty visible, and help the team coordinate. " +
        "Core principle: the AI organizes evidence and uncertainty, it does not manufacture certainty. " +
        "You read ONE new transcript line at a time against the current incident state, and decide what, if anything, belongs in the structured record. " +
        "Be conservative about WHAT you extract: only record what this specific line actually states or implies, never invent facts, causes, or tool results. " +
        "Never turn a hypothesis into a fact. Never silently resolve a conflict yourself — flag it and let a human resolve it. " +
        "Be generous about WHEN you speak: this is a live voice room, and a commander that stays silent through a real conflict, a blocking unknown, or an action needing approval is failing the team. " +
        "When you do speak, be concise and operational (one to three sentences), in the voice of an incident commander, not a chatbot — see the aiSpeech field for exact tone and phrasing patterns, including the mandatory question-phrasing for any action that requires approval.",
      messages: [
        {
          role: "user",
          content: `CURRENT STATE:\n${summarizeStateForPrompt(state)}\n\nNEW LINE:\n${speaker}: "${text}"`,
        },
      ],
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "record_incident_events" },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const toolUse = (data.content ?? []).find(
    (block: { type: string }) => block.type === "tool_use"
  );
  if (!toolUse) return {};
  return toolUse.input as ExtractionResult;
}
