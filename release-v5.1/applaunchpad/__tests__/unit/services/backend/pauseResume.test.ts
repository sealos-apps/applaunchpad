import { describe, expect, it, vi } from 'vitest';
import yaml from 'js-yaml';
import { pauseApp, startApp, updateAppResources } from '@/services/backend/appService';
import { pauseKey, minReplicasKey, maxReplicasKey } from '@/constants/app';

vi.mock('@/pages/app/edit', () => ({ formData2Yamls: vi.fn() }));

function fixture(kind: string) {
  const spec = {
    scaleTargetRef: { apiVersion: 'apps/v1', kind, name: 'demo' },
    minReplicas: 3,
    maxReplicas: 7,
    metrics: [
      {
        type: 'Resource',
        resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 600 } }
      },
      {
        type: 'Pods',
        pods: { metric: { name: 'custom' }, target: { type: 'AverageValue', averageValue: '42' } }
      }
    ],
    behavior: { scaleDown: { stabilizationWindowSeconds: 120 } }
  };
  const app = {
    kind,
    metadata: { name: 'demo', annotations: {} as Record<string, string> },
    spec: { replicas: 3, template: { spec: { containers: [{ image: 'nginx' }] } } }
  };
  const context: any = {
    namespace: 'ns-demo',
    getDeployApp: vi.fn().mockResolvedValue(app),
    apiClient: { replace: vi.fn().mockResolvedValue({}) },
    applyYamlList: vi.fn().mockResolvedValue({}),
    k8sNetworkingApp: { listNamespacedIngress: vi.fn().mockResolvedValue({ body: { items: [] } }) },
    k8sAutoscaling: {
      readNamespacedHorizontalPodAutoscaler: vi
        .fn()
        .mockResolvedValueOnce({ body: { spec } })
        .mockRejectedValue({ statusCode: 404 }),
      deleteNamespacedHorizontalPodAutoscaler: vi.fn().mockResolvedValue({})
    }
  };
  return { app, spec, context };
}

describe('pause/resume compatibility', () => {
  it.each(['Deployment', 'StatefulSet'])(
    'preserves full %s policy across repeated pauses and resume',
    async (kind) => {
      const { app, spec, context } = fixture(kind);
      await pauseApp('demo', context);
      expect(app.spec.replicas).toBe(0);
      expect(JSON.parse(app.metadata.annotations[pauseKey]).spec).toEqual(spec);
      await pauseApp('demo', context);
      await startApp('demo', context);
      expect(app.spec.replicas).toBe(3);
      expect(app.metadata.annotations[pauseKey]).toBeUndefined();
      expect((yaml.load(context.applyYamlList.mock.calls[0][0][0]) as any).spec).toEqual(spec);
    }
  );

  it('shares saved policy between resource updates and the start endpoint', async () => {
    const { app, spec, context } = fixture('Deployment');
    await updateAppResources('demo', { resource: { replicas: 0 } }, context);
    await pauseApp('demo', context);
    await updateAppResources('demo', { resource: { replicas: 1 } }, context);
    expect(app.spec.replicas).toBe(3);
    expect((yaml.load(context.applyYamlList.mock.calls[0][0][0]) as any).spec).toEqual(spec);
  });

  it('preserves legacy annotations and restores their original utilization and bounds', async () => {
    const { app, context } = fixture('Deployment');
    context.k8sAutoscaling.readNamespacedHorizontalPodAutoscaler
      .mockReset()
      .mockRejectedValue({ statusCode: 404 });
    app.metadata.annotations = {
      [pauseKey]: JSON.stringify({ target: 'cpu', value: '600' }),
      [minReplicasKey]: '4',
      [maxReplicasKey]: '8'
    };
    await pauseApp('demo', context);
    await startApp('demo', context);
    const hpa = yaml.load(context.applyYamlList.mock.calls[0][0][0]) as any;
    expect(hpa.spec.scaleTargetRef.kind).toBe('Deployment');
    expect(hpa.spec.minReplicas).toBe(4);
    expect(hpa.spec.maxReplicas).toBe(8);
    expect(hpa.spec.metrics[0].resource.target.averageUtilization).toBe(600);
  });
});
