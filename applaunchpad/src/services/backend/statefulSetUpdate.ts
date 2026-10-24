import { parseK8sQuantityOrZero } from '@/utils/resourceQuantity';
import { PatchUtils, type AppsV1Api, type V1StatefulSet } from '@kubernetes/client-node';

/** Validate first; only immutable-field errors may require orphaning the controller. */
export async function updateStatefulSet(
  apps: AppsV1Api,
  namespace: string,
  desired: V1StatefulSet
) {
  const name = desired.metadata!.name!;
  const original = (await apps.readNamespacedStatefulSet(name, namespace)).body;
  for (const claim of desired.spec?.volumeClaimTemplates || []) {
    const old = original.spec?.volumeClaimTemplates?.find(
      (item) => item.metadata?.name === claim.metadata?.name
    );
    if (
      old &&
      parseK8sQuantityOrZero(claim.spec?.resources?.requests?.storage).cmp(
        parseK8sQuantityOrZero(old.spec?.resources?.requests?.storage)
      ) < 0
    )
      throw new Error(`Cannot shrink PVC template ${claim.metadata?.name}`);
  }
  const body = {
    ...desired,
    metadata: { ...desired.metadata, resourceVersion: original.metadata?.resourceVersion }
  };
  try {
    await apps.patchNamespacedStatefulSet(
      name,
      namespace,
      body,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { headers: { 'Content-type': PatchUtils.PATCH_FORMAT_JSON_MERGE_PATCH } }
    );
    return;
  } catch (error: any) {
    const code = error.body?.code || error.response?.statusCode;
    const message = error.body?.message || '';
    if (code !== 422 || !message.includes('Forbidden: updates to statefulset spec')) throw error;
  }
  const clean = (value: V1StatefulSet): V1StatefulSet => {
    const copy = JSON.parse(JSON.stringify(value));
    for (const key of [
      'resourceVersion',
      'uid',
      'creationTimestamp',
      'managedFields',
      'generation',
      'deletionTimestamp'
    ])
      delete copy.metadata[key];
    delete copy.status;
    return copy;
  };
  // A temporary dry-run name validates quota/admission/schema before the real controller is removed.
  const replacement = clean(body);
  await apps.createNamespacedStatefulSet(
    namespace,
    {
      ...replacement,
      metadata: {
        ...replacement.metadata,
        name: `${name.slice(0, 40)}-validate-${Date.now().toString(36)}`
      }
    },
    undefined,
    'All'
  );
  await apps.deleteNamespacedStatefulSet(
    name,
    namespace,
    undefined,
    undefined,
    undefined,
    undefined,
    'Orphan',
    {
      preconditions: {
        uid: original.metadata?.uid,
        resourceVersion: original.metadata?.resourceVersion
      }
    }
  );
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await apps.readNamespacedStatefulSet(name, namespace);
    } catch (error: any) {
      if ((error.body?.code || error.response?.statusCode) !== 404) throw error;
      try {
        await apps.createNamespacedStatefulSet(namespace, replacement);
      } catch (createError) {
        // Restore the controller if admission fails between dry-run and creation; PVCs/pods remain orphaned.
        await apps.createNamespacedStatefulSet(namespace, clean(original));
        throw createError;
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting to replace StatefulSet ${name}; retained pods and PVCs`);
}
