import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { AppConfigSchema } from '@/types/config';
import { monitorFetch } from '@/services/monitorFetch';

const sdk = vi.hoisted(() => ({ query: vi.fn(), options: vi.fn() }));
vi.mock('@/config', () => ({
  Config: () => ({
    launchpad: {
      components: {
        metrics: {
          url: 'http://metrics.example/prometheus',
          whitelistKubernetesHosts: ['https://dev.example']
        }
      }
    }
  })
}));
vi.mock('sealos-metrics-sdk', () => ({
  MetricsClient: class {
    launchpad = { query: sdk.query };
    constructor(options: unknown) {
      sdk.options(options);
    }
  }
}));

beforeEach(() => vi.clearAllMocks());

describe('metrics SDK adapter', () => {
  it('uses server configuration and preserves namespace, time range and credentials', async () => {
    const result = { status: 'success', data: { result: [] } };
    sdk.query.mockResolvedValue(result);
    const query = {
      type: 'cpu' as const,
      namespace: 'ns-demo',
      podName: 'demo-ab-cd',
      range: { start: 0, end: 60 }
    };
    expect(await monitorFetch(query, 'test-kubeconfig')).toEqual(result);
    expect(sdk.options).toHaveBeenCalledWith({
      kubeconfig: 'test-kubeconfig',
      metricsURL: 'http://metrics.example/prometheus',
      whitelistKubernetesHosts: ['https://dev.example']
    });
    expect(sdk.query).toHaveBeenCalledWith(query);
  });

  it('propagates authentication failure rather than returning empty chart data', async () => {
    sdk.query.mockRejectedValue(new Error('forbidden'));
    await expect(monitorFetch({ type: 'cpu', podName: 'demo' }, 'test')).rejects.toThrow(
      'forbidden'
    );
  });

  it('accepts imported configs without metrics settings and validates explicit settings', () => {
    const example = yaml.load(readFileSync('data/config.example.yaml', 'utf8')) as any;
    delete example.launchpad.components.metrics;
    expect(AppConfigSchema.parse(example).launchpad.components.metrics.url).toContain(
      '/prometheus'
    );
    example.launchpad.components.metrics = { url: 'not-a-url' };
    expect(AppConfigSchema.safeParse(example).success).toBe(false);
  });
});
