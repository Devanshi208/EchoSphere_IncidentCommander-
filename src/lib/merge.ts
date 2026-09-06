import { ExtractionResult, IncidentState, IncidentFact } from "./types";

let counter = 0;
function id(prefix: string) {
  counter += 1;
  return `${prefix}_${Date.now()}_${counter}`;
}

// Finds existing facts/hypotheses whose text loosely matches one of the
// LLM's `relatedFactTexts` strings, so a flagged conflict can point at
// real item ids instead of just free text.
function findRelatedIds(state: IncidentState, needle: string): string[] {
  const lower = needle.toLowerCase();
  const all: IncidentFact[] = [...state.facts, ...state.hypotheses];
  return all
    .filter(
      (item) =>
        item.text.toLowerCase().includes(lower) ||
        lower.includes(item.text.toLowerCase())
    )
    .map((item) => item.id);
}

export function mergeExtraction(
  state: IncidentState,
  extraction: ExtractionResult,
  speaker: string
): IncidentState {
  const next: IncidentState = structuredClone(state);
  const now = new Date().toISOString();

  for (const f of extraction.facts ?? []) {
    if (!f.text?.trim()) continue;
    const item: IncidentFact = {
      id: id("fact"),
      text: f.text.trim(),
      type: f.type,
      source: speaker,
      timestamp: now,
    };
    if (f.type === "fact") {
      next.facts.push(item);
      next.timeline.push({ id: id("tl"), timestamp: now, label: `FACT: ${item.text}` });
    } else {
      next.hypotheses.push(item);
      next.timeline.push({
        id: id("tl"),
        timestamp: now,
        label: `HYPOTHESIS: ${item.text}`,
      });
    }
  }

  for (const c of extraction.conflicts ?? []) {
    if (!c.description?.trim()) continue;
    const itemIds = (c.relatedFactTexts ?? []).flatMap((t) => findRelatedIds(next, t));
    next.conflicts.push({
      id: id("conflict"),
      description: c.description.trim(),
      itemIds: [...new Set(itemIds)],
      resolved: false,
    });
    next.timeline.push({
      id: id("tl"),
      timestamp: now,
      label: `CONFLICT: ${c.description.trim()}`,
    });
  }

  for (const u of extraction.unknowns ?? []) {
    if (!u.question?.trim()) continue;
    // avoid re-adding a near-duplicate open unknown
    const alreadyOpen = next.unknowns.some(
      (existing) =>
        !existing.resolved &&
        existing.question.toLowerCase() === u.question.trim().toLowerCase()
    );
    if (alreadyOpen) continue;
    next.unknowns.push({
      id: id("unknown"),
      question: u.question.trim(),
      raisedAt: now,
      resolved: false,
    });
  }

  for (const a of extraction.actions ?? []) {
    if (!a.description?.trim()) continue;
    next.actions.push({
      id: id("action"),
      description: a.description.trim(),
      owner: a.owner ?? null,
      status: a.owner ? "assigned" : "proposed",
      requiresApproval: !!a.requiresApproval,
      approved: !a.requiresApproval,
    });
    next.timeline.push({
      id: id("tl"),
      timestamp: now,
      label: `ACTION: ${a.description.trim()}${a.owner ? ` (${a.owner})` : ""}`,
    });
  }

  for (const d of extraction.decisions ?? []) {
    if (!d.text?.trim()) continue;
    next.decisions.push({ id: id("decision"), text: d.text.trim(), timestamp: now });
    next.timeline.push({ id: id("tl"), timestamp: now, label: `DECISION: ${d.text.trim()}` });
  }

  if (!next.participants.includes(speaker)) {
    next.participants.push(speaker);
  }

  return next;
}
