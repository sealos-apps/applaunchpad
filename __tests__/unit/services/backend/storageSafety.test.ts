import { describe, it, expect, vi } from 'vitest';
import { ownedClaimNames, deleteOwnedClaims } from '@/services/backend/storageOwnership';
import { updateStatefulSet } from '@/services/backend/statefulSetUpdate';

describe('storage ownership', () => {
  it('excludes shared references and claims from other applications', () => {
    const app: any = {
      metadata: { name: 'demo' },
      spec: {
        volumeClaimTemplates: [{ metadata: { name: 'data' } }],
        template: {
          spec: {
            volumes: [{ name: 'shared', persistentVolumeClaim: { claimName: 'data-demo-2' } }]
          }
        }
      }
    };
    const claims = ['data-demo-0', 'data-demo-1', 'data-demo-2', 'data-demo-copy-0', 'shared'].map(
      (name) => ({ metadata: { name } })
    );
    expect(ownedClaimNames(app, claims)).toEqual(['data-demo-0', 'data-demo-1']);
  });
  it('does not delete claims when workload access is denied', async () => {
    const core = { deleteNamespacedPersistentVolumeClaim: vi.fn() };
    await expect(
      deleteOwnedClaims(
        'demo',
        'ns',
        { readNamespacedStatefulSet: vi.fn().mockRejectedValue({ body: { code: 403 } }) } as any,
        core as any
      )
    ).rejects.toMatchObject({ body: { code: 403 } });
    expect(core.deleteNamespacedPersistentVolumeClaim).not.toHaveBeenCalled();
  });
});

describe('StatefulSet updates', () => {
  for (const code of [403, 409, 500, 422])
    it(`never deletes a controller for ordinary ${code} errors`, async () => {
      const apps = {
        readNamespacedStatefulSet: vi
          .fn()
          .mockResolvedValue({ body: { metadata: { name: 'demo', resourceVersion: '1' } } }),
        patchNamespacedStatefulSet: vi
          .fn()
          .mockRejectedValue({ body: { code, message: 'request failed' } }),
        deleteNamespacedStatefulSet: vi.fn(),
        createNamespacedStatefulSet: vi.fn()
      };
      await expect(
        updateStatefulSet(apps as any, 'ns', { metadata: { name: 'demo' } })
      ).rejects.toBeDefined();
      expect(apps.deleteNamespacedStatefulSet).not.toHaveBeenCalled();
    });
  it('does not delete the controller when replacement validation fails', async () => {
    const apps = {
      readNamespacedStatefulSet: vi
        .fn()
        .mockResolvedValue({ body: { metadata: { name: 'demo' } } }),
      patchNamespacedStatefulSet: vi.fn().mockRejectedValue({
        body: { code: 422, message: 'Forbidden: updates to statefulset spec' }
      }),
      deleteNamespacedStatefulSet: vi.fn(),
      createNamespacedStatefulSet: vi.fn().mockRejectedValue(new Error('quota'))
    };
    await expect(
      updateStatefulSet(apps as any, 'ns', { metadata: { name: 'demo' } })
    ).rejects.toThrow('quota');
    expect(apps.deleteNamespacedStatefulSet).not.toHaveBeenCalled();
  });
});

it('does not touch the old Deployment if conversion validation fails', async () => {
  const { convertDeploymentToStatefulSet } = await import('@/services/backend/workloadConversion');
  const k8s = {
    namespace: 'ns',
    k8sApp: {
      createNamespacedStatefulSet: vi.fn().mockRejectedValue(new Error('admission denied')),
      deleteNamespacedDeployment: vi.fn()
    }
  };
  await expect(convertDeploymentToStatefulSet(k8s, { metadata: { name: 'demo' } })).rejects.toThrow(
    'admission denied'
  );
  expect(k8s.k8sApp.deleteNamespacedDeployment).not.toHaveBeenCalled();
});

it('detaches legacy shared PVC owner references before deleting application claims', async () => {
  const calls: string[]=[];
  const apps: any = {
    readNamespacedStatefulSet:vi.fn().mockResolvedValue({body:{metadata:{name:'demo',uid:'controller'},spec:{volumeClaimTemplates:[{metadata:{name:'data'}}],template:{spec:{volumes:[{name:'shared',persistentVolumeClaim:{claimName:'shared'}}]}}}}}),
    readNamespacedDeployment:vi.fn().mockRejectedValue({body:{code:404}})
  };
  const core: any = {
    listNamespacedPersistentVolumeClaim:vi.fn().mockResolvedValue({body:{items:[{metadata:{name:'data-demo-0'}},{metadata:{name:'shared',resourceVersion:'3',ownerReferences:[{uid:'controller',name:'demo',kind:'StatefulSet',apiVersion:'apps/v1'}]}}]}}),
    patchNamespacedPersistentVolumeClaim:vi.fn().mockImplementation(async()=>{calls.push('detach');}),
    deleteNamespacedPersistentVolumeClaim:vi.fn().mockImplementation(async()=>{calls.push('delete-owned');})
  };
  await deleteOwnedClaims('demo','ns',apps,core);
  expect(calls).toEqual(['detach','delete-owned']);
  expect(core.patchNamespacedPersistentVolumeClaim.mock.calls[0][2].metadata.ownerReferences).toEqual([]);
  expect(core.deleteNamespacedPersistentVolumeClaim.mock.calls[0][0]).toBe('data-demo-0');
});
