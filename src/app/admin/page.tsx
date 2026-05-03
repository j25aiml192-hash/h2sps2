'use client';

import { useEffect, useState } from 'react';
import { Loader2, Server, Brain, PiggyBank } from 'lucide-react';

interface ProviderStats {
  name: string;
  totalRequests: number;
  successRate: number;
  avgLatency: number;
  fallbackRate: number;
  currentStatus: 'healthy' | 'degraded' | 'down';
  rateLimitRemaining?: number;
}

interface AgentStats {
  name: string;
  totalDebates: number;
  avgResponseTime: number;
  modelUsage: Record<string, number>;
  userRating: number;
  primaryModel: string;
}

export default function AdminDashboard() {
  const [providers, setProviders] = useState<ProviderStats[]>([]);
  const [agents, setAgents] = useState<AgentStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchAnalytics = async () => {
    try {
      const [healthRes, statsRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/admin/stats')
      ]);

      const health = await healthRes.json();
      const stats = await statsRes.json();

      setProviders(health.providers || []);
      setAgents(stats.agents || []);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-canvas text-ink">
        <Loader2 className="animate-spin text-accent-blue" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink py-[96px] px-6 lg:px-[96px]">
      <div className="max-w-[1200px] mx-auto">
        <h1 className="text-display-xl mb-[96px]">Analytics.</h1>

        {/* Provider Health */}
        <section className="mb-[96px]">
          <h2 className="text-headline mb-[30px] flex items-center gap-2">
            <Server className="text-accent-blue" />
            AI Provider Status
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[20px]">
            {providers.map((provider) => (
              <div
                key={provider.name}
                className="p-[24px] bg-surface-1 rounded-xl"
              >
                <div className="flex justify-between items-start mb-[30px]">
                  <h3 className="text-body font-bold">{provider.name}</h3>
                  <span className={`px-2 py-1 rounded-sm text-micro ${
                    provider.currentStatus === 'healthy' ? 'bg-surface-2 text-semantic-success' :
                    provider.currentStatus === 'degraded' ? 'bg-surface-2 text-gradient-orange' :
                    'bg-surface-2 text-gradient-magenta'
                  }`}>
                    {provider.currentStatus.toUpperCase()}
                  </span>
                </div>

                <div className="space-y-[12px] text-body-sm">
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Total Requests</span>
                    <span>{provider.totalRequests.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Success Rate</span>
                    <span>{(provider.successRate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Avg Latency</span>
                    <span>{provider.avgLatency.toFixed(0)}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Fallback Rate</span>
                    <span>{(provider.fallbackRate * 100).toFixed(1)}%</span>
                  </div>
                  {provider.rateLimitRemaining !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-ink-muted">Rate Limit</span>
                      <span>{provider.rateLimitRemaining} remaining</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Agent Performance */}
        <section className="mb-[96px]">
          <h2 className="text-headline mb-[30px] flex items-center gap-2">
            <Brain className="text-gradient-orange" />
            Agent Performance
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[20px]">
            {agents.map((agent) => (
              <div key={agent.name} className="p-[24px] bg-surface-1 rounded-xl">
                <div className="flex justify-between items-start mb-[30px]">
                  <h3 className="text-body font-bold capitalize">{agent.name}</h3>
                  <span className="text-micro bg-surface-2 text-ink-muted px-2 py-1 rounded-sm">
                    {agent.primaryModel}
                  </span>
                </div>

                <div className="space-y-[15px]">
                  <div className="flex justify-between text-body-sm">
                    <span className="text-ink-muted">Total Debates</span>
                    <span>{agent.totalDebates}</span>
                  </div>
                  <div className="flex justify-between text-body-sm">
                    <span className="text-ink-muted">Avg Response Time</span>
                    <span>{agent.avgResponseTime.toFixed(0)}ms</span>
                  </div>
                  <div className="flex justify-between text-body-sm">
                    <span className="text-ink-muted">User Rating</span>
                    <span>{agent.userRating.toFixed(1)}/5</span>
                  </div>

                  {/* Model usage breakdown */}
                  <div className="pt-[15px] border-t border-hairline">
                    <p className="text-micro text-ink-muted mb-[12px]">Model Usage</p>
                    {Object.entries(agent.modelUsage).map(([model, percentage]) => (
                      <div key={model} className="flex items-center gap-3 text-micro mb-[8px]">
                        <span className="text-ink-muted w-[80px] truncate">
                          {model.split('/').pop()}
                        </span>
                        <div className="flex-1 bg-surface-2 rounded-full h-[4px] overflow-hidden">
                          <div 
                            className="bg-accent-blue h-full" 
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="w-[30px] text-right">
                          {percentage.toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Cost Savings Spotlight Card */}
        <section className="p-xl bg-gradient-violet rounded-xxl">
          <h2 className="text-subhead mb-[8px] text-ink flex items-center gap-2">
            <PiggyBank className="text-ink" />
            Cost Savings
          </h2>
          <p className="text-display-md mb-[15px]">
            ₹0 / month
          </p>
          <p className="text-body">
            Estimated savings vs. paid APIs: <strong>₹47,250/month</strong>
            <br />
            <span className="text-body-sm opacity-80 mt-2 block">
              Based on {providers.reduce((sum, p) => sum + p.totalRequests, 0).toLocaleString()} total API calls
            </span>
          </p>
        </section>
      </div>
    </div>
  );
}
