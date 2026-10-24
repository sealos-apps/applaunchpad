import { ensureResourcePublicDomainsAvailable } from '@/services/backend/publicDomain';
import type { NextApiRequest, NextApiResponse } from 'next';
import { ApiResp } from '@/services/kubernet';
import { authSession } from '@/services/backend/auth';
import { getK8s } from '@/services/backend/kubernetes';
import { handleK8sError, jsonRes } from '@/services/backend/response';
import yaml from 'js-yaml';
import {
  getInvalidGeneratedAppNameMessage,
  getInvalidRfc1035ServiceNameMessage
} from '@/utils/appNameValidation';
import { ResponseCode } from '@/types/response';

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResp>) {
  const { yamlList, mode = 'create' }: { yamlList: string[]; mode?: 'create' | 'replace' } =
    req.body;
  if (!yamlList) {
    jsonRes(res, {
      code: 500,
      error: 'params error'
    });
    return;
  }
  try {
    const allResources = yamlList.flatMap((yamlStr) =>
      yaml.loadAll(yamlStr).filter((item) => item)
    );
    const mainWorkload = allResources.find(
      (resource: any) => resource.kind === 'Deployment' || resource.kind === 'StatefulSet'
    ) as any;

    const invalidAppNameMessage = mainWorkload
      ? getInvalidGeneratedAppNameMessage(mainWorkload.metadata?.name)
      : undefined;
    if (mode === 'create' && invalidAppNameMessage) {
      jsonRes(res, {
        code: ResponseCode.BAD_REQUEST,
        message: invalidAppNameMessage
      });
      return;
    }

    const invalidServiceNameMessage = getInvalidRfc1035ServiceNameMessage(allResources as any[]);
    if (invalidServiceNameMessage) {
      jsonRes(res, {
        code: ResponseCode.BAD_REQUEST,
        message: invalidServiceNameMessage
      });
      return;
    }

    const k8s = await getK8s({
      kubeconfig: await authSession(req.headers)
    });

    if (mode === 'create' && mainWorkload) {
      const exists = await Promise.all(
        [
          k8s.k8sApp.readNamespacedDeployment(mainWorkload.metadata.name, k8s.namespace),
          k8s.k8sApp.readNamespacedStatefulSet(mainWorkload.metadata.name, k8s.namespace)
        ].map((request) =>
          request
            .then(() => true)
            .catch((error) => {
              if ((error.body?.code || error.response?.statusCode) === 404) return false;
              throw error;
            })
        )
      );
      if (exists.some(Boolean)) return jsonRes(res, { code: ResponseCode.APP_ALREADY_EXISTS });
    }
    await ensureResourcePublicDomainsAvailable(allResources, k8s);
    const applyRes = await k8s.applyYamlList(yamlList, mode);

    jsonRes(res, { data: applyRes.map((item) => item.kind) });
  } catch (err: any) {
    console.log(err);
    jsonRes(res, handleK8sError(err));
  }
}
