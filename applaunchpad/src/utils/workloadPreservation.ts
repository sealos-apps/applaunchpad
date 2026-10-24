import type { AppEditType } from '@/types/app';
import { parseK8sQuantityOrZero } from './resourceQuantity';

/** Keep fields outside the form's ownership, including sidecars and immutable selectors. */
export function preserveWorkloadFields(data: AppEditType, generated: any): any {
  let original = data.originalWorkload as any;
  if (!original) return generated;
  if (original.kind !== generated.kind) {
    original = JSON.parse(JSON.stringify(original));
    original.kind = generated.kind;
    for (const key of [
      'strategy',
      'updateStrategy',
      'volumeClaimTemplates',
      'serviceName',
      'podManagementPolicy'
    ])
      delete original.spec[key];
    if (generated.kind === 'StatefulSet') {
      original.spec.serviceName = generated.spec.serviceName;
      original.spec.volumeClaimTemplates = [];
    }
    for (const key of [
      'uid',
      'resourceVersion',
      'creationTimestamp',
      'generation',
      'managedFields'
    ])
      delete original.metadata[key];
  }
  const oldSpec = original.spec?.template?.spec || {};
  const oldContainer = oldSpec.containers?.[0] || {};
  const nextSpec = generated.spec.template.spec;
  const container = nextSpec.containers[0];
  // Defaults are for new workloads; preserve operator-controlled policies on existing workloads.
  for (const key of ['strategy', 'updateStrategy', 'minReadySeconds', 'revisionHistoryLimit']) {
    if (key in original.spec) generated.spec[key] = original.spec[key];
    else delete generated.spec[key];
  }
  for (const key of [
    'automountServiceAccountToken',
    'terminationGracePeriodSeconds',
    'restartPolicy'
  ]) {
    if (key in oldSpec) nextSpec[key] = oldSpec[key];
    else delete nextSpec[key];
  }
  container.volumeMounts = (container.volumeMounts || []).map((mount: any) => ({
    ...oldContainer.volumeMounts?.find(
      (old: any) => old.name === mount.name && old.mountPath === mount.mountPath
    ),
    ...mount
  }));
  nextSpec.volumes = (nextSpec.volumes || []).map((volume: any) => {
    const old = oldSpec.volumes?.find((item: any) => item.name === volume.name);
    return old
      ? {
          ...old,
          ...volume,
          ...(volume.persistentVolumeClaim
            ? {
                persistentVolumeClaim: {
                  ...old.persistentVolumeClaim,
                  ...volume.persistentVolumeClaim
                }
              }
            : {})
        }
      : volume;
  });
  const oldGpuSelectors = Object.keys(oldSpec.nodeSelector || {}).filter((key) =>
    key.endsWith('/gpu.product')
  );
  nextSpec.nodeSelector = { ...oldSpec.nodeSelector, ...nextSpec.nodeSelector };
  for (const key of oldGpuSelectors) {
    if (!data.gpu?.type || !key.startsWith(`${data.gpu.manufacturers}.`))
      delete nextSpec.nodeSelector[key];
  }
  if (!Object.keys(nextSpec.nodeSelector).length) delete nextSpec.nodeSelector;
  if (oldSpec.runtimeClassName === 'nvidia' && !data.gpu?.type)
    nextSpec.runtimeClassName = undefined;
  if (data.hpa.use && original.spec.replicas !== undefined)
    generated.spec.replicas = original.spec.replicas;
  const resources = {
    ...oldContainer.resources,
    requests: { ...oldContainer.resources?.requests, ...container.resources.requests },
    limits: { ...oldContainer.resources?.limits, ...container.resources.limits }
  };
  for (const key of Object.keys(oldContainer.resources?.limits || {})) {
    const wasGpuResource = oldGpuSelectors.some((selector) =>
      key.startsWith(selector.split('/')[0] + '/')
    );
    if (
      wasGpuResource &&
      (!data.gpu?.type || key !== (data.gpu.resource?.card || 'nvidia.com/gpu'))
    ) {
      delete resources.requests[key];
      delete resources.limits[key];
    }
  }
  for (const key of ['cpu', 'memory'] as const) {
    if (parseK8sQuantityOrZero(oldContainer.resources?.limits?.[key]).equals(data[key])) {
      for (const kind of ['requests', 'limits']) {
        if (oldContainer.resources?.[kind]?.[key] === undefined) delete resources[kind][key];
        else resources[kind][key] = oldContainer.resources[kind][key];
      }
    }
  }
  if (data.ephemeralStorage === undefined) delete resources.limits['ephemeral-storage'];
  const annotations = { ...original.metadata?.annotations, ...generated.metadata.annotations };
  for (const key of ['remoteStores', 'networkStores']) {
    if (!(key in generated.metadata.annotations)) delete annotations[key];
  }
  const originalCommand = oldContainer.command?.join(' ') || '';
  const originalArgs =
    (oldContainer.args?.length === 1
      ? oldContainer.args.join(' ')
      : JSON.stringify(oldContainer.args)) || '';
  const merged = {
    ...original,
    ...generated,
    metadata: {
      ...original.metadata,
      ...generated.metadata,
      annotations,
      labels: { ...original.metadata?.labels, ...generated.metadata.labels }
    },
    spec: {
      ...original.spec,
      ...generated.spec,
      selector: original.spec.selector,
      ...(original.kind === 'StatefulSet' ? { serviceName: original.spec.serviceName } : {}),
      template: {
        ...original.spec.template,
        metadata: {
          ...original.spec.template.metadata,
          ...generated.spec.template.metadata,
          labels: {
            ...original.spec.template.metadata?.labels,
            ...generated.spec.template.metadata?.labels
          },
          annotations: {
            ...original.spec.template.metadata?.annotations,
            ...generated.spec.template.metadata?.annotations
          }
        },
        spec: {
          ...oldSpec,
          ...nextSpec,
          // Do not remove independent pull secrets when changing the application's registry.
          imagePullSecrets: [
            ...(oldSpec.imagePullSecrets || []).filter((item: any) => item.name !== data.appName),
            ...(nextSpec.imagePullSecrets || [])
          ],
          containers: [
            {
              ...oldContainer,
              ...container,
              name: oldContainer.name || container.name,
              command: data.runCMD === originalCommand ? oldContainer.command : container.command,
              args: data.cmdParam === originalArgs ? oldContainer.args : container.args,
              resources
            },
            ...(oldSpec.containers || []).slice(1)
          ]
        }
      }
    }
  };
  if (original.kind === 'StatefulSet') {
    merged.spec.volumeClaimTemplates = generated.spec.volumeClaimTemplates.map((claim: any) => {
      const old = original.spec.volumeClaimTemplates?.find(
        (item: any) => item.metadata?.name === claim.metadata.name
      );
      return old
        ? {
            ...old,
            metadata: {
              ...old.metadata,
              ...claim.metadata,
              annotations: { ...old.metadata?.annotations, ...claim.metadata.annotations }
            },
            spec: {
              ...old.spec,
              ...claim.spec,
              accessModes: old.spec.accessModes,
              resources: {
                ...old.spec.resources,
                requests: { ...old.spec.resources?.requests, ...claim.spec.resources.requests }
              }
            }
          }
        : claim;
    });
  }
  delete merged.status;
  return merged;
}
