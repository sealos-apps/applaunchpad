import { authSession } from '@/services/backend/auth';
import { getK8s } from '@/services/backend/kubernetes';
import { handleK8sError, jsonRes } from '@/services/backend/response';
import {
  parseK8sQuantityOrZero,
  quantityToPublicCpuCores,
  quantityToStorageGi
} from '@/utils/resourceQuantity';
import type { NextApiRequest, NextApiResponse } from 'next';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { k8sCore, namespace } = await getK8s({ kubeconfig: await authSession(req.headers) });
    const {
      body: { status }
    } = await k8sCore.readNamespacedResourceQuota(`quota-${namespace}`, namespace);
    const fields = [
      ['cpu', 'limits.cpu'],
      ['memory', 'limits.memory'],
      ['storage', 'requests.storage'],
      ['ephemeral-storage', 'limits.ephemeral-storage'],
      ['nodeports', 'services.nodeports'],
      ['gpu', 'requests.nvidia.com/gpu']
    ];
    const quota = fields.map(([type, key]) => {
      const convert = (raw = '0') =>
        type === 'cpu'
          ? quantityToPublicCpuCores(parseK8sQuantityOrZero(raw))
          : ['memory', 'storage', 'ephemeral-storage'].includes(type)
          ? quantityToStorageGi(parseK8sQuantityOrZero(raw))
          : Number(raw);
      return { type, used: convert(status?.used?.[key]), limit: convert(status?.hard?.[key]) };
    });
    return jsonRes(res, { data: { quota } });
  } catch (error) {
    return jsonRes(res, handleK8sError(error));
  }
}
