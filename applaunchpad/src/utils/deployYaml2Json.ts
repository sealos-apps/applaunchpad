import {
  appDeployKey,
  deployPVCResizeKey,
  gpuNodeSelectorKey,
  gpuResourceKey,
  maxReplicasKey,
  minReplicasKey,
  publicDomainKey,
  publicDomainPortKey
} from '@/constants/app';
import type { AppEditType } from '@/types/app';
import { ensureUniquePortNames, str2Num, strToBase64 } from '@/utils/tools';
import { preserveWorkloadFields } from '@/utils/workloadPreservation';
import yaml from 'js-yaml';
import { customAlphabet, customRandom } from 'nanoid';
import crypto from 'crypto';
import {
  cpuRequestQuantity,
  memoryRequestQuantity,
  quantityToStorageGi,
  storageGiToQuantity
} from '@/utils/resourceQuantity';

// Create deterministic nanoid based on seed
const createDeterministicNanoid = (seed: string): string => {
  const deterministicNanoid = customRandom('abcdefghijklmnopqrstuvwxyz', 12, (size) => {
    const hash = crypto.createHash('sha256').update(seed).digest();
    const result = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      result[i] = hash[i % hash.length];
    }
    return result;
  });
  return deterministicNanoid();
};

// Unified service name generation function
const getServiceName = (data: AppEditType, forNodePort: boolean = false): string => {
  const existingServiceName = data.networks.find((network) => {
    return network.openNodePort === forNodePort && network.serviceName;
  })?.serviceName;

  if (existingServiceName) {
    return existingServiceName;
  }

  const portsOfType = data.networks.filter((n) => n.openNodePort === forNodePort);
  const portSlugs = portsOfType.map((n) => n.protocol + n.port).sort();
  const seed = `${data.appName}-${forNodePort ? 'nodeport' : 'cluster'}-${portSlugs.join(',')}`;
  const deterministicId = createDeterministicNanoid(seed);
  const suffix = forNodePort ? '-nodeport' : '';

  const normalized = data.appName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = (/^[a-z]/.test(normalized) ? normalized : `app-${normalized || 'service'}`)
    .slice(0, 63 - suffix.length - deterministicId.length - 1)
    .replace(/-+$/g, '');
  return `${base}${suffix}-${deterministicId}`;
};

export const yamlString2Objects = (yamlString: string): object[] => {
  if (!yamlString.trim()) return [];

  const documents = yamlString.split(/\n---\n/);
  return documents.filter((doc) => doc.trim()).map((doc) => yaml.load(doc.trim()) as object);
};

export const json2DeployCr = (data: AppEditType, type: 'deployment' | 'statefulset') => {
  const localStores = data.storeList.filter((store) => store.storageType !== 'remote');
  const remoteStores = data.storeList.filter((store) => store.storageType === 'remote');
  const gpuResource = data.gpu?.resource?.card || gpuResourceKey;
  const totalStorage = localStores.reduce((acc, item) => acc + quantityToStorageGi(item.value), 0);

  const metadata = {
    name: data.appName,
    annotations: {
      originImageName: data.imageName,
      ...(remoteStores.length ? { remoteStores: JSON.stringify(remoteStores) } : {}),
      ...((data.networkStoreList || []).length
        ? { networkStores: JSON.stringify(data.networkStoreList) }
        : {}),
      [minReplicasKey]: `${data.hpa.use ? data.hpa.minReplicas : data.replicas}`,
      [maxReplicasKey]: `${data.hpa.use ? data.hpa.maxReplicas : data.replicas}`,
      [deployPVCResizeKey]: storageGiToQuantity(totalStorage).formatForDisplay({
        format: 'BinarySI',
        scale: 'auto',
        digits: 4
      })
    },
    labels: {
      ...(data.labels || {}),
      [appDeployKey]: data.appName,
      app: data.appName
    }
  };
  const commonSpec = {
    replicas: str2Num(data.hpa.use ? data.hpa.minReplicas : data.replicas),
    revisionHistoryLimit: 1,
    selector: {
      matchLabels: {
        app: data.appName
      }
    }
  };
  const templateMetadata = {
    labels: {
      app: data.appName
    }
  };
  const imagePullSecrets = data.secret.use
    ? [
        {
          name: data.appName
        }
      ]
    : undefined;
  const commonContainer = {
    name: data.appName,
    image: resolveImageRegistryBinding({
      imageName: data.imageName,
      credentialRegistry: data.secret.serverAddress,
      useCredentials: data.secret.use
    }).imageName,
    env:
      data.envs.length > 0
        ? data.envs.map((env) => ({
            name: env.key,
            value: env.valueFrom ? undefined : env.value,
            valueFrom: env.valueFrom
          }))
        : [],
    resources: {
      requests: {
        cpu: cpuRequestQuantity(data.cpu).withFormat('DecimalSI').toString(),
        memory: memoryRequestQuantity(data.memory).withFormat('BinarySI').toString(),
        ...(!!data.gpu?.type ? { [gpuResource]: data.gpu.amount } : {})
      },
      limits: {
        cpu: data.cpu.withFormat('DecimalSI').toString(),
        memory: data.memory.withFormat('BinarySI').toString(),
        ...(data.ephemeralStorage ? { 'ephemeral-storage': data.ephemeralStorage.toString() } : {}),
        ...(!!data.gpu?.type ? { [gpuResource]: data.gpu.amount } : {})
      }
    },
    command: (() => {
      if (!data.runCMD) return undefined;
      try {
        return JSON.parse(data.runCMD);
      } catch (error) {
        return data.runCMD.split(' ').filter((item) => item);
      }
    })(),
    args: (() => {
      if (!data.cmdParam) return undefined;
      try {
        return JSON.parse(data.cmdParam) as string[];
      } catch (error) {
        return [data.cmdParam];
      }
    })(),
    ports: ensureUniquePortNames(
      data.networks.map((item, i) => ({
        containerPort: item.port,
        name: item.portName
      }))
    ),
    imagePullPolicy: 'Always'
  };

  const configMapVolumeMounts = data.configMapList.map((item) => ({
    name: item.volumeName,
    mountPath: item.mountPath,
    subPath: item.key
  }));

  const generateConfigMapVolumes = () => {
    if (data.configMapList.length === 0) return [];
    const uniqueVolumeNames = [...new Set(data.configMapList.map((item) => item.volumeName))];
    return uniqueVolumeNames.map((volumeName) => ({
      name: volumeName,
      configMap: {
        name: data.appName
      }
    }));
  };

  const configMapVolumes = generateConfigMapVolumes();

  const referencedStores = [...remoteStores, ...(data.networkStoreList || [])];
  const managedNames = new Set([...referencedStores.map((store) => store.name), 'shared-memory']);
  const volumeNameFor = (store: { name: string; path: string }) => {
    const spec = data.originalWorkload?.spec?.template?.spec;
    return (
      spec?.volumes?.find(
        (v: any) =>
          v.persistentVolumeClaim?.claimName === store.name &&
          spec.containers?.[0]?.volumeMounts?.some(
            (m: any) => m.name === v.name && m.mountPath === store.path
          )
      )?.name || store.name
    );
  };
  const sharedMemoryName =
    data.originalWorkload?.spec?.template?.spec?.containers?.[0]?.volumeMounts?.find(
      (m: any) => m.mountPath === '/dev/shm'
    )?.name || 'shared-memory';
  const finalVolumes = [
    ...(data.volumes || []).filter((volume) => !managedNames.has(volume.name)),
    ...configMapVolumes,
    ...referencedStores.map((store) => ({
      name: volumeNameFor(store),
      persistentVolumeClaim: { claimName: store.name }
    })),
    ...(data.sharedMemory?.enabled
      ? [
          {
            name: sharedMemoryName,
            emptyDir: { medium: 'Memory', sizeLimit: data.sharedMemory.sizeLimit.toString() }
          }
        ]
      : [])
  ];
  const finalVolumeMounts = [
    ...(data.volumeMounts || []).filter((mount) => !managedNames.has(mount.name)),
    ...configMapVolumeMounts,
    ...referencedStores.map((store) => ({ name: volumeNameFor(store), mountPath: store.path })),
    ...(data.sharedMemory?.enabled ? [{ name: sharedMemoryName, mountPath: '/dev/shm' }] : [])
  ];

  // pvc settings
  const storageTemplates = localStores.map((store) => ({
    metadata: {
      annotations: {
        path: store.path,
        value: store.value.formatForDisplay({
          format: 'BinarySI',
          scale: 'auto',
          digits: 4
        })
      },
      name: store.name
    },
    spec: {
      ...(store.storageClassName ? { storageClassName: store.storageClassName } : {}),
      accessModes: ['ReadWriteOnce'],
      resources: {
        requests: {
          storage: store.value.withFormat('BinarySI').toString()
        }
      }
    }
  }));

  // gpu node selector
  const gpuMap = !!data.gpu?.type
    ? {
        restartPolicy: 'Always',
        ...(data.gpu?.manufacturers === 'nvidia' ? { runtimeClassName: 'nvidia' } : {}),
        nodeSelector: {
          [data.gpu?.manufacturers && data.gpu.manufacturers !== 'nvidia'
            ? `${data.gpu.manufacturers}.com/gpu.product`
            : gpuNodeSelectorKey]: data.gpu.type
        }
      }
    : {};

  const template = {
    deployment: {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata,
      spec: {
        ...commonSpec,
        strategy: {
          type: 'RollingUpdate',
          rollingUpdate: {
            maxUnavailable: 0,
            maxSurge: 1
          }
        },
        template: {
          metadata: templateMetadata,
          spec: {
            automountServiceAccountToken: false,
            imagePullSecrets,
            containers: [
              {
                ...commonContainer,
                volumeMounts: finalVolumeMounts
              }
            ],
            ...gpuMap,
            ...(data.tolerations !== undefined ? { tolerations: data.tolerations } : {}),
            volumes: finalVolumes
          }
        }
      }
    },
    statefulset: {
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata,
      spec: {
        ...commonSpec,
        updateStrategy: {
          type: 'RollingUpdate',
          rollingUpdate: {
            maxUnavailable: '50%'
          }
        },
        minReadySeconds: 10,
        serviceName: getServiceName(data, false),
        template: {
          metadata: templateMetadata,
          spec: {
            automountServiceAccountToken: false,
            imagePullSecrets,
            terminationGracePeriodSeconds: 10,
            containers: [
              {
                ...commonContainer,
                volumeMounts: [
                  ...finalVolumeMounts,
                  ...localStores.map((item) => ({
                    name: item.name,
                    mountPath: item.path
                  }))
                ]
              }
            ],
            ...gpuMap,
            ...(data.tolerations !== undefined ? { tolerations: data.tolerations } : {}),
            volumes: finalVolumes
          }
        },
        volumeClaimTemplates: storageTemplates
      }
    }
  };

  return yaml.dump(preserveWorkloadFields(data, template[type]));
};

export const json2Service = (data: AppEditType) => {
  const groups = new Map<string, AppEditType['networks']>();
  for (const network of data.networks) {
    const name = network.serviceName || getServiceName(data, network.openNodePort);
    groups.set(name, [...(groups.get(name) || []), network]);
  }
  return [...groups.entries()]
    .sort(
      (a, b) => Number(a[1].some((n) => n.openNodePort)) - Number(b[1].some((n) => n.openNodePort))
    )
    .map(([name, networks]) => {
      const original = data.originalResources?.find(
        (resource) => resource.kind === 'Service' && resource.metadata?.name === name
      ) as any;
      const nodePort = networks.some((network) => network.openNodePort);
      const service = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          ...original?.metadata,
          name,
          labels: { ...original?.metadata?.labels, [appDeployKey]: data.appName }
        },
        spec: {
          ...original?.spec,
          type: nodePort ? 'NodePort' : 'ClusterIP',
          selector: original?.spec?.selector || { app: data.appName },
          ports: ensureUniquePortNames(
            networks.map((network) => {
              const old = original?.spec?.ports?.find(
                (port: any) => port.name === network.portName
              );
              return {
                ...old,
                name: network.portName,
                port: network.port,
                targetPort: old?.port === network.port ? old.targetPort : network.port,
                protocol: network.protocol,
                ...(nodePort && network.appProtocol
                  ? { appProtocol: network.appProtocol.toLowerCase() }
                  : {}),
                nodePort: nodePort ? network.nodePort : undefined
              };
            })
          )
        }
      };
      return yaml.dump(service);
    })
    .join('\n---\n');
};

export const json2Ingress = (
  data: AppEditType,
  userDomains: { name: string; secretName: string }[],
  options: {
    disableHttps?: boolean;
    customDomainMode?: 'cname' | 'certificate';
    customDomainCertificateSecretName?: string;
  } = {}
) => {
  const disableHttps = options.disableHttps ?? false;
  // different protocol annotations
  const map = {
    HTTP: {
      'nginx.ingress.kubernetes.io/backend-protocol': 'HTTP',
      'nginx.ingress.kubernetes.io/client-body-buffer-size': '64k',
      'nginx.ingress.kubernetes.io/proxy-buffer-size': '64k',
      'nginx.ingress.kubernetes.io/proxy-send-timeout': '300',
      'nginx.ingress.kubernetes.io/proxy-read-timeout': '300',
      'nginx.ingress.kubernetes.io/server-snippet':
        'client_header_buffer_size 64k;\nlarge_client_header_buffers 4 128k;\n'
    },
    GRPC: {
      'nginx.ingress.kubernetes.io/backend-protocol': 'GRPC'
    },
    WS: {
      'nginx.ingress.kubernetes.io/proxy-read-timeout': '3600',
      'nginx.ingress.kubernetes.io/proxy-send-timeout': '3600',
      'nginx.ingress.kubernetes.io/backend-protocol': 'WS'
    }
  };

  const result = data.networks
    .filter((item) => item.openPublicDomain && !item.openNodePort)
    .map((network, i) => {
      const host = network.customDomain
        ? network.customDomain
        : `${network.publicDomain}.${network.domain}`;

      const secretName = network.customDomain
        ? options.customDomainMode === 'certificate'
          ? options.customDomainCertificateSecretName || 'wildcard-cert'
          : network.networkName
        : userDomains.find((domain) => domain.name === network.domain)?.secretName ||
          'wildcard-cert';
      // Ingress only uses ClusterIP services, not NodePort
      const serviceName = network.serviceName || getServiceName(data, false);

      const originalIngress = data.originalResources?.find(
        (resource) => resource.kind === 'Ingress' && resource.metadata?.name === network.networkName
      ) as any;
      const ingress: any = {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'Ingress',
        metadata: {
          ...originalIngress?.metadata,
          name: network.networkName,
          labels: {
            [appDeployKey]: data.appName,
            ...originalIngress?.metadata?.labels,
            [publicDomainKey]: network.publicDomain,
            [publicDomainPortKey]: String(network.port)
          },
          annotations: {
            ...originalIngress?.metadata?.annotations,
            'kubernetes.io/ingress.class':
              originalIngress?.metadata?.annotations?.['kubernetes.io/ingress.class'] || 'nginx',
            'nginx.ingress.kubernetes.io/proxy-body-size': '32m',
            ...map[network.appProtocol ?? 'HTTP']
          }
        },
        spec: {
          ...originalIngress?.spec,
          rules: [
            {
              host,
              http: {
                paths: (network.routes?.length
                  ? network.routes
                  : [
                      {
                        path: '/',
                        pathType: 'Prefix',
                        serviceName: network.serviceName || serviceName,
                        servicePort: network.port,
                        servicePortName: undefined
                      }
                    ]
                ).map((route) => ({
                  pathType: route.pathType,
                  path: route.path,
                  backend: {
                    service: {
                      name: route.serviceName || network.serviceName || serviceName,
                      port: route.servicePortName
                        ? { name: route.servicePortName }
                        : { number: route.servicePort || network.port }
                    }
                  }
                }))
              }
            }
          ]
        }
      };
      if (originalIngress?.spec?.rules?.length > 1)
        ingress.spec.rules.push(...originalIngress.spec.rules.slice(1));
      if (disableHttps) delete ingress.spec.tls;
      if (
        !disableHttps &&
        originalIngress?.spec?.rules?.[0]?.host === host &&
        originalIngress?.spec?.tls
      ) {
        ingress.spec.tls = originalIngress.spec.tls;
      } else if (!disableHttps) {
        ingress.spec.tls = [
          {
            hosts: [host],
            secretName
          }
        ];
      }
      const issuer = {
        apiVersion: 'cert-manager.io/v1',
        kind: 'Issuer',
        metadata: {
          name: network.networkName,
          labels: {
            [appDeployKey]: data.appName
          }
        },
        spec: {
          acme: {
            server: 'https://acme-v02.api.letsencrypt.org/directory',
            email: 'admin@sealos.io',
            privateKeySecretRef: {
              name: 'letsencrypt-prod'
            },
            solvers: [
              {
                http01: {
                  ingress: {
                    class: 'nginx',
                    serviceType: 'ClusterIP'
                  }
                }
              }
            ]
          }
        }
      };
      const certificate = {
        apiVersion: 'cert-manager.io/v1',
        kind: 'Certificate',
        metadata: {
          name: network.networkName,
          labels: {
            [appDeployKey]: data.appName
          }
        },
        spec: {
          secretName,
          dnsNames: [network.customDomain],
          issuerRef: {
            name: network.networkName,
            kind: 'Issuer'
          }
        }
      };

      let resYaml = yaml.dump(ingress);
      if (network.customDomain && !disableHttps && options.customDomainMode !== 'certificate') {
        resYaml += `\n---\n${yaml.dump(issuer)}\n---\n${yaml.dump(certificate)}`;
      }
      return resYaml;
    });

  return result.join('\n---\n');
};

export const json2ServiceObjects = (data: AppEditType): object[] => {
  return yamlString2Objects(json2Service(data));
};

export const json2IngressObjects = (
  data: AppEditType,
  userDomains: { name: string; secretName: string }[],
  options: {
    disableHttps?: boolean;
  } = {}
): object[] => {
  return yamlString2Objects(json2Ingress(data, userDomains, options));
};

export const json2ConfigMap = (data: AppEditType) => {
  if (data.configMapList.length === 0) return '';

  const configFile: { [key: string]: string } = {};
  data.configMapList.forEach((item) => {
    configFile[item.key] = item.value;
  });

  const original = data.originalResources?.find(resource => resource.kind === 'ConfigMap' && resource.metadata?.name === data.appName);
  const template = {
    ...original,
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      ...original?.metadata,
      name: data.appName
    },
    data: { ...original?.data, ...configFile }
  };

  return yaml.dump(template);
};

export const json2Secret = (data: AppEditType) => {
  const binding = resolveImageRegistryBinding({
    imageName: data.imageName,
    credentialRegistry: data.secret.serverAddress,
    useCredentials: data.secret.use,
    requireCredentialMatch: true
  });
  const auth = strToBase64(`${data.secret.username}:${data.secret.password}`);
  const dockerconfigjson = strToBase64(
    JSON.stringify({
      auths: {
        [binding.registry]: {
          username: data.secret.username,
          password: data.secret.password,
          auth
        }
      }
    })
  );

  const template = {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: data.appName
    },
    data: {
      '.dockerconfigjson': dockerconfigjson
    },
    type: 'kubernetes.io/dockerconfigjson'
  };
  return yaml.dump(template);
};
export const json2HPA = (data: AppEditType) => {
  const isDeployment =
    data.kind !== 'statefulset' && !data.storeList?.some((store) => store.storageType !== 'remote');

  const template = {
    apiVersion: 'autoscaling/v2',
    kind: 'HorizontalPodAutoscaler',
    metadata: {
      name: data.appName
    },
    spec: {
      scaleTargetRef: {
        apiVersion: 'apps/v1',
        kind: isDeployment ? 'Deployment' : 'StatefulSet',
        name: data.appName
      },
      minReplicas: str2Num(data.hpa?.minReplicas),
      maxReplicas: str2Num(data.hpa?.maxReplicas),
      metrics:
        data.hpa.target === 'gpu'
          ? [
              {
                pods: {
                  metric: {
                    name: 'DCGM_FI_DEV_GPU_UTIL'
                  },
                  target: {
                    averageValue: data.hpa.value.toString(),
                    type: 'AverageValue'
                  }
                },
                type: 'Pods'
              }
            ]
          : [
              {
                type: 'Resource',
                resource: {
                  name: data.hpa.target,
                  target: {
                    type: 'Utilization',
                    averageUtilization: str2Num(data.hpa.value * 10)
                  }
                }
              }
            ],
      ...(data.hpa.target !== 'gpu' && {
        behavior: {
          scaleDown: {
            policies: [
              {
                type: 'Pods',
                value: 1,
                periodSeconds: 60
              }
            ]
          },
          scaleUp: {
            policies: [
              {
                type: 'Pods',
                value: 1,
                periodSeconds: 60
              }
            ]
          }
        }
      })
    }
  };
  const original = data.originalResources?.find((r) => r.kind === 'HorizontalPodAutoscaler') as any;
  if (original) {
    const oldMetric = original.spec?.metrics?.[0];
    const oldTarget =
      oldMetric?.pods?.metric?.name === 'DCGM_FI_DEV_GPU_UTIL'
        ? 'gpu'
        : oldMetric?.resource?.name || 'cpu';
    const oldValue =
      oldTarget === 'gpu'
        ? Number(oldMetric?.pods?.target?.averageValue)
        : oldMetric?.resource?.target?.averageUtilization / 10;
    template.metadata = { ...original.metadata, ...template.metadata };
    template.spec = {
      ...original.spec,
      ...template.spec,
      ...(original.spec?.behavior ? { behavior: original.spec.behavior } : {})
    };
    if (oldTarget === data.hpa.target && oldValue === data.hpa.value)
      template.spec.metrics = original.spec.metrics;
  }
  return yaml.dump(template);
};

const getExplicitImageRegistryAddress = (imageName: string): string | undefined => {
  const components = imageName.trim().split('/');
  const firstComponent = components[0];
  if (
    components.length > 1 &&
    firstComponent &&
    (firstComponent === 'localhost' || firstComponent.includes('.') || firstComponent.includes(':'))
  ) {
    return firstComponent;
  }
  return undefined;
};

const dockerHubRegistryAliases = new Set(['docker.io', 'index.docker.io', 'index.docker.io/v1']);

const normalizeRegistryAddress = (serverAddress: string) => {
  const normalized = serverAddress
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/g, '')
    .toLowerCase();

  return dockerHubRegistryAliases.has(normalized) ? 'docker.io' : normalized;
};

export const getImageRegistryAddress = (imageName: string): string =>
  normalizeRegistryAddress(getExplicitImageRegistryAddress(imageName) || 'docker.io');

const registryCredentialsCoverImage = (imageName: string, credentialRegistry: string) => {
  const explicitRegistry = getExplicitImageRegistryAddress(imageName);
  if (!explicitRegistry) {
    return normalizeRegistryAddress(credentialRegistry) === 'docker.io';
  }

  const normalizedImageRegistry = normalizeRegistryAddress(explicitRegistry);
  const normalizedCredentialRegistry = normalizeRegistryAddress(credentialRegistry);
  if (normalizedCredentialRegistry === normalizedImageRegistry) {
    return true;
  }

  const normalizedImageName = `${normalizedImageRegistry}${imageName
    .trim()
    .slice(explicitRegistry.length)
    .toLowerCase()}`;
  return normalizedImageName.startsWith(`${normalizedCredentialRegistry}/`);
};

export const alignImageRegistrySecret = (
  imageName: string,
  secret: AppEditType['secret']
): AppEditType['secret'] => {
  const imageRegistry = getImageRegistryAddress(imageName);
  const credentialRegistry = normalizeRegistryAddress(secret.serverAddress);

  if (
    credentialRegistry === imageRegistry ||
    registryCredentialsCoverImage(imageName, secret.serverAddress)
  ) {
    return secret;
  }

  return {
    ...secret,
    username: '',
    password: '',
    serverAddress: imageRegistry
  };
};

export const getBoundImageRegistryCredentials = (
  imageName: string,
  secret: AppEditType['secret']
) => {
  const imageRegistry = getImageRegistryAddress(imageName);
  if (!secret.use || !registryCredentialsCoverImage(imageName, secret.serverAddress)) {
    return undefined;
  }

  return {
    username: secret.username,
    password: secret.password,
    serverAddress: imageRegistry
  };
};

export const resolveImageRegistryBinding = ({
  imageName: rawImageName,
  credentialRegistry: rawCredentialRegistry,
  useCredentials,
  requireCredentialMatch = false
}: {
  imageName: string;
  credentialRegistry?: string;
  useCredentials: boolean;
  requireCredentialMatch?: boolean;
}) => {
  const imageName = rawImageName.trim();
  const explicitRegistry = getExplicitImageRegistryAddress(imageName);
  const normalizedExplicitRegistry = explicitRegistry
    ? normalizeRegistryAddress(explicitRegistry)
    : undefined;
  const credentialRegistry = useCredentials
    ? normalizeRegistryAddress(rawCredentialRegistry || '')
    : '';

  if (
    requireCredentialMatch &&
    normalizedExplicitRegistry &&
    credentialRegistry &&
    !registryCredentialsCoverImage(imageName, credentialRegistry)
  ) {
    throw new Error('Image registry credentials do not match the image registry');
  }

  const registry = credentialRegistry || normalizedExplicitRegistry || 'docker.io';
  const resolvedImageName =
    useCredentials && !explicitRegistry && registry !== 'docker.io' && imageName
      ? `${registry}/${imageName}`
      : imageName;

  return { imageName: resolvedImageName, registry };
};
