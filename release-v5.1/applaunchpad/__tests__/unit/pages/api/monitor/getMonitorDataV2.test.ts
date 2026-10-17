import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/monitor/getMonitorDataV2';
vi.mock('@/services/backend/auth', () => ({
  authSession: vi.fn().mockResolvedValue('test kubeconfig')
}));
vi.mock('@/services/backend/kubernetes', () => ({
  getK8s: vi.fn().mockResolvedValue({ namespace: 'authenticated-namespace' })
}));
afterEach(() => vi.unstubAllGlobals());

describe('sealox V2 monitor contract', () => {
  it.each(['cpu', 'memory', 'average_memory', 'storage'])(
    'queries %s using release config and returns second timestamps',
    async (queryKey) => {
      vi.stubGlobal('AppConfig', {
        launchpad: { components: { monitor: { url: 'http://monitor.test' } } }
      });
      const fetch = vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            status: 'success',
            data: {
              resultType: 'matrix',
              result: [
                {
                  metric: { pod: 'demo-0', persistentvolumeclaim: 'data-demo-0' },
                  values: [[1700000000, '12.345']]
                }
              ]
            }
          })
        });
      vi.stubGlobal('fetch', fetch);
      const res = { json: vi.fn() } as any;
      await handler(
        {
          headers: {},
          query: {
            queryName: 'demo',
            queryKey,
            start: '1700000000000',
            end: '1700000060000',
            step: '30s',
            pvcName: 'data-demo-0',
            namespace: 'untrusted'
          }
        } as any,
        res
      );
      expect(fetch).toHaveBeenCalledWith(
        'http://monitor.test/query',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: 'test%20kubeconfig'
          }
        })
      );
      const body = new URLSearchParams(fetch.mock.calls[0][1].body);
      expect(Object.fromEntries(body)).toEqual({
        namespace: 'authenticated-namespace',
        type: queryKey,
        launchPadName: 'demo',
        start: '1700000000',
        end: '1700000060',
        step: '30s',
        pvcName: 'data-demo-0'
      });
      expect(res.json.mock.calls[0][0]).toMatchObject({
        code: 200,
        data: {
          result: [
            {
              name: queryKey === 'storage' ? 'data-demo-0' : 'demo-0',
              xData: [1700000000],
              yData: ['12.35']
            }
          ]
        }
      });
    }
  );
  it('rejects unsupported metric types before querying the backend', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const res = { json: vi.fn() } as any;
    await handler({ headers: {}, query: { queryName: 'demo', queryKey: 'unknown' } } as any, res);
    expect(res.json.mock.calls[0][0].code).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
