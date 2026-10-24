import { describe, expect, it } from 'vitest';
import { Quantity } from '@sealos/shared';
import { hydrateLegacyAppFormData } from '@/utils/hydrateLegacyAppForm';

const legacy = () => ({
  cpu: 500,
  memory: 1024,
  storeList: [
    { name: 'disk', path: '/data', value: 1.5, storageType: 'local', storageClassName: 'local' }
  ],
  networkStoreList: [{ name: 'shared', path: '/shared', storageClassName: 'nfs-csi' }],
  ephemeralStorage: 2.5,
  sharedMemory: { enabled: true, sizeLimit: 0.5 },
  networks: [
    {
      serviceName: 'existing',
      networkName: 'ingress',
      routes: [{ path: '/api', pathType: 'Prefix', serviceName: 'backend', servicePort: 8080 }]
    }
  ],
  serviceList: [{ name: 'backend', ports: [{ port: 8080, protocol: 'TCP' }] }],
  gpu: { manufacturers: 'kunlunxin', type: 'test', amount: 1, resource: { card: 'vendor/card' } },
  tolerations: [{ key: 'gpu', operator: 'Exists', effect: 'NoSchedule' }]
});

describe('legacy app resource hydration', () => {
  it('converts legacy units while retaining storage references, routing and scheduling', () => {
    const input = legacy();
    const original = structuredClone(input);
    const result = hydrateLegacyAppFormData(input as any);
    expect(result.cpu.toString()).toBe('500m');
    expect(result.memory.toString()).toBe('1Gi');
    expect(result.storeList[0].value.toString()).toBe('1536Mi');
    expect(result.ephemeralStorage.toString()).toBe('2560Mi');
    expect(result.sharedMemory.sizeLimit.toString()).toBe('512Mi');
    expect(result.storeList[0]).toMatchObject({ storageType: 'local', storageClassName: 'local' });
    for (const key of [
      'networkStoreList',
      'networks',
      'serviceList',
      'gpu',
      'tolerations'
    ] as const) {
      expect(result[key]).toEqual(input[key]);
    }
    expect(input).toEqual(original);
  });

  it('preserves quantities across JSON/cache round trips', () => {
    const hydrated = hydrateLegacyAppFormData(legacy() as any);
    const restored = hydrateLegacyAppFormData(JSON.parse(JSON.stringify(hydrated)));
    for (const key of ['cpu', 'memory', 'ephemeralStorage']) {
      expect(restored[key]).toBeInstanceOf(Quantity);
      expect(restored[key].equals(hydrated[key])).toBe(true);
    }
    expect(restored.storeList[0].value.equals(hydrated.storeList[0].value)).toBe(true);
    expect(restored.sharedMemory.sizeLimit.equals(hydrated.sharedMemory.sizeLimit)).toBe(true);
    expect(hydrateLegacyAppFormData(hydrated).ephemeralStorage).toBe(hydrated.ephemeralStorage);
  });

  it('does not turn omitted fields into empty lists or resource mutations', () => {
    expect(hydrateLegacyAppFormData({ imageName: 'nginx:next' })).toEqual({
      imageName: 'nginx:next'
    });
    expect(hydrateLegacyAppFormData({ storeList: [], networkStoreList: [] })).toEqual({
      storeList: [],
      networkStoreList: []
    });
  });

  it('handles string legacy capacities and zero without inventing a default allocation', () => {
    const result = hydrateLegacyAppFormData({
      ephemeralStorage: '0',
      sharedMemory: { enabled: false, sizeLimit: '0.5' }
    } as any);
    expect(result.ephemeralStorage.equals(Quantity.ZERO)).toBe(true);
    expect(result.sharedMemory.enabled).toBe(false);
    expect(result.sharedMemory.sizeLimit.toString()).toBe('512Mi');
  });
});
