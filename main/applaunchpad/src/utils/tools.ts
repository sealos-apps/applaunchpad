import dayjs from 'dayjs';
import { useToast } from '@/hooks/useToast';
import { AppEditType } from '@/types/app';
import { defaultEditVal } from '@/constants/editApp';
import yaml from 'js-yaml';
import { DeployKindsType } from '@/types/app';
import type { AppDetailType, AppPatchPropsType } from '@/types/app';
import { YamlKindEnum } from './adapt';
import { useTranslation } from 'next-i18next';
import * as jsonpatch from 'fast-json-patch';
import { Base64 } from 'js-base64';

const preserveInitContainerVolumes = (source: any, target: any) => {
  const initVolumeMountNames = new Set<string>();

  source?.spec?.template?.spec?.initContainers?.forEach((container: any) => {
    container?.volumeMounts?.forEach((mount: any) => {
      if (mount?.name) {
        initVolumeMountNames.add(mount.name);
      }
    });
  });

  if (initVolumeMountNames.size === 0) return;

  const sourceVolumes = source?.spec?.template?.spec?.volumes || [];
  const targetSpec = target?.spec?.template?.spec;
  if (!targetSpec) return;

  const targetVolumes = targetSpec.volumes || [];
  const targetVolumeNames = new Set(
    targetVolumes.map((volume: any) => volume?.name).filter(Boolean)
  );
  const missingVolumes = sourceVolumes.filter(
    (volume: any) =>
      volume?.name && initVolumeMountNames.has(volume.name) && !targetVolumeNames.has(volume.name)
  );

  if (missingVolumes.length === 0) return;

  targetSpec.volumes = [...targetVolumes, ...missingVolumes];
};

export function formatSize(size: number, fixedNumber = 2) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  let i = 0;
  while (size >= 1024) {
    size /= 1024;
    i++;
  }
  return size.toFixed(fixedNumber) + ' ' + units[i];
}

export const formatTime = (time: string | number | Date, format = 'YYYY-MM-DD HH:mm:ss') => {
  return dayjs(time).format(format);
};

/**
 * copy text data
 */
export const useCopyData = () => {
  const { toast } = useToast();
  const { t } = useTranslation();

  const copyData = async (data: string, title: string = 'Copy Success') => {
    console.log('Attempting to copy:', data);

    // Modern browsers (Chrome, Edge, Safari, Firefox) support the Clipboard API.
    // This is the preferred method. It only works in secure contexts (HTTPS or localhost).
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(data);
        toast({
          title: t(title),
          status: 'success',
          duration: 1000
        });
        return; // Exit the function after successful copy
      } catch (err) {
        console.error('Clipboard API failed, falling back...', err);
        // The error will be caught, and we'll proceed to the fallback method.
      }
    }

    // Fallback for older browsers or if the Clipboard API fails (e.g., due to permissions).
    try {
      const textarea = document.createElement('textarea');
      textarea.value = data;
      // Make the textarea invisible
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.left = '-9999px';

      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);

      toast({
        title: t(title),
        status: 'success',
        duration: 1000
      });
    } catch (error) {
      // If both methods fail, show an error.
      console.error('Fallback copy method failed', error);
      toast({
        title: t('Copy Failed'),
        status: 'error'
      });
    }
  };

  return { copyData };
};

/**
 * format string to number or ''
 */
export const str2Num = (str?: string | number) => {
  return !!str ? +str : '';
};

export const mountPathToConfigMapKey = (str: string) => {
  const endsWithSlash = str.endsWith('/');
  const withoutTrailingSlash = endsWithSlash ? str.slice(0, -1) : str;
  const replacedStr = withoutTrailingSlash.replace(/_/g, '-').replace(/[\/.]/g, 'vn-');
  const result = replacedStr.toLowerCase();

  if (result.length > 63) {
    return result.slice(-63);
  }

  return result;
};

/**
 * str to base64
 */
export const strToBase64 = (str: string) => {
  try {
    const base64 = Base64.encode(str);
    return base64;
  } catch (error) {
    console.log(error);
  }
  return '';
};
/**
 * atob secret yaml
 */
export const atobSecretYaml = (secret?: string): AppEditType['secret'] => {
  if (!secret) return defaultEditVal.secret;
  try {
    const secretData = JSON.parse(Base64.decode(secret)).auths;
    console.log('secretData', secretData);
    const serverAddress = Object.keys(secretData)[0];

    return {
      serverAddress,
      username: secretData[serverAddress].username,
      password: secretData[serverAddress].password,
      use: true
    };
  } catch (error) {
    console.log(error);
  }
  return defaultEditVal.secret;
};

/**
 * format pod createTime
 */
export const formatPodTime = (createTimeStamp: Date = new Date()) => {
  const podStartTimeStamp = dayjs(createTimeStamp);

  let timeDiff = Math.floor(dayjs().diff(podStartTimeStamp) / 1000);

  // 计算天数
  const days = Math.floor(timeDiff / (24 * 60 * 60));
  timeDiff -= days * 24 * 60 * 60;

  // 计算小时数
  const hours = Math.floor(timeDiff / (60 * 60));
  timeDiff -= hours * 60 * 60;

  // 计算分钟数
  const minutes = Math.floor(timeDiff / 60);
  timeDiff -= minutes * 60;

  // 计算秒数
  const seconds = timeDiff;

  if (days > 0) {
    return `${days}d${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m${seconds}s`;
  }
  return `${seconds}s`;
};

/**
 * download file
 */
export function downLoadBold(content: BlobPart, type: string, fileName: string) {
  // 创建一个 Blob 对象
  const blob = new Blob([content], { type });

  // 创建一个 URL 对象
  const url = URL.createObjectURL(blob);

  // 创建一个 a 标签
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;

  // 模拟点击 a 标签下载文件
  link.click();
}

/**
 * patch yamlList and get action
 */
const isWorkloadKind = (
  kind?: string
): kind is YamlKindEnum.Deployment | YamlKindEnum.StatefulSet =>
  kind === YamlKindEnum.Deployment || kind === YamlKindEnum.StatefulSet;

export const patchWillRestartApp = (patch: AppPatchPropsType) =>
  patch.some((item) => {
    if (!isWorkloadKind(item.kind)) return false;

    return (
      item.type === 'create' ||
      item.type === 'delete' ||
      (item.type === 'patch' && item.restartRequired === true)
    );
  });

const createRestartTimePatch = (workload: DeployKindsType, restartTime: string) => ({
  apiVersion: workload.apiVersion,
  kind: workload.kind,
  metadata: {
    name: workload.metadata?.name,
    namespace: workload.metadata?.namespace
  },
  spec: {
    template: {
      metadata: {
        labels: {
          restartTime
        }
      }
    }
  }
});

const ensureRestartTimePatch = ({
  actions,
  originalYamlList,
  oldFormJsonList
}: {
  actions: AppPatchPropsType;
  originalYamlList: DeployKindsType[];
  oldFormJsonList: DeployKindsType[];
}) => {
  const workload =
    originalYamlList.find((item) => isWorkloadKind(item.kind)) ||
    oldFormJsonList.find((item) => isWorkloadKind(item.kind));

  if (!workload || !isWorkloadKind(workload.kind)) return;

  const restartTime = dayjs().format('YYYYMMDDHHmmss');
  const workloadPatch = actions.find(
    (item) => item.type === 'patch' && item.kind === workload.kind
  ) as Extract<AppPatchPropsType[number], { type: 'patch' }> | undefined;

  if (workloadPatch) {
    workloadPatch.value.spec = workloadPatch.value.spec || {};
    workloadPatch.value.spec.template = workloadPatch.value.spec.template || {};
    workloadPatch.value.spec.template.metadata = workloadPatch.value.spec.template.metadata || {};
    workloadPatch.value.spec.template.metadata.labels =
      workloadPatch.value.spec.template.metadata.labels || {};
    workloadPatch.value.spec.template.metadata.labels.restartTime = restartTime;
    workloadPatch.restartRequired = true;
    return;
  }

  actions.push({
    type: 'patch',
    kind: workload.kind,
    value: createRestartTimePatch(workload, restartTime),
    restartRequired: true
  });
};

/**
 * format pod createTime
 */
export const patchYamlList = ({
  parsedOldYamlList,
  parsedNewYamlList,
  originalYamlList
}: {
  parsedOldYamlList: string[];
  parsedNewYamlList: string[];
  originalYamlList: DeployKindsType[];
}) => {
  const oldFormJsonList = parsedOldYamlList
    .map((item) => yaml.loadAll(item))
    .flat() as DeployKindsType[];

  const newFormJsonList = parsedNewYamlList
    .map((item) => yaml.loadAll(item))
    .flat() as DeployKindsType[];

  const actions: AppPatchPropsType = [];
  let configMapDataChanged = false;
  let workloadTemplateChanged = false;

  // find delete
  oldFormJsonList.forEach((oldYamlJson) => {
    const item = newFormJsonList.find(
      (item) => item.kind === oldYamlJson.kind && item.metadata?.name === oldYamlJson.metadata?.name
    );
    if (!item && oldYamlJson.metadata?.name) {
      actions.push({
        type: 'delete',
        kind: oldYamlJson.kind as `${YamlKindEnum}`,
        name: oldYamlJson.metadata?.name
      });
    }
  });

  // find create and patch
  newFormJsonList.forEach((newYamlJson) => {
    const oldFormJson =
      newYamlJson.kind === 'ConfigMap'
        ? originalYamlList.find(
            (item) =>
              item.kind === newYamlJson.kind && item?.metadata?.name === newYamlJson?.metadata?.name
          )
        : oldFormJsonList.find(
            (item) =>
              item.kind === newYamlJson.kind && item?.metadata?.name === newYamlJson?.metadata?.name
          );

    if (oldFormJson) {
      const patchRes = jsonpatch.compare(oldFormJson, newYamlJson);

      if (patchRes.length === 0) return;

      if (
        oldFormJson.kind === YamlKindEnum.ConfigMap &&
        patchRes.some((item) => item.path === '/data' || item.path.startsWith('/data/'))
      ) {
        configMapDataChanged = true;
      }

      if (
        isWorkloadKind(oldFormJson.kind) &&
        patchRes.some(
          (item) => item.path === '/spec/template' || item.path.startsWith('/spec/template/')
        )
      ) {
        workloadTemplateChanged = true;
      }

      /* Generate a new json using the formPatchResult and the crJson */
      const actionsJson = (() => {
        try {
          /* find cr json */
          let crOldYamlJson = originalYamlList.find(
            (item) =>
              item.kind === oldFormJson?.kind &&
              item?.metadata?.name === oldFormJson?.metadata?.name
          );

          if (!crOldYamlJson) return newYamlJson;
          crOldYamlJson = JSON.parse(JSON.stringify(crOldYamlJson));

          if (!crOldYamlJson) return newYamlJson;

          /* Fill in volume - Handle Deployment/StatefulSet */
          if (
            oldFormJson.kind === YamlKindEnum.Deployment ||
            oldFormJson.kind === YamlKindEnum.StatefulSet
          ) {
            if (patchTouchesPath(patchRes, '/spec/template/spec/volumes')) {
              // @ts-ignore
              crOldYamlJson.spec.template.spec.volumes = JSON.parse(
                JSON.stringify((oldFormJson as any).spec.template.spec.volumes || [])
              );
            }
            if (patchTouchesPath(patchRes, '/spec/template/spec/containers/0/volumeMounts')) {
              // @ts-ignore
              crOldYamlJson.spec.template.spec.containers[0].volumeMounts =
                // @ts-ignore
                JSON.parse(
                  JSON.stringify((oldFormJson as any).spec.template.spec.containers[0].volumeMounts || [])
                );
            }
            if (patchTouchesPath(patchRes, '/spec/volumeClaimTemplates')) {
              // @ts-ignore
              crOldYamlJson.spec.volumeClaimTemplates = JSON.parse(
                JSON.stringify((oldFormJson as any).spec.volumeClaimTemplates || [])
              );
            }
          }

          /* generate new json */
          const _patchRes: jsonpatch.Operation[] = patchRes
            .map((item) => {
              let jsonPatchError = jsonpatch.validate([item], crOldYamlJson);
              if (jsonPatchError?.name === 'OPERATION_PATH_UNRESOLVABLE') {
                switch (item.op) {
                  case 'add':
                  case 'replace':
                    return {
                      ...item,
                      op: 'add' as const,
                      value: item.value ?? ''
                    };
                  default:
                    return null;
                }
              }
              return item;
            })
            .filter((op): op is jsonpatch.Operation => op !== null);

          const patchResYamlJson = jsonpatch.applyPatch(crOldYamlJson, _patchRes, true).newDocument;

          if (
            (oldFormJson.kind === YamlKindEnum.Deployment ||
              oldFormJson.kind === YamlKindEnum.StatefulSet) &&
            patchRes.some(
              (item) => item.op === 'remove' && item.path === '/spec/template/spec/imagePullSecrets'
            )
          ) {
            // JSON Merge Patch requires null to delete a field; omission preserves the old value.
            (patchResYamlJson as any).spec.template.spec.imagePullSecrets = null;
          }

          if (isWorkloadKind(oldFormJson.kind))
            preserveInitContainerVolumes(
              originalYamlList.find(
                (item) =>
                  item.kind === oldFormJson.kind &&
                  item.metadata?.name === oldFormJson.metadata?.name
              ),
              patchResYamlJson
            );

          // delete invalid field
          // @ts-ignore
          delete patchResYamlJson.status;
          patchResYamlJson.metadata = {
            name: patchResYamlJson.metadata?.name,
            namespace: patchResYamlJson.metadata?.namespace,
            labels: patchResYamlJson.metadata?.labels,
            annotations: patchResYamlJson.metadata?.annotations,
            ownerReferences: patchResYamlJson.metadata?.ownerReferences,
            finalizers: patchResYamlJson.metadata?.finalizers
          };

          return patchResYamlJson;
        } catch (error) {
          console.error('ACTIONS JSON ERROR:\n', error);
          return newYamlJson;
        }
      })();

      // adapt deployment,statefulset,service ports
      if (
        actionsJson.kind === YamlKindEnum.Deployment ||
        actionsJson.kind === YamlKindEnum.StatefulSet
      ) {
        const workloadJson = actionsJson as any;
        const ports = workloadJson?.spec.template.spec.containers[0].ports || [];
        if (
          ports.length > 0 &&
          patchTouchesPath(patchRes, '/spec/template/spec/containers/0/ports')
        ) {
          workloadJson.spec.template.spec.containers[0].ports = ensureUniquePortNames(ports);
        }
      }
      if (actionsJson.kind === YamlKindEnum.Service) {
        const serviceJson = actionsJson as any;
        const ports = serviceJson?.spec.ports || [];
        if (ports.length > 0 && patchTouchesPath(patchRes, '/spec/ports')) {
          serviceJson.spec.ports = ensureUniquePortNames(ports);
        }
      }

      const requiresStatefulSetRecreate =
        newYamlJson.kind === YamlKindEnum.StatefulSet &&
        patchTouchesPath(patchRes, '/spec/volumeClaimTemplates') &&
        (() => {
          const oldStatefulSet = oldFormJson as any;
          const newStatefulSet = newYamlJson as any;
          const oldTemplateNames = new Set(
            (oldStatefulSet.spec?.volumeClaimTemplates || []).map(
              (template: any) => template.metadata?.name
            )
          );
          const newTemplateNames = new Set(
            (newStatefulSet.spec?.volumeClaimTemplates || []).map(
              (template: any) => template.metadata?.name
            )
          );

          return (
            oldTemplateNames.size !== newTemplateNames.size ||
            [...oldTemplateNames].some((name) => !newTemplateNames.has(name))
          );
        })();

      if (requiresStatefulSetRecreate) {
        actions.push({
          type: 'patch',
          restartRequired: true,
          kind: 'StatefulSet',
          value: actionsJson as any
        });
      } else {
        actions.push({
          type: 'patch',
          kind: newYamlJson.kind as `${YamlKindEnum}`,
          value: actionsJson as any,
          restartRequired:
            isWorkloadKind(newYamlJson.kind) && patchTouchesPath(patchRes, '/spec/template')
        });
      }
    } else {
      actions.push({
        type: 'create',
        kind: newYamlJson.kind as `${YamlKindEnum}`,
        value: yaml.dump(newYamlJson)
      });
    }
  });

  if (configMapDataChanged && !workloadTemplateChanged) {
    ensureRestartTimePatch({ actions, originalYamlList, oldFormJsonList });
  }

  return actions;
};

/* request number limit */
export class RequestController {
  results: any[] = [];
  index = 0;
  runNum = 0;

  tasks: (() => any)[] = [];
  limit = 3;

  async executeTask(index: number): Promise<any> {
    const task = this.tasks[index];

    if (!task) return;
    this.index++;
    this.runNum++;
    try {
      const result = await task();
      this.results[index] = result;
    } catch (error) {
      this.results[index] = error;
    }
    this.runNum--;
    return this.executeTask(this.index);
  }

  stop() {
    this.index = this.tasks.length + 1;
    this.tasks = [];
    this.runNum = this.limit;
  }

  async runTasks({ tasks, limit }: { tasks: (() => any)[]; limit: number }) {
    this.tasks = tasks;
    this.limit = limit;
    this.index = 0;
    this.runNum = 0;

    const arr = new Array(limit).fill(0);
    await Promise.allSettled(arr.map((_, i) => this.executeTask(i)));

    return this.results;
  }
}

export const isElementInViewport = (element: Element) => {
  const rect = element.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;
  const windowWidth = window.innerWidth || document.documentElement.clientWidth;
  const vertInView = rect.top <= windowHeight && rect.top + rect.height >= 0;
  const horInView = rect.left <= windowWidth && rect.left + rect.width >= 0;
  return vertInView && horInView;
};

export const getErrText = (err: any, def = '') => {
  const msg: string = typeof err === 'string' ? err : err?.message || def || '';
  msg && console.log('error =>', msg);
  return msg;
};

export const generatePvcNameRegex = (appDetail?: AppDetailType): string => {
  if (!appDetail?.storeList?.length || !appDetail?.labels?.app) {
    return '';
  }
  const pvcPrefix = `(${appDetail.storeList.map((item) => item.name).join('|')})`;
  const appName = appDetail.appName;
  const pvcNameRegex = `${pvcPrefix}-${appName}-[0-9]+`;
  return pvcNameRegex;
};

export const getFallbackPortName = ({
  port,
  protocol,
  index
}: {
  port?: string | number;
  protocol?: string;
  index: number;
}) =>
  `p-${String(protocol || 'tcp').toLowerCase()[0] || 't'}-${str2Num(port) || 'unknown'}-${index}`;

const getUniquePortName = (name: string, usedNames: Set<string>) => {
  let index = 1;
  let nextName = name;

  while (usedNames.has(nextName)) {
    const suffix = `-${index}`;
    nextName = `${name.slice(0, Math.max(1, 15 - suffix.length)).replace(/-+$/, '')}${suffix}`;
    index += 1;
  }

  return nextName;
};

export const ensureUniquePortNames = <T extends { name?: string; port?: any; containerPort?: any }>(
  ports: T[] = []
) => {
  const usedNames = new Set<string>();

  return ports.map((port, index) => {
    const fallbackName = getFallbackPortName({
      port: port?.port ?? port?.containerPort,
      protocol: (port as T & { protocol?: string })?.protocol,
      index
    });
    const currentName = typeof port?.name === 'string' ? port.name.trim() : '';
    const uniqueName = getUniquePortName(
      !currentName || usedNames.has(currentName) ? fallbackName : currentName,
      usedNames
    );

    usedNames.add(uniqueName);

    return {
      ...port,
      name: uniqueName
    };
  });
};

const patchTouchesPath = (patches: jsonpatch.Operation[], targetPath: string) =>
  patches.some(
    ({ path }) =>
      path === targetPath || path.startsWith(`${targetPath}/`) || targetPath.startsWith(`${path}/`)
  );
