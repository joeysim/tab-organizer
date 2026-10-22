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
  organizeTabs(tabs: TabInput[], apiKey: string): Promise<{ groups: GroupSuggestion[] }>;
}
