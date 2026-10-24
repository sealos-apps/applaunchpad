import { shareStorageKey } from '@/constants/app';
import { PatchUtils } from '@kubernetes/client-node';
import type {
  AppsV1Api,
  CoreV1Api,
  V1PersistentVolumeClaim,
  V1StatefulSet
} from '@kubernetes/client-node';

/** Only claim-template PVCs belong to an app; explicit references remain independently owned. */
export function ownedClaimNames(app: V1StatefulSet, claims: V1PersistentVolumeClaim[]): string[] {
  const name = app.metadata?.name;
  if (!name) return [];
  const references = new Set(
    (app.spec?.template.spec?.volumes || []).map((v) => v.persistentVolumeClaim?.claimName)
  );
  const prefixes = (app.spec?.volumeClaimTemplates || []).map(
    (v) => `${v.metadata?.name}-${name}-`
  );
  return claims.flatMap((claim) => {
    const claimName = claim.metadata?.name;
    if (
      !claimName ||
      references.has(claimName) ||
      claim.metadata?.labels?.[shareStorageKey] === 'true'
    )
      return [];
    return prefixes.some(
      (prefix) => claimName.startsWith(prefix) && /^\d+$/.test(claimName.slice(prefix.length))
    )
      ? [claimName]
      : [];
  });
}

export async function deleteOwnedClaims(
  name: string,
  namespace: string,
  apps: AppsV1Api,
  core: CoreV1Api
) {
  const readOptional = async <T>(read: () => Promise<{ body: T }>): Promise<T | undefined> => {
    try { return (await read()).body; }
    catch (error: any) {
      if ((error.body?.code || error.response?.statusCode) === 404) return undefined;
      throw error;
    }
  };
  const workload = await readOptional(() => apps.readNamespacedStatefulSet(name, namespace));
  const deployment = await readOptional(() => apps.readNamespacedDeployment(name, namespace));
  const controllerUids = new Set([workload?.metadata?.uid, deployment?.metadata?.uid].filter(Boolean));
  const claims = (await core.listNamespacedPersistentVolumeClaim(namespace)).body.items;
  const owned = new Set(workload ? ownedClaimNames(workload, claims) : []);
  // Older release images attached shared PVCs to application controllers. Detach those
  // references first, otherwise deleting the controller would garbage-collect shared data.
  for (const claim of claims) {
    const claimName = claim.metadata?.name;
    const refs = claim.metadata?.ownerReferences || [];
    if (!claimName || owned.has(claimName) || !refs.some(ref => controllerUids.has(ref.uid))) continue;
    await core.patchNamespacedPersistentVolumeClaim(claimName, namespace, { metadata: {
      resourceVersion: claim.metadata?.resourceVersion,
      ownerReferences: refs.filter(ref => !controllerUids.has(ref.uid))
    } }, undefined, undefined, undefined, undefined, undefined,
    { headers: { 'Content-type': PatchUtils.PATCH_FORMAT_JSON_MERGE_PATCH } });
  }
  for (const claim of owned) await core.deleteNamespacedPersistentVolumeClaim(claim, namespace);
}
