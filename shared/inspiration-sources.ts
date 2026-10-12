/** 由 Iterlay Manage 配置并下发的外部灵感来源。 */
export interface InspirationSource {
  id: string;
  name: string;
  url: string;
  iconUrl?: string;
  category: string;
  description: string;
  enabled: boolean;
  sortOrder: number;
}
