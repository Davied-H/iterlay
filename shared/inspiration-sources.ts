/** 由项目内 inspiration-sources.json 维护的外部灵感来源。 */
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
