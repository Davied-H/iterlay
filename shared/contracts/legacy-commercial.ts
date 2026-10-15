import type { ComicGenerationCostItem } from "../comic-drama.js";
import type { ProviderConfig, VideoProviderConfig, TextProviderConfig } from "./providers.js";

export const OFFICIAL_PROVIDER_ID = "iterlay-official";

export const OFFICIAL_PROVIDER_NAME = "Iterlay 官方";

export const OFFICIAL_MAX_IMAGE_COUNT = 4;

export const IMAGE_CREDIT_COST = 10;

/** 官方文本助手（润色 / 场景大师 / 修改建议等）每次调用消耗的 Credit。 */
export const TEXT_CREDIT_COST = 1;

export const OFFICIAL_PROVIDER_CONFIG: ProviderConfig = {
  id: OFFICIAL_PROVIDER_ID,
  name: OFFICIAL_PROVIDER_NAME,
  type: "official",
  baseUrl: "",
  generationEndpoint: "",
  referenceEndpoint: "",
  model: "官方图片模型",
  supportsReferenceImages: true
};

export const OFFICIAL_VIDEO_PROVIDER_ID = "iterlay-official-video";

export const OFFICIAL_VIDEO_PROVIDER_CONFIG: VideoProviderConfig = {
  id: OFFICIAL_VIDEO_PROVIDER_ID,
  name: OFFICIAL_PROVIDER_NAME,
  type: "official",
  baseUrl: "",
  model: "官方视频模型"
};

export const OFFICIAL_TEXT_PROVIDER_ID = "iterlay-official-text";

export const OFFICIAL_TEXT_PROVIDER_CONFIG: TextProviderConfig = {
  id: OFFICIAL_TEXT_PROVIDER_ID,
  name: OFFICIAL_PROVIDER_NAME,
  type: "official",
  baseUrl: "",
  model: ""
};

export interface CreditBalance {
  walletId: string;
  balance: number;
  lifetimeGranted: number;
  lifetimeSpent: number;
  unitCost: number;
  status: string;
  updatedAt: string;
}

/** 官方视频使用的独立金豆钱包；与图片、文本 Credit 互不转换。 */
export interface GoldBeanBalance {
  walletId: string;
  balance: number;
  lifetimeGranted: number;
  lifetimeSpent: number;
  updatedAt: string;
}

export interface CreditStatus {
  credits: CreditBalance;
  /** 旧版服务端可能暂未返回；缺失时 UI 应按未知余额处理。 */
  goldBeans?: GoldBeanBalance;
  providerAvailable: boolean;
  model?: string;
  /** 官方文本助手是否可用（后台已配置文本模型）。 */
  textAvailable?: boolean;
  textModel?: string;
  /** Manager 当前是否存在已启用且明确支持 Function Calling 的文本负载。 */
  textFunctionCallingAvailable?: boolean;
  /** 官方视频生成是否可用（后台至少配置一个可用视频负载）。 */
  videoAvailable?: boolean;
  videoModel?: string;
  videoModels?: string[];
  videoGoldBeanCostPerSecond?: number;
}

export interface ReferralEntry {
  id: string;
  status: "pending" | "rewarded" | "cancelled";
  rewardCredits: number;
  createdAt: string;
  rewardedAt?: string | null;
}

export interface ReferralOverview {
  invitationCode: string;
  invitationLink: string;
  rewardCredits: number;
  totalInvited: number;
  successfulCount: number;
  totalRewards: number;
  creditBalance: number;
  items: ReferralEntry[];
}

export type GiftActivationCampaignStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "redeeming"
  | "paused"
  | "ended";

export type GiftActivationCodeStatus = "available" | "redeemed" | "expired";

export interface GiftActivationCampaign {
  id: string;
  name: string;
  enabled: boolean;
  redemptionEnabled: boolean;
  startsAt?: string | null;
  issuanceEndsAt?: string | null;
  redemptionEndsAt?: string | null;
  defaultQuota: number;
  totalCodeLimit: number;
  maxMajorVersion: number;
  maxDevices: number;
  activationCredits: number;
  shareMessage: string;
  status: GiftActivationCampaignStatus;
  codesIssued: boolean;
  publishedAt?: string | null;
  updatedAt?: string | null;
}

export interface GiftActivationCode {
  id: string;
  sequence: number;
  code: string;
  codePrefix: string;
  status: GiftActivationCodeStatus;
  shareCount: number;
  redeemedEmail?: string;
  redeemedAt?: string | null;
  createdAt: string;
}

export interface GiftActivationOverview {
  campaign: GiftActivationCampaign;
  eligible: boolean;
  eligibilityReason?: string;
  totalQuota: number;
  availableCount: number;
  redeemedCount: number;
  codes: GiftActivationCode[];
}

export interface CreditLedgerEntry {
  id: string;
  walletId: string;
  amount: number;
  balanceAfter: number;
  entryType: string;
  sourceType?: string;
  sourceId?: string;
  actorType: string;
  actorId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface OfficialVideoBatchQuoteRequest {
  clientBatchId: string;
  items: Array<{
    clientRequestId: string;
    model: string;
    durationSeconds: number;
    resolution: string;
    generateAudio: boolean;
  }>;
}

export interface OfficialVideoBatchQuote {
  quoteId: string;
  currency: "credit";
  total: number;
  items: Array<{ clientRequestId: string; amount: number }>;
  expiresAt: string;
}

export interface OfficialVideoBatchReservation {
  reservationId: string;
  quoteId: string;
  status: "reserved" | "committed" | "released" | "expired";
}

export interface PaidMediaQuoteRequest {
  kind: "image" | "video" | "video-sequence";
  clientRequestId: string;
  inputFingerprint: string;
  boardId: string;
  requestScope: string;
  operation: "image:generate" | "video:start" | "videoSequence:run" | "videoSequence:retry";
  providerId?: string;
  imageCount?: number;
  durationSeconds?: number;
  model?: string;
  resolution?: string;
  generateAudio?: boolean;
  videoItems?: Array<{ clientRequestId: string; providerId?: string; model?: string; durationSeconds: number; resolution?: string; generateAudio?: boolean }>;
  stage: ComicGenerationCostItem["stage"];
}

export interface PaidMediaQuote {
  quoteId: string;
  clientRequestId: string;
  inputFingerprint: string;
  providerKey: string;
  expiresAt: string;
  priceSnapshot: ComicGenerationCostItem & { authoritative: true };
}
