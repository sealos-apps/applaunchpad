import type {
  V1StatefulSet,
  V1Deployment,
  V1ConfigMap,
  V1Service,
  V1Ingress,
  V1Secret,
  V1Pod,
  SinglePodMetrics,
  CoreV1EventList,
  V2HorizontalPodAutoscaler,
  V1VolumeMount
} from '@kubernetes/client-node';
import dayjs from 'dayjs';
import type {
  AppListItemType,
  PodDetailType,
  AppDetailType,
  PodMetrics,
  PodEvent,
  HpaTarget,
  ApplicationProtocolType,
  TAppSourceType,
  TransportProtocolType,
  DeployKindsType,
  AppEditType,
  PodStatusMapType
} from '@/types/app';
import {
  appStatusMap,
  podStatusMap,
  pauseKey,
  maxReplicasKey,
  minReplicasKey,
  PodStatusEnum,
  AppStatusEnum,
  publicDomainKey,
  gpuNodeSelectorKey,
  gpuResourceKey,
  AppSourceConfigs
} from '@/constants/app';
import { formatPodTime, atobSecretYaml } from '@/utils/tools';
import { defaultEditVal } from '@/constants/editApp';
import { customAlphabet } from 'nanoid';
import { has } from 'lodash';
import { lauchpadRemarkKey } from '@/constants/account';
import {
  parseK8sQuantityOrZero,
  quantityToStorageGi,
  storageAnnotationToQuantity
} from '@/utils/resourceQuantity';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz', 12);

export const normalizeCustomDomainHost = (input: string) => {
  try {
    const url = input.includes('://') ? new URL(input) : new URL(`https://${input}`);
    return url.hostname.toLowerCase();
  } catch {
    return input.trim().toLowerCase();
  }
};

// Calculate app  status
function calculateAppStatus(
  appDeploy: V1Deployment | V1StatefulSet
): (typeof appStatusMap)[keyof typeof appStatusMap] {
  const isPause = !!appDeploy?.metadata?.annotations?.[pauseKey];
  if (isPause) {
    return appStatusMap[AppStatusEnum.pause];
  }

  const desiredReplicas = appDeploy.spec?.replicas || 0;
  const availableReplicas = appDeploy.status?.availableReplicas || 0;
  const readyReplicas = appDeploy.status?.readyReplicas || 0;
  const replicas = appDeploy.status?.replicas || 0;
  const updatedReplicas = appDeploy.status?.updatedReplicas || 0;
  const conditions = appDeploy.status?.conditions || [];
  const hasErrorCondition = conditions.some(
    (condition) =>
      condition.type === 'Progressing' &&
      condition.status === 'False' &&
      condition.reason === 'ProgressDeadlineExceeded'
  );
  if (hasErrorCondition) {
    return appStatusMap[AppStatusEnum.error];
  }
  if (desiredReplicas === 0) {
    return appStatusMap[AppStatusEnum.waiting];
  }
  if (availableReplicas >= desiredReplicas && readyReplicas >= desiredReplicas) {
    return appStatusMap[AppStatusEnum.running];
  }
  if (availableReplicas > 0 || readyReplicas > 0 || replicas > 0 || updatedReplicas > 0) {
    return appStatusMap[AppStatusEnum.creating];
  }
  return appStatusMap[AppStatusEnum.waiting];
}

export const getAppSource = (
  app: V1Deployment | V1StatefulSet
): {
  hasSource: boolean;
  sourceName: string;
  sourceType: TAppSourceType;
} => {
  const labels = app.metadata?.labels || {};

  for (const config of AppSourceConfigs) {
    if (has(labels, config.key)) {
      return {
        hasSource: true,
        sourceName: labels[config.key],
        sourceType: config.type
      };
    }
  }

  return {
    hasSource: false,
    sourceName: '',
    sourceType: 'app_store'
  };
};

export const adaptAppListItem = (app: V1Deployment & V1StatefulSet): AppListItemType => {
  // compute store amount
  const storeAmount = app.spec?.volumeClaimTemplates
    ? app.spec?.volumeClaimTemplates.reduce((sum, item) => {
        const storage = item?.spec?.resources?.requests?.storage
          ? parseK8sQuantityOrZero(item.spec.resources.requests.storage)
          : storageAnnotationToQuantity(item?.metadata?.annotations?.value);
        return sum + quantityToStorageGi(storage);
      }, 0)
    : 0;

  const gpuNodeSelector = app?.spec?.template?.spec?.nodeSelector;

  return {
    id: app.metadata?.uid || ``,
    name: app.metadata?.name || 'app name',
    status: calculateAppStatus(app),
    isPause: !!app?.metadata?.annotations?.[pauseKey],
    createTime: dayjs(app.metadata?.creationTimestamp).format('YYYY/MM/DD HH:mm'),
    cpu: parseK8sQuantityOrZero(
      app.spec?.template?.spec?.containers?.[0]?.resources?.limits?.cpu || '0'
    ),
    memory: parseK8sQuantityOrZero(
      app.spec?.template?.spec?.containers?.[0]?.resources?.limits?.memory || '0'
    ),
    gpu: {
      type: gpuNodeSelector?.[gpuNodeSelectorKey] || '',
      amount: Number(
        app.spec?.template?.spec?.containers?.[0]?.resources?.limits?.[gpuResourceKey] || 1
      ),
      manufacturers: 'nvidia'
    },
    usedCpu: {
      name: '',
      xData: new Array(30).fill(0),
      yData: new Array(30).fill('0')
    },
    usedMemory: {
      name: '',
      xData: new Array(30).fill(0),
      yData: new Array(30).fill('0')
    },
    activeReplicas: app.status?.readyReplicas || 0,
    maxReplicas: +(app.metadata?.annotations?.[maxReplicasKey] || app.status?.readyReplicas || 0),
    minReplicas: +(app.metadata?.annotations?.[minReplicasKey] || app.status?.readyReplicas || 0),
    storeAmount,
    labels: app.metadata?.labels || {},
    source: getAppSource(app),
    kind: app.kind?.toLowerCase() as 'deployment' | 'statefulset',
    remark: app.metadata?.annotations?.[lauchpadRemarkKey]
  };
};

export const adaptPod = (pod: V1Pod): PodDetailType => {
  return {
    ...pod,
    podName: pod.metadata?.name || 'pod name',
    status: (() => {
      const container = pod.status?.containerStatuses || [];
      if (container.length > 0) {
        const stateObj = container[0]?.state;
        if (stateObj) {
          const status = [
            PodStatusEnum.running,
            PodStatusEnum.terminated,
            PodStatusEnum.waiting
          ].find((s) => stateObj[s]);

          if (status) {
            return status === PodStatusEnum.running
              ? podStatusMap[PodStatusEnum.running]
              : { ...podStatusMap[status], ...stateObj[status] };
          }
        }
      }
      return podStatusMap.waiting;
    })(),
    containerStatuses: (() => {
      const containers = pod.status?.containerStatuses || [];

      return containers.map((container) => {
        const containerState = [
          PodStatusEnum.running,
          PodStatusEnum.terminated,
          PodStatusEnum.waiting
        ].find((s) => container.state?.[s]);

        let status: PodStatusMapType = podStatusMap.waiting;
        if (containerState) {
          status =
            containerState === PodStatusEnum.running
              ? podStatusMap[PodStatusEnum.running]
              : { ...podStatusMap[containerState], ...container.state?.[containerState] };
        }

        const containerSpec = pod.spec?.containers.find((spec) => spec.name === container.name);

        return {
          name: container.name,
          state: status,
          cpuLimit: containerSpec?.resources?.limits?.cpu,
          memoryLimit: containerSpec?.resources?.limits?.memory
        };
      });
    })(),
    nodeName: pod.spec?.nodeName || 'node name',
    ip: pod.status?.podIP || 'pod ip',
    restarts: pod.status?.containerStatuses
      ? pod.status?.containerStatuses[0]?.restartCount ?? 0
      : 0,
    age: formatPodTime(pod.metadata?.creationTimestamp),
    usedCpu: {
      name: '',
      xData: new Array(30).fill(0),
      yData: new Array(30).fill('0')
    },
    usedMemory: {
      name: '',
      xData: new Array(30).fill(0),
      yData: new Array(30).fill('0')
    },
    cpu: parseK8sQuantityOrZero(pod.spec?.containers?.[0]?.resources?.limits?.cpu || '0'),
    memory: parseK8sQuantityOrZero(pod.spec?.containers?.[0]?.resources?.limits?.memory || '0')
  };
};

export const adaptMetrics = (metrics: SinglePodMetrics): PodMetrics => {
  return {
    podName: metrics.metadata.name,
    cpu: parseK8sQuantityOrZero(metrics?.containers?.[0]?.usage?.cpu),
    memory: parseK8sQuantityOrZero(metrics?.containers?.[0]?.usage?.memory)
  };
};

export const adaptEvents = (events: CoreV1EventList): PodEvent[] => {
  return events.items
    .sort((a, b) => {
      const lastTimeA = a.lastTimestamp || a.eventTime;
      const lastTimeB = b.lastTimestamp || b.eventTime;

      if (!lastTimeA || !lastTimeB) return 1;
      return new Date(lastTimeB).getTime() - new Date(lastTimeA).getTime();
    })
    .map((item) => ({
      id: item.metadata.uid || `${Date.now()}`,
      reason: item.reason || '',
      message: item.message || '',
      count: item.count || 0,
      type: item.type || 'Warning',
      firstTime: formatPodTime(item.firstTimestamp || item.metadata?.creationTimestamp),
      lastTime: formatPodTime(item.lastTimestamp || item?.eventTime)
    }));
};

export enum YamlKindEnum {
  StatefulSet = 'StatefulSet',
  Deployment = 'Deployment',
  Service = 'Service',
  ConfigMap = 'ConfigMap',
  Ingress = 'Ingress',
  Issuer = 'Issuer',
  Certificate = 'Certificate',
  HorizontalPodAutoscaler = 'HorizontalPodAutoscaler',
  Secret = 'Secret',
  PersistentVolumeClaim = 'PersistentVolumeClaim'
}

export const adaptAppDetail = async (
  configs: DeployKindsType[],
  cloudOptions: {
    domain: string;
    userDomains: {
      name: string;
      secretName: string;
    }[];
  }
): Promise<AppDetailType> => {
  const allServices = configs
    .filter((item) => item.kind === YamlKindEnum.Service)
    .map((item) => item as V1Service);

  const assignedIngresses = new Set<string>();
  const allServicePorts = allServices.flatMap((service) =>
    (service.spec?.ports || []).map((port) => ({ ...port, serviceName: service.metadata?.name }))
  );

  const deployKindsMap: {
    [YamlKindEnum.StatefulSet]?: V1StatefulSet;
    [YamlKindEnum.Deployment]?: V1Deployment;
    [YamlKindEnum.ConfigMap]?: V1ConfigMap;
    [YamlKindEnum.HorizontalPodAutoscaler]?: V2HorizontalPodAutoscaler;
    [YamlKindEnum.Secret]?: V1Secret;
  } = {};

  configs.forEach((item) => {
    if (item.kind) {
      // @ts-ignore
      deployKindsMap[item.kind] = item;
    }
  });

  const appDeploy = deployKindsMap.Deployment || deployKindsMap.StatefulSet;

  if (!appDeploy || !appDeploy?.metadata?.name) {
    throw new Error('获取APP异常');
  }

  const appName = appDeploy.metadata?.name;

  const getConfigMapVolumeNames = (): string[] => {
    if (!deployKindsMap.ConfigMap) return [];

    const configMapName = deployKindsMap.ConfigMap.metadata?.name;
    const configMapVolumes =
      appDeploy?.spec?.template?.spec?.volumes?.filter(
        (volume) => volume.configMap?.name === configMapName
      ) || [];

    return configMapVolumes.map((volume) => volume.name).filter(Boolean) as string[];
  };

  const configMapVolumeNames = getConfigMapVolumeNames();

  const getConfigMapList = (): Array<{
    mountPath: string;
    value: string;
    key: string;
    volumeName: string;
  }> => {
    const configMap = deployKindsMap.ConfigMap;
    if (!configMap?.data || !appDeploy) {
      return [];
    }
    const configMapName = configMap.metadata?.name;
    const volumes = appDeploy.spec?.template?.spec?.volumes || [];
    const configMapVolumes = volumes.filter((volume) => volume.configMap?.name === configMapName);
    if (configMapVolumes.length === 0) {
      return [];
    }
    const volumeMounts = appDeploy.spec?.template?.spec?.containers?.[0]?.volumeMounts || [];
    const results: Array<{ mountPath: string; value: string; key: string; volumeName: string }> =
      [];

    configMapVolumes.forEach((volume) => {
      const relatedMounts = volumeMounts.filter((mount) => mount.name === volume.name);

      if (volume.configMap?.items && volume.configMap.items.length > 0) {
        volume.configMap.items.forEach((item) => {
          if (!item.key) return;
          const matchedMount = relatedMounts.find((mount) => mount.subPath === item.path);

          if (matchedMount) {
            const value = configMap.data?.[item.key] || '';
            results.push({
              mountPath: matchedMount.mountPath,
              value: value,
              key: item.key,
              volumeName: volume.name
            });
          }
        });
      } else {
        relatedMounts.forEach((mount) => {
          if (mount.subPath) {
            const configMapKey = mount.subPath;
            const value = configMap?.data?.[configMapKey] || '';

            if (value) {
              results.push({
                mountPath: mount.mountPath,
                value: value,
                key: configMapKey,
                volumeName: volume.name
              });
            }
          }
        });
      }
    });

    return results.filter((item) => item.value);
  };

  const limits = appDeploy.spec?.template?.spec?.containers?.[0]?.resources?.limits || {};
  const selectors = appDeploy.spec?.template?.spec?.nodeSelector || {};
  const selectorKey =
    Object.keys(selectors).find((key) => key.endsWith('/gpu.product')) || gpuNodeSelectorKey;
  const manufacturer = selectorKey.split('.')[0];
  const resourceKey =
    Object.keys(limits).find(
      (key) => key.startsWith(`${manufacturer}.com/`) && Number(limits[key]) > 0
    ) || gpuResourceKey;
  const useGpu = !!Number(limits[resourceKey]);
  const gpuNodeSelector = useGpu ? selectors : null;

  const podSpec = appDeploy.spec?.template?.spec;
  const container = podSpec?.containers?.[0];
  const referencedVolumes = (podSpec?.volumes || []).filter((v) => v.persistentVolumeClaim);
  const networkStoreList = referencedVolumes.flatMap((volume) =>
    (container?.volumeMounts || [])
      .filter((mount) => mount.name === volume.name)
      .map((mount) => ({
        name: volume.persistentVolumeClaim!.claimName,
        path: mount.mountPath
      }))
  );
  const sharedVolume = (podSpec?.volumes || []).find(
    (v) =>
      v.emptyDir?.medium === 'Memory' &&
      container?.volumeMounts?.some((m) => m.name === v.name && m.mountPath === '/dev/shm')
  );
  const managedExtraVolumes = new Set([
    ...referencedVolumes.map((v) => v.name),
    ...(sharedVolume ? [sharedVolume.name] : [])
  ]);
  const getFilteredVolumeMounts = () => {
    const volumeMounts = appDeploy?.spec?.template?.spec?.containers?.[0]?.volumeMounts || [];
    const storeNames =
      deployKindsMap.StatefulSet?.spec?.volumeClaimTemplates?.map(
        (template) => template.metadata?.name
      ) || [];

    return volumeMounts.filter(
      (mount) =>
        !configMapVolumeNames.includes(mount.name) &&
        !storeNames.includes(mount.name) &&
        !managedExtraVolumes.has(mount.name)
    );
  };

  const getFilteredVolumes = () => {
    return (
      appDeploy?.spec?.template?.spec?.volumes?.filter((volume) => {
        if (managedExtraVolumes.has(volume.name)) return false;
        if (!deployKindsMap.ConfigMap) return true;
        const configMapName = deployKindsMap.ConfigMap.metadata?.name;
        return !(volume.configMap?.name === configMapName);
      }) || []
    );
  };

  return {
    labels: appDeploy?.metadata?.labels || {},
    crYamlList: configs,
    originalWorkload: appDeploy,
    originalResources: configs,
    networkStoreList,
    ephemeralStorage: container?.resources?.limits?.['ephemeral-storage']
      ? parseK8sQuantityOrZero(container.resources.limits['ephemeral-storage'])
      : undefined,
    sharedMemory: sharedVolume
      ? { enabled: true, sizeLimit: parseK8sQuantityOrZero(sharedVolume.emptyDir?.sizeLimit) }
      : undefined,
    tolerations: podSpec?.tolerations,
    serviceList: allServices.map((svc) => ({
      name: svc.metadata?.name || '',
      ports: (svc.spec?.ports || []).map((port) => ({
        name: port.name,
        port: port.port,
        protocol: port.protocol as TransportProtocolType
      }))
    })),
    id: appDeploy.metadata?.uid || ``,
    appName: appName,
    createTime: dayjs(appDeploy.metadata?.creationTimestamp).format('YYYY-MM-DD HH:mm'),
    status: calculateAppStatus(appDeploy),
    isPause: !!appDeploy?.metadata?.annotations?.[pauseKey],
    imageName: atobSecretYaml(deployKindsMap?.Secret?.data?.['.dockerconfigjson']).use
      ? container?.image || appDeploy.metadata?.annotations?.originImageName || ''
      : appDeploy.metadata?.annotations?.originImageName || container?.image || '',
    runCMD: appDeploy.spec?.template?.spec?.containers?.[0]?.command?.join(' ') || '',
    cmdParam:
      (appDeploy.spec?.template?.spec?.containers?.[0]?.args?.length === 1
        ? appDeploy.spec?.template?.spec?.containers?.[0]?.args.join(' ')
        : JSON.stringify(appDeploy.spec?.template?.spec?.containers?.[0]?.args)) || '',
    replicas: appDeploy.spec?.replicas || 0,
    cpu: parseK8sQuantityOrZero(
      appDeploy.spec?.template?.spec?.containers?.[0]?.resources?.limits?.cpu || '0'
    ),
    memory: parseK8sQuantityOrZero(
      appDeploy.spec?.template?.spec?.containers?.[0]?.resources?.limits?.memory || '0'
    ),
    gpu: {
      type: gpuNodeSelector?.[selectorKey] || '',
      amount: Number(limits[resourceKey] || 1),
      manufacturers: manufacturer,
      resource: { card: resourceKey }
    },
    usedCpu: {
      name: '',
      xData: new Array(30).fill(0),
      yData: new Array(30).fill('0')
    },
    usedMemory: {
      name: '',
      xData: new Array(30).fill(0),
      yData: new Array(30).fill('0')
    },
    envs:
      appDeploy.spec?.template?.spec?.containers?.[0]?.env?.map((env) => {
        return {
          key: env.name,
          value: env.value || '',
          valueFrom: env.valueFrom
        };
      }) || [],
    networks:
      allServicePorts?.map((item) => {
        const service = allServices.find((svc) => svc.metadata?.name === item.serviceName);

        const ingress = configs.find(
          (config: any) =>
            item.protocol === 'TCP' &&
            config.kind === YamlKindEnum.Ingress &&
            !assignedIngresses.has(config.metadata?.name) &&
            config?.spec?.rules?.some((rule: any) =>
              rule.http?.paths?.some(
                (path: any) =>
                  path.backend?.service?.name === service?.metadata?.name &&
                  (path.backend?.service?.port?.number === item.port ||
                    (item.name && path.backend?.service?.port?.name === item.name))
              )
            )
        ) as V1Ingress;

        if (ingress?.metadata?.name) assignedIngresses.add(ingress.metadata.name);
        const domain = ingress?.spec?.rules?.[0].host || '';

        const protocol = (item?.protocol || 'TCP') as TransportProtocolType;

        // Should fallback appProtocol to HTTP for ingresses when using TCP services
        const appProtocol =
          (item.appProtocol?.toUpperCase() as ApplicationProtocolType) ||
          (ingress?.metadata?.annotations?.[
            'nginx.ingress.kubernetes.io/backend-protocol'
          ] as ApplicationProtocolType) ||
          (protocol === 'TCP' && !item.nodePort ? 'HTTP' : undefined);

        const isCustomDomain =
          !domain.endsWith(cloudOptions.domain) &&
          !cloudOptions.userDomains.some((item) => domain.endsWith(item.name));

        const result = {
          routes: ingress?.spec?.rules?.[0]?.http?.paths?.map((path) => ({
            path: path.path || '/',
            pathType: path.pathType as any,
            serviceName: path.backend.service?.name,
            servicePort: path.backend.service?.port?.number,
            servicePortName: path.backend.service?.port?.name
          })),
          serviceName: service?.metadata?.name || '',
          networkName: ingress?.metadata?.name || '',
          portName: item.name || '',
          port: item.port,
          nodePort: item?.nodePort,
          openNodePort: !!item?.nodePort,
          protocol: protocol,
          appProtocol: appProtocol,
          openPublicDomain: !!ingress,
          publicDomain: isCustomDomain
            ? ingress?.metadata?.labels?.[publicDomainKey] || ''
            : domain.split('.')[0],
          customDomain: isCustomDomain ? normalizeCustomDomainHost(domain) : '',
          domain: isCustomDomain
            ? cloudOptions.domain
            : item?.nodePort
            ? cloudOptions.domain
            : domain.split('.').slice(1).join('.') || cloudOptions.domain
        };
        return result;
      }) || [],
    hpa: deployKindsMap.HorizontalPodAutoscaler?.spec
      ? {
          use: true,
          target:
            deployKindsMap.HorizontalPodAutoscaler.spec.metrics?.[0]?.pods?.metric?.name ===
            'DCGM_FI_DEV_GPU_UTIL'
              ? 'gpu'
              : (deployKindsMap.HorizontalPodAutoscaler.spec.metrics?.[0]?.resource
                  ?.name as HpaTarget) || 'cpu',
          value: (() => {
            const metrics = deployKindsMap.HorizontalPodAutoscaler.spec.metrics?.[0];
            if (metrics?.pods?.metric?.name === 'DCGM_FI_DEV_GPU_UTIL') {
              return Number(metrics.pods.target?.averageValue) || 50;
            }
            return metrics?.resource?.target?.averageUtilization
              ? metrics.resource.target.averageUtilization / 10
              : 50;
          })(),
          minReplicas: deployKindsMap.HorizontalPodAutoscaler.spec.minReplicas || 3,
          maxReplicas: deployKindsMap.HorizontalPodAutoscaler.spec.maxReplicas || 10
        }
      : defaultEditVal.hpa,
    configMapList: getConfigMapList(),
    secret: atobSecretYaml(deployKindsMap?.Secret?.data?.['.dockerconfigjson']),
    storeList: deployKindsMap.StatefulSet?.spec?.volumeClaimTemplates
      ? deployKindsMap.StatefulSet?.spec?.volumeClaimTemplates.map((item) => {
          const storage = item.spec?.resources?.requests?.storage;
          return {
            name: item.metadata?.name || '',
            path:
              item.metadata?.annotations?.path ||
              container?.volumeMounts?.find((m) => m.name === item.metadata?.name)?.mountPath ||
              '',
            storageClassName: item.spec?.storageClassName,
            storageType: 'local',
            value: storage
              ? parseK8sQuantityOrZero(storage)
              : storageAnnotationToQuantity(item.metadata?.annotations?.value)
          };
        })
      : [],
    volumeMounts: getFilteredVolumeMounts(),
    volumes: getFilteredVolumes(),
    kind: appDeploy?.kind?.toLowerCase() as 'deployment' | 'statefulset',
    source: getAppSource(appDeploy),
    openapi: {
      status: {
        observedGeneration: appDeploy.status?.observedGeneration || 0,
        replicas: appDeploy.status?.replicas || 0,
        availableReplicas: appDeploy.status?.availableReplicas || 0,
        updatedReplicas: appDeploy.status?.updatedReplicas || 0,
        isPause: !!appDeploy?.metadata?.annotations?.[pauseKey]
      }
    }
  };
};

export const adaptEditAppData = (app: AppDetailType): AppEditType => {
  const keys: (keyof AppEditType)[] = [
    'appName',
    'imageName',
    'runCMD',
    'cmdParam',
    'replicas',
    'cpu',
    'memory',
    'networks',
    'envs',
    'hpa',
    'configMapList',
    'secret',
    'storeList',
    'gpu',
    'labels',
    'kind',
    'volumes',
    'volumeMounts',
    'originalWorkload',
    'originalResources',
    'networkStoreList',
    'ephemeralStorage',
    'sharedMemory',
    'tolerations',
    'serviceList'
  ];

  const res: Record<string, any> = {};

  keys.forEach((key) => {
    res[key] = app[key];
  });
  return res as AppEditType;
};

export const sliderNumber2MarkList = ({
  val,
  type,
  gpuAmount = 1
}: {
  val: number[];
  type: 'cpu' | 'memory';
  gpuAmount?: number;
}) => {
  const newVal = val.map((item) => item);

  return newVal.map((item) => ({
    label: type === 'memory' ? (item >= 1024 ? `${item / 1024} G` : `${item} M`) : `${item / 1000}`,
    value: item
  }));
};
