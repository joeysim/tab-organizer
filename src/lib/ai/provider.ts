export type GroupSuggestion = {
  name: string;
  color: string;
  tabs: number[];
};

export type TabInput = {
  id: number;
  title: string;
  url: string;
};

export interface AIProvider {
  readonly name?: AIProviderName;
  organizeTabs(tabs: TabInput[], apiKey: string): Promise<{ groups: GroupSuggestion[] }>;
}

export type AIProviderName = 'claude' | 'lunaroute';
