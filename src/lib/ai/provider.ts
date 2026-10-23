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

export async function getProvider(name: AIProviderName = 'lunaroute'): Promise<AIProvider> {
  if (name === 'lunaroute') {
    const m = await import('./lunaroute.js');
    return (m.LunaRouteProvider as unknown as AIProvider) ?? (m as unknown as AIProvider);
  }
  const m = await import('./claude.js');
  return (m.AI as unknown as AIProvider) ?? (m as unknown as AIProvider);
}
