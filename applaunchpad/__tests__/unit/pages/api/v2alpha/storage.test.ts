import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getContext: vi.fn(),
  getApp: vi.fn(),
  processApp: vi.fn(),
  render: vi.fn()
}));
vi.mock('@/services/backend', () => ({
  getAppByName: mocks.getApp,
  processAppResponse: mocks.processApp
}));
vi.mock('@/pages/api/v2alpha/k8sContext', () => ({
  getK8sContextOrSendError: mocks.getContext,
  sendK8sOperationError: vi.fn(),
  sendInternalError: vi.fn()
}));
vi.mock('@/utils/deployYaml2Json', () => ({ json2DeployCr: mocks.render }));

import handler from '@/pages/api/v2alpha/apps/[name]/storage';

const response = () => {
  const res = { status: vi.fn(), end: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

describe('storage update deletion boundary', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([{}, { storage: [] }])('does not mutate workloads or PVCs for %j', async (body) => {
    // Any attempt to invoke a Kubernetes operation fails the test, including future delete paths.
    const write = vi.fn(() => {
      throw new Error('Unexpected Kubernetes mutation');
    });
    const noWrites = new Proxy(
      {},
      {
        get: (_, key) => {
          return typeof key === 'symbol' ? undefined : write;
        }
      }
    );
    const context = {
      k8sApp: noWrites,
      k8sCore: noWrites,
      applyYamlList: vi.fn(),
      namespace: 'tenant'
    };
    mocks.getContext.mockResolvedValue(context);
    mocks.getApp.mockResolvedValue({});
    const app = { kind: 'statefulset', storeList: [{ name: 'data', path: '/data', value: '1Gi' }] };
    mocks.processApp.mockResolvedValue(app);
    const res = response();
    await handler({ method: 'PATCH', query: { name: 'demo' }, body } as any, res as any);
    expect(mocks.getContext).toHaveBeenCalledOnce();
    expect(mocks.getApp).toHaveBeenCalledWith('demo', context);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
    expect(context.applyYamlList).not.toHaveBeenCalled();
    expect(app.storeList).toEqual([{ name: 'data', path: '/data', value: '1Gi' }]);
  });

  it('does not bypass authentication for an empty update', async () => {
    mocks.getContext.mockResolvedValue(null);
    const res = response();
    await handler(
      { method: 'PATCH', query: { name: 'demo' }, body: { storage: [] } } as any,
      res as any
    );
    expect(mocks.getContext).toHaveBeenCalledOnce();
    expect(mocks.getApp).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(204);
  });

  it('does not report success for a nonexistent application', async () => {
    mocks.getContext.mockResolvedValue({});
    mocks.getApp.mockResolvedValue({});
    mocks.processApp.mockResolvedValue(null);
    const res = response();
    await handler({ method: 'PATCH', query: { name: 'demo' }, body: {} } as any, res as any);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.status).not.toHaveBeenCalledWith(204);
  });
});
