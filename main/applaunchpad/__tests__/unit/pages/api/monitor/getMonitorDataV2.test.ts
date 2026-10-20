import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/monitor/getMonitorDataV2';
import legacyHandler from '@/pages/api/monitor/getMonitorData';
import networkHandler from '@/pages/api/monitor/getNetworkMonitorData';

const { query, clients } = vi.hoisted(() => ({ query: vi.fn(), clients: vi.fn() }));
vi.mock('@labring/sealos-metrics-sdk', () => ({
  MetricsClient: class {
    launchpad = { query };
    constructor(options: unknown) {
      clients(options);
    }
  }
}));
vi.mock('@/config', () => ({
  Config: () => ({ launchpad: { components: { monitoring: { url: 'http://metrics.test' } } } })
}));
vi.mock('@/services/backend/auth', () => ({
  authSession: vi.fn(async (headers) => headers.authorization || 'test kubeconfig')
}));
vi.mock('@/services/backend/kubernetes', () => ({
  getK8s: vi.fn().mockResolvedValue({ namespace: 'authenticated-namespace' })
}));

const matrix = {
  status: 'success',
  data: {
    resultType: 'matrix',
    result: [
      {
        metric: { pod: 'demo-hash-0', persistentvolumeclaim: 'data-demo-0' },
        values: [[1700000000, '12.345']]
      }
    ]
  }
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('METRICS_URL', '');
  vi.stubGlobal('AppConfig', {
    launchpad: { components: { monitor: { url: 'http://metrics.test' } } }
  });
  query.mockResolvedValue(matrix);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const request = (queryKey = 'cpu') =>
  ({
    headers: {},
    query: {
      queryName: 'demo-hash-0',
      queryKey,
      start: '1700000000000',
      end: '1700000060000',
      step: '30s',
      pvcName: 'data-demo-0',
      namespace: 'untrusted'
    }
  } as any);

describe('SDK monitor API contract', () => {
  it.each(['cpu', 'memory', 'average_cpu', 'average_memory', 'storage'])(
    'queries %s in the authenticated namespace with second timestamps and unchanged percentages',
    async (type) => {
      const res = { json: vi.fn() } as any;
      await handler(request(type), res);
      expect(clients).toHaveBeenCalledWith({
        kubeconfig: 'test kubeconfig',
        metricsURL: 'http://metrics.test'
      });
      expect(query).toHaveBeenCalledWith({
        namespace: 'authenticated-namespace',
        type,
        podName: 'demo-hash-0',
        pvcName: 'data-demo-0',
        range: { start: 1700000000, end: 1700000060, step: '30s' }
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 200,
          data: expect.objectContaining({
            result: [
              {
                name: type === 'storage' ? 'data-demo-0' : 'demo-hash-0',
                xData: [1700000000],
                yData: ['12.35']
              }
            ]
          })
        })
      );
    }
  );
  it('preserves the legacy array response and PVC labels', async () => {
    const res = { json: vi.fn() } as any;
    await legacyHandler(request('disk'), res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 200,
        data: [{ name: 'data-demo-0', xData: [1700000000], yData: ['12.35'] }]
      })
    );
  });
  it('adapts instant results without requiring VictoriaMetrics extensions', async () => {
    query.mockResolvedValue({
      status: 'success',
      data: {
        resultType: 'vector',
        result: [{ metric: { pod: 'demo-hash-0' }, value: [1700000000, '25'] }]
      }
    });
    const res = { json: vi.fn() } as any;
    await handler(request(), res);
    expect(res.json.mock.calls[0][0].data.result[0].yData).toEqual(['25.00']);
  });
  it('uses the environment override and creates separate credential-bound clients', async () => {
    vi.stubEnv('METRICS_URL', 'http://override.test');
    await handler(request(), { json: vi.fn() } as any);
    await handler({ ...request(), headers: { authorization: 'second kubeconfig' } }, {
      json: vi.fn()
    } as any);
    expect(clients.mock.calls.map(([options]) => options)).toEqual([
      { kubeconfig: 'test kubeconfig', metricsURL: 'http://override.test' },
      { kubeconfig: 'second kubeconfig', metricsURL: 'http://override.test' }
    ]);
  });
  it('rejects unsupported types before invoking the SDK', async () => {
    const res = { json: vi.fn() } as any;
    await handler(request('unknown'), res);
    expect(res.json.mock.calls[0][0].code).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
  it('propagates SDK authentication/query failures', async () => {
    query.mockRejectedValue(new Error('No permission for this namespace'));
    const res = { json: vi.fn() } as any;
    await handler(request(), res);
    expect(res.json.mock.calls[0][0].code).toBe(500);
  });
});

describe('SDK network API contract', () => {
  it.each(['network_service_request_count', 'network_service_request_percent'])(
    'preserves %s chart formatting and status classes',
    async (type) => {
      query.mockResolvedValue({
        status: 'success',
        data: {
          resultType: 'matrix',
          result: [{ metric: { response_code_class: '2xx' }, values: [[1700000000, '12.345']] }]
        }
      });
      const res = { json: vi.fn() } as any;
      await networkHandler(
        {
          headers: {},
          query: {
            serviceName: 'web',
            port: '8080',
            type,
            start: '1700000000000',
            end: '1700000060000',
            namespace: 'untrusted'
          }
        } as any,
        res
      );
      expect(query).toHaveBeenCalledWith({
        type,
        namespace: 'authenticated-namespace',
        service: 'web.authenticated-namespace.svc.cluster.local',
        port: 8080,
        range: { start: 1700000000, end: 1700000060, step: '2m', time: undefined }
      });
      const result = res.json.mock.calls[0][0].data.result;
      expect(result.map((item: { name: string }) => item.name)).toEqual([
        '2xx',
        '3xx',
        '4xx',
        '5xx'
      ]);
      expect(result[0].yData).toEqual([type === 'network_service_request_count' ? '12' : '12.35']);
      expect(result[1].yData).toEqual([type === 'network_service_request_count' ? '0' : '0.00']);
    }
  );
});
