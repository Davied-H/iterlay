export type FeedbackKind = "experience" | "feature" | "other";

export interface FeedbackPageContext {
  view: string;
  route: string;
  boardId?: string;
  boardName?: string;
  viewport: string;
  locale: string;
}

export interface FeedbackSubmitRequest {
  kind: FeedbackKind;
  content: string;
  pageContext: FeedbackPageContext;
}

export interface FeedbackSubmissionResult {
  id: string;
  status: string;
  createdAt: string;
}

export type FeedbackStatus = "pending" | "evaluating" | "needs_human" | "rejected" | "accepted" | "implementing" | "pr_open" | "failed" | "released" | "voided";

export interface FeedbackRunEvent {
  id: string;
  stage: string;
  status: string;
  summary: string;
  createdAt: string;
}

export interface FeedbackRun {
  id: string;
  status: string;
  decision?: "accept" | "reject" | "needs_human";
  changeType?: "fix" | "feature";
  rationale?: string;
  pullRequestUrl?: string;
  createdAt: string;
  updatedAt: string;
  events: FeedbackRunEvent[];
}

export interface FeedbackHistoryItem {
  id: string;
  kind: FeedbackKind;
  content: string;
  status: FeedbackStatus;
  pageContext: FeedbackPageContext;
  decisionSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackHistoryPage {
  items: FeedbackHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface FeedbackDetail extends FeedbackHistoryItem {
  runs: FeedbackRun[];
}

export interface ManagerFeedbackPayload extends FeedbackSubmitRequest {
  pageContext: FeedbackPageContext & Record<string, unknown>;
  screenshot?: string;
  screenshotContentType?: "image/jpeg";
}
