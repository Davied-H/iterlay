import type { ComicGenerationCostItem } from "../shared/comic-drama.js";

export interface PaidMediaQuote {
  quoteId: string;
  clientRequestId: string;
  inputFingerprint: string;
  providerKey: string;
  expiresAt: string;
  priceSnapshot: ComicGenerationCostItem & { authoritative: true };
}

export interface PaidMediaQuoteMetadata {
  generationAttemptId?: string;
  inputFingerprint?: string;
  quoteId?: string;
  quoteExpiresAt?: string;
  idempotencyKey?: string;
  priceSnapshot?: ComicGenerationCostItem;
  quoteBoardId?: string;
  quoteRequestScope?: string;
  quotePurpose?: string;
  quoteOperation?: string;
}

export interface PaidMediaQuoteBinding {
  boardId: string;
  requestScope: string;
  purpose: string;
  operation: string;
}

export function paidProviderClientRequestId(metadata: Pick<PaidMediaQuoteMetadata, "generationAttemptId" | "idempotencyKey">): string | undefined {
  return metadata.generationAttemptId?.trim() || metadata.idempotencyKey?.trim() || undefined;
}

export interface PaidVideoPricingItem {
  providerId: string;
  model?: string;
  durationSeconds: number;
  resolution?: string;
  generateAudio?: boolean;
}

export function paidVideoPricingKey(items: readonly PaidVideoPricingItem[]): string {
  return JSON.stringify(items.map((item) => ({
    providerId: item.providerId,
    model: item.model ?? "",
    durationSeconds: item.durationSeconds,
    resolution: item.resolution ?? "",
    generateAudio: item.generateAudio === true
  })));
}

interface QuoteRecord extends PaidMediaQuote, PaidMediaQuoteBinding {
  accountIdentity: string;
  balanceAtIssue: number;
  pricingKey: string;
}

interface ConsumptionRecord {
  idempotencyKey: string;
  bindingKey: string;
  state: "pending" | "committed";
  result: Promise<unknown>;
}

export class PaidMediaQuoteService {
  private readonly quotes = new Map<string, QuoteRecord>();
  private readonly consumptions = new Map<string, ConsumptionRecord>();
  private ledgerQueue: Promise<void> = Promise.resolve();

  constructor(private readonly accountIdentity: () => Promise<string> = async () => "local-license") {}

  async issue(input: {
    clientRequestId: string;
    inputFingerprint: string;
    providerKey: string;
    stage: ComicGenerationCostItem["stage"];
    amount: number;
    currency: string;
    balance: number;
    pricingKey: string;
  } & PaidMediaQuoteBinding): Promise<PaidMediaQuote> {
    if (!input.clientRequestId.trim() || !input.inputFingerprint.trim() || !input.providerKey.trim()) {
      throw new Error("付费媒体报价请求缺少客户端请求标识、输入指纹或 Provider。");
    }
    if (!input.boardId.trim() || !input.requestScope.trim() || !input.purpose.trim() || !input.operation.trim()) {
      throw new Error("付费媒体报价请求缺少画板、请求范围、用途或操作绑定。");
    }
    if (!Number.isFinite(input.amount) || input.amount < 0 || !Number.isFinite(input.balance) || input.balance < input.amount) {
      throw new Error(`余额不足，本次需要 ${input.amount} ${input.currency}。`);
    }
    this.prune();
    const identity = await this.accountIdentity();
    if (!identity.trim()) throw new Error("无法确认付费媒体报价所属的账号或授权身份。");
    const quote: QuoteRecord = {
      quoteId: crypto.randomUUID(),
      clientRequestId: input.clientRequestId,
      inputFingerprint: input.inputFingerprint,
      providerKey: input.providerKey,
      expiresAt: new Date(Date.now() + 2 * 60_000).toISOString(),
      priceSnapshot: { stage: input.stage, amount: input.amount, currency: input.currency, authoritative: true },
      accountIdentity: identity,
      boardId: input.boardId,
      requestScope: input.requestScope,
      purpose: input.purpose,
      operation: input.operation,
      balanceAtIssue: input.balance,
      pricingKey: input.pricingKey
    };
    this.quotes.set(quote.quoteId, quote);
    return publicQuote(quote);
  }

  async consume<T>(metadata: PaidMediaQuoteMetadata, expected: {
    clientRequestId: string;
    inputFingerprint: string;
    providerKey: string;
    amount: number;
    currency: string;
    pricingKey: string;
  } & PaidMediaQuoteBinding, action: () => Promise<T>): Promise<T> {
    const identity = await this.accountIdentity();
    const quoteId = metadata.quoteId ?? "";
    const idempotencyKey = metadata.idempotencyKey ?? "";
    const bindingKey = JSON.stringify({
      accountIdentity: identity,
      quoteId,
      boardId: expected.boardId,
      requestScope: expected.requestScope,
      purpose: expected.purpose,
      operation: expected.operation
    });
    const selection = await this.withLedgerLock(() => {
      this.prune();
      const quote = this.quotes.get(quoteId);
      const expectedKey = [expected.clientRequestId, expected.inputFingerprint, quoteId].join(":");
      if (!quote
        || metadata.generationAttemptId !== expected.clientRequestId
        || metadata.inputFingerprint !== expected.inputFingerprint
        || metadata.quoteExpiresAt !== quote.expiresAt
        || idempotencyKey !== expectedKey
        || quote.clientRequestId !== expected.clientRequestId
        || quote.inputFingerprint !== expected.inputFingerprint
        || quote.providerKey !== expected.providerKey
        || quote.pricingKey !== expected.pricingKey
        || quote.priceSnapshot.amount !== expected.amount
        || quote.priceSnapshot.currency !== expected.currency
        || metadata.priceSnapshot?.amount !== quote.priceSnapshot.amount
        || metadata.priceSnapshot.currency !== quote.priceSnapshot.currency
        || metadata.priceSnapshot.authoritative !== true
        || quote.accountIdentity !== identity
        || quote.boardId !== expected.boardId
        || quote.requestScope !== expected.requestScope
        || quote.purpose !== expected.purpose
        || quote.operation !== expected.operation
        || metadata.quoteBoardId !== expected.boardId
        || metadata.quoteRequestScope !== expected.requestScope
        || metadata.quotePurpose !== expected.purpose
        || metadata.quoteOperation !== expected.operation
        || Date.parse(quote.expiresAt) <= Date.now()) {
        throw new Error("付费媒体报价缺失、过期、已消费或与本次提交不匹配，请重新确认费用。");
      }
      const existing = this.consumptions.get(quoteId);
      if (existing) {
        if (existing.idempotencyKey === idempotencyKey && existing.bindingKey === bindingKey) {
          return { owner: false as const, result: existing.result as Promise<T> };
        }
        throw new Error("付费媒体报价已在其他请求、用途或操作中消费，请重新确认费用。");
      }
      const pendingAmounts = [...this.consumptions.entries()]
        .filter(([, item]) => item.state === "pending")
        .map(([consumedQuoteId]) => this.quotes.get(consumedQuoteId))
        .filter((item): item is QuoteRecord => Boolean(item && item.accountIdentity === identity && item.priceSnapshot.currency === quote.priceSnapshot.currency))
        .reduce((sum, item) => sum + item.priceSnapshot.amount, 0);
      if (pendingAmounts + quote.priceSnapshot.amount > quote.balanceAtIssue) {
        throw new Error(`余额已被其他任务预占，本次需要 ${quote.priceSnapshot.amount} ${quote.priceSnapshot.currency}。`);
      }
      let resolve!: (value: T) => void;
      let reject!: (error: unknown) => void;
      const result = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
      this.consumptions.set(quoteId, { idempotencyKey, bindingKey, state: "pending", result });
      return { owner: true as const, result, resolve, reject };
    });
    if (!selection.owner) return selection.result;
    void action().then(async (result) => {
      await this.withLedgerLock(() => {
        const current = this.consumptions.get(quoteId);
        if (current?.idempotencyKey === idempotencyKey) current.state = "committed";
      });
      selection.resolve(result);
    }, async (error) => {
      await this.withLedgerLock(() => {
        const current = this.consumptions.get(quoteId);
        if (current?.idempotencyKey === idempotencyKey && current.state === "pending") this.consumptions.delete(quoteId);
      });
      selection.reject(error);
    });
    return selection.result;
  }

  private async withLedgerLock<T>(operation: () => T | Promise<T>): Promise<T> {
    const previous = this.ledgerQueue;
    let release!: () => void;
    this.ledgerQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); }
    finally { release(); }
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, quote] of this.quotes) {
      if (Date.parse(quote.expiresAt) <= now && !this.consumptions.has(id)) this.quotes.delete(id);
    }
  }
}

function publicQuote(quote: QuoteRecord): PaidMediaQuote {
  return {
    quoteId: quote.quoteId,
    clientRequestId: quote.clientRequestId,
    inputFingerprint: quote.inputFingerprint,
    providerKey: quote.providerKey,
    expiresAt: quote.expiresAt,
    priceSnapshot: structuredClone(quote.priceSnapshot)
  };
}
