import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { adaptAppDetail, adaptEditAppData } from '@/utils/adapt';
import { json2DeployCr, json2Service } from '@/utils/deployYaml2Json';

const workload = (kind: string): any => ({
  apiVersion: 'apps/v1',
  kind,
  metadata: { name: 'demo', annotations: { owner: 'operator' } },
  spec: {
    replicas: 1,
    selector: { matchLabels: { custom: 'demo' } },
    revisionHistoryLimit: 8,
    ...(kind === 'StatefulSet'
      ? {
          serviceName: 'stable',
          volumeClaimTemplates: [
            {
              metadata: { name: 'data', annotations: { path: '/data', value: '1Gi' } },
              spec: {
                storageClassName: 'custom',
                accessModes: ['ReadWriteMany'],
                volumeMode: 'Filesystem',
                resources: { requests: { storage: '1Gi' } }
              }
            }
          ]
        }
      : { strategy: { type: 'Recreate' } }),
    template: {
      metadata: { labels: { custom: 'demo' }, annotations: { injected: 'true' } },
      spec: {
        serviceAccountName: 'app-sa',
        automountServiceAccountToken: true,
        terminationGracePeriodSeconds: 40,
        tolerations: [{ key: 'dedicated', operator: 'Exists' }],
        nodeSelector: { zone: 'a' },
        imagePullSecrets: [{ name: 'independent' }],
        volumes: [
          {
            name: 'shared-alias',
            persistentVolumeClaim: { claimName: 'shared-data', readOnly: true }
          },
          { name: 'shm', emptyDir: { medium: 'Memory', sizeLimit: '256Mi' } }
        ],
        containers: [
          {
            name: 'main',
            image: 'nginx:old',
            command: ['/bin/sh', '-c'],
            args: ['echo hello world'],
            resources: {
              limits: { cpu: '500m', memory: '512Mi', 'ephemeral-storage': '2Gi' },
              requests: { cpu: '200m', memory: '128Mi' }
            },
            env: [
              { name: 'SECRET', valueFrom: { secretKeyRef: { name: 'secret', key: 'value' } } }
            ],
            securityContext: { runAsNonRoot: true },
            volumeMounts: [
              { name: 'shared-alias', mountPath: '/shared', subPath: 'logs', readOnly: true },
              { name: 'shm', mountPath: '/dev/shm' },
              ...(kind === 'StatefulSet' ? [{ name: 'data', mountPath: '/data' }] : [])
            ]
          },
          { name: 'sidecar', image: 'busybox', args: ['sleep', '3600'] }
        ]
      }
    }
  }
});

describe('unified workload editing', () => {
  for (const kind of ['Deployment', 'StatefulSet'])
    it(`preserves ${kind} custom settings on an image-only update`, async () => {
      const original = workload(kind);
      const app = adaptEditAppData(
        await adaptAppDetail([original], { domain: 'example.com', userDomains: [] })
      );
      app.imageName = 'nginx:new';
      const result: any = yaml.load(
        json2DeployCr(app, kind === 'Deployment' ? 'deployment' : 'statefulset')
      );
      const oldPod = original.spec.template.spec,
        pod = result.spec.template.spec;
      expect(pod.containers[0].image).toBe('nginx:new');
      for (const field of [
        'serviceAccountName',
        'automountServiceAccountToken',
        'terminationGracePeriodSeconds',
        'tolerations',
        'nodeSelector',
        'imagePullSecrets',
        'volumes'
      ])
        expect(pod[field]).toEqual(oldPod[field]);
      for (const field of [
        'command',
        'args',
        'resources',
        'env',
        'securityContext',
        'volumeMounts'
      ])
        expect(pod.containers[0][field]).toEqual(oldPod.containers[0][field]);
      expect(pod.containers[1]).toEqual(oldPod.containers[1]);
      expect(result.spec.selector).toEqual(original.spec.selector);
      expect(result.spec.revisionHistoryLimit).toBe(8);
      if (kind === 'StatefulSet') {
        expect(result.spec.serviceName).toBe('stable');
        expect(result.spec.volumeClaimTemplates[0].spec).toEqual(
          original.spec.volumeClaimTemplates[0].spec
        );
      } else expect(result.spec.strategy).toEqual({ type: 'Recreate' });
    });

  it('retains distinct service identities with matching port numbers', async () => {
    const services: any[] = ['one', 'two'].map((name) => ({
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name },
      spec: {
        type: 'ClusterIP',
        clusterIP: name === 'one' ? '10.0.0.1' : '10.0.0.2',
        selector: { custom: 'demo' },
        ports: [{ name: 'web', port: 80, targetPort: 'http', protocol: 'TCP' }]
      }
    }));
    const app = adaptEditAppData(
      await adaptAppDetail([workload('Deployment'), ...services], {
        domain: 'example.com',
        userDomains: []
      })
    );
    const result: any[] = yaml.loadAll(json2Service(app)) as any[];
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.metadata.name)).toEqual(['one', 'two']);
    expect(result.map((s) => s.spec.ports[0].targetPort)).toEqual(['http', 'http']);
    expect(result[0].spec.selector).toEqual({ custom: 'demo' });
  });
});

it('preserves non-NVIDIA GPU resources and unrelated scheduling labels', async () => {
  const original = workload('Deployment');
  original.spec.template.spec.nodeSelector = { 'amd.com/gpu.product': 'MI300', zone: 'a' };
  original.spec.template.spec.containers[0].resources.limits['amd.com/gpu'] = '1';
  original.spec.template.spec.containers[0].resources.requests['amd.com/gpu'] = '1';
  const app = adaptEditAppData(
    await adaptAppDetail([original], { domain: 'example.com', userDomains: [] })
  );
  expect(app.gpu?.resource?.card).toBe('amd.com/gpu');
  const edited: any = yaml.load(json2DeployCr({ ...app, imageName: 'nginx:new' }, 'deployment'));
  expect(edited.spec.template.spec.nodeSelector).toEqual(original.spec.template.spec.nodeSelector);
  expect(String(edited.spec.template.spec.containers[0].resources.limits['amd.com/gpu'])).toBe('1');
  app.gpu = undefined;
  const removed: any = yaml.load(json2DeployCr(app, 'deployment'));
  expect(removed.spec.template.spec.nodeSelector).toEqual({ zone: 'a' });
  expect(removed.spec.template.spec.containers[0].resources.limits['amd.com/gpu']).toBeUndefined();
});

it('retains sidecars, mounts and selectors when adding local storage to a Deployment', async () => {
  const original = workload('Deployment');
  const app = adaptEditAppData(
    await adaptAppDetail([original], { domain: 'example.com', userDomains: [] })
  );
  const { storageGiToQuantity } = await import('@/utils/resourceQuantity');
  app.storeList = [
    { name: 'data', path: '/data', value: storageGiToQuantity(1), storageType: 'local' }
  ];
  app.kind = 'statefulset';
  const result: any = yaml.load(json2DeployCr(app, 'statefulset'));
  expect(result.spec.strategy).toBeUndefined();
  expect(result.spec.serviceName).toBeTruthy();
  expect(result.spec.template.spec.containers[1]).toEqual(
    original.spec.template.spec.containers[1]
  );
  expect(result.spec.template.spec.containers[0].volumeMounts).toEqual(
    expect.arrayContaining(original.spec.template.spec.containers[0].volumeMounts)
  );
  expect(result.spec.selector).toEqual(original.spec.selector);
});

it('preserves ConfigMap keys used by env references when editing a mounted configuration', async () => {
  const { json2ConfigMap } = await import('@/utils/deployYaml2Json');
  const app = adaptEditAppData(await adaptAppDetail([workload('Deployment')], { domain:'example.com', userDomains:[] }));
  app.originalResources = [{ apiVersion:'v1',kind:'ConfigMap',metadata:{name:'demo'},data:{'config.yaml':'old','ENV_ONLY':'keep'}}];
  app.configMapList = [{ key:'config.yaml',value:'new',mountPath:'/etc/demo/config.yaml',volumeName:'config' }];
  const result: any = yaml.load(json2ConfigMap(app));
  expect(result.data).toEqual({'config.yaml':'new','ENV_ONLY':'keep'});
});

it('reads existing workloads with arbitrary quantities and all Kubernetes environment sources through both API versions', async () => {
  const { transformFromLegacySchema: v1 } = await import('@/types/request_schema');
  const { transformFromLegacySchema: v2 } = await import('@/types/v2alpha/request_schema');
  const { LaunchpadApplicationSchema: s1 } = await import('@/types/schema');
  const { LaunchpadApplicationSchema: s2 } = await import('@/types/v2alpha/schema');
  const original = workload('Deployment');
  original.spec.replicas = 0;
  original.spec.template.spec.containers[0].resources.limits = { cpu:'25m', memory:'128Mi' };
  original.spec.template.spec.containers[0].env = [
    { name:'CONFIG',valueFrom:{configMapKeyRef:{name:'demo',key:'key'}} },
    { name:'POD',valueFrom:{fieldRef:{fieldPath:'metadata.name'}} },
    { name:'LIMIT',valueFrom:{resourceFieldRef:{resource:'limits.cpu'}} }
  ];
  const detail=await adaptAppDetail([original],{domain:'example.com',userDomains:[]});
  expect(s1.safeParse(v1(detail)).success).toBe(true);
  expect(s2.safeParse(v2(detail)).success).toBe(true);
});
