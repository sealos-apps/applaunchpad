import type { AppsV1Api, CoreV1Api } from '@kubernetes/client-node';

/** Detach non-Pod dependents before removing an old controller during a kind conversion. */
export async function removeConvertedController(
  apps: AppsV1Api,
  core: CoreV1Api,
  namespace: string,
  name: string,
  kind: 'Deployment' | 'StatefulSet'
) {
  const read = () =>
    kind === 'Deployment'
      ? apps.readNamespacedDeployment(name, namespace)
      : apps.readNamespacedStatefulSet(name, namespace);
  const original = (await read()).body;
  const uid = original.metadata?.uid;
  const dependents =
    kind === 'Deployment'
      ? (await apps.listNamespacedReplicaSet(namespace)).body.items
      : (await core.listNamespacedPod(namespace)).body.items;
  const owned = dependents.filter((item) =>
    item.metadata?.ownerReferences?.some((owner) => owner.uid === uid)
  );
  if (kind === 'Deployment')
    await apps.deleteNamespacedDeployment(
      name,
      namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      'Orphan',
      { preconditions: { uid } }
    );
  else
    await apps.deleteNamespacedStatefulSet(
      name,
      namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      'Orphan',
      { preconditions: { uid } }
    );
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await read();
    } catch (error: any) {
      if ((error.body?.code || error.response?.statusCode) !== 404) throw error;
      for (const item of owned) {
        if (kind === 'Deployment')
          await apps.deleteNamespacedReplicaSet(
            item.metadata!.name!,
            namespace,
            undefined,
            undefined,
            undefined,
            undefined,
            'Foreground',
            { preconditions: { uid: item.metadata?.uid } }
          );
        else
          await core.deleteNamespacedPod(
            item.metadata!.name!,
            namespace,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            { preconditions: { uid: item.metadata?.uid } }
          );
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out detaching ${kind} ${name}; dependent resources retained`);
}

export async function convertDeploymentToStatefulSet(k8s: any, desired: any) {
  const { k8sApp, k8sCore, k8sAutoscaling, namespace } = k8s;
  const name = desired.metadata.name;
  for (const key of ['uid', 'resourceVersion', 'creationTimestamp', 'generation', 'managedFields'])
    delete desired.metadata[key];
  delete desired.status;
  // Both kinds may coexist briefly; validate and create before touching the old workload.
  await k8sApp.createNamespacedStatefulSet(namespace, desired, undefined, 'All');
  await k8sApp.createNamespacedStatefulSet(namespace, desired);
  try {
    const hpa = (await k8sAutoscaling.readNamespacedHorizontalPodAutoscaler(name, namespace)).body;
    hpa.spec.scaleTargetRef.kind = 'StatefulSet';
    await k8sAutoscaling.replaceNamespacedHorizontalPodAutoscaler(name, namespace, hpa);
  } catch (error: any) {
    if ((error.body?.code || error.response?.statusCode) !== 404) {
      await k8sApp.deleteNamespacedStatefulSet(
        name,
        namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        'Orphan'
      );
      throw error;
    }
  }
  await removeConvertedController(k8sApp, k8sCore, namespace, name, 'Deployment');
}
