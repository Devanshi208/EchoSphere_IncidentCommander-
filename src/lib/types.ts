// The "brain" of the whole project. Every conversation turn eventually
// gets folded into this shape. The dashboard just renders this object.

export type Confidence = "fact" | "hypothesis";

export interface IncidentFact {
  id: string;
  text: string;
  type: Confidence; // "fact" = confirmed, "hypothesis" = suspected/unconfirmed
  source: string; // who said it (speaker label)
  timestamp: string; // ISO time it was recorded
}

export interface IncidentConflict {
  id: string;
  description: string; // human-readable summary of the contradiction
  itemIds: string[]; // ids of the facts/hypotheses that conflict
  resolved: boolean;
}

export interface IncidentUnknown {
  id: string;
  question: string; // the missing piece of info, phrased as a question
  raisedAt: string;
  resolved: boolean;
}

export type ActionStatus = "proposed" | "assigned" | "in_progress" | "done";

export interface IncidentAction {
  id: string;
  description: string;
  owner: string | null;
  status: ActionStatus;
  requiresApproval: boolean;
  approved: boolean;
}

export interface IncidentDecision {
  id: string;
  text: string;
  timestamp: string;
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  label: string;
}

export interface IncidentState {
  status: "investigating" | "resolved";
  facts: IncidentFact[];
  hypotheses: IncidentFact[];
  conflicts: IncidentConflict[];
  unknowns: IncidentUnknown[];
  actions: IncidentAction[];
  decisions: IncidentDecision[];
  timeline: TimelineEvent[];
  participants: string[];
}

export function emptyState(): IncidentState {
  return {
    status: "investigating",
    facts: [],
    hypotheses: [],
    conflicts: [],
    unknowns: [],
    actions: [],
    decisions: [],
    timeline: [],
    participants: [],
  };
}

// Final incident report (section 15 of the brief). Generated on demand
// from the current IncidentState — never invented from scratch, and the
// prompt in summary.ts explicitly forbids proposing a root cause the
// state doesn't already support.
export interface IncidentSummary {
  impact: string;
  confirmedFacts: string[];
  hypotheses: string[];
  conflictingEvidence: string[];
  actionsTaken: string[];
  decisions: string[];
  unresolvedRisks: string[];
}

// This is the shape we force the LLM to return for every transcript line.
// Every field is optional because most lines won't produce every kind of event.
export interface ExtractionResult {
  facts?: { text: string; type: Confidence }[];
  conflicts?: { description: string; relatedFactTexts: string[] }[];
  unknowns?: { question: string }[];
  actions?: {
    description: string;
    owner: string | null;
    requiresApproval: boolean;
  }[];
  decisions?: { text: string }[];
  aiShouldSpeak?: boolean;
  aiSpeech?: string; // what the AI would say back into the room, if anything
}
