import type { PlanTab, ResolvedPlan } from './tools.js';

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
  organizeTabs(tabs: TabInput[], apiKey: string, opts?: { signal?: AbortSignal }): Promise<{ groups: GroupSuggestion[] }>;
  /** Turn a natural-language request into a validated, previewable plan. */
  planActions(
    request: string,
    tabs: PlanTab[],
    apiKey: string,
    opts?: { signal?: AbortSignal },
  ): Promise<ResolvedPlan>;
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
