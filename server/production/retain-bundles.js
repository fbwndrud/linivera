import { FolioError } from '../../core/errors.js';
import { validateBundleManifest } from '../../core/resources/bundles.js';

/** Only actual retained files from this candidate can become manifest members. */
export async function retainProductionBundles({ json, bundles = [], artifacts, priorArtifacts = [] }) {
  if (!Array.isArray(bundles)) throw new FolioError('PRODUCTION_CAPTURE_INVALID', 'bundle capture list required');
  const retained = []; const observations = []; const keys = new Set(artifacts.map((file) => file.artifactKey));
  for (const bundle of bundles) {
    if (typeof bundle.artifactKey !== 'string' || !bundle.artifactKey || keys.has(bundle.artifactKey) || !Array.isArray(bundle.members)) throw new FolioError('PRODUCTION_CAPTURE_INVALID', 'unique bundle key and members required');
    keys.add(bundle.artifactKey);
    const memberKeys = new Set();
    const members = bundle.members.map((member) => {
      const file = [...artifacts, ...priorArtifacts].find((item) => item.groupId === bundle.groupId && item.artifactKey === member.artifactKey);
      if (!file || file.role !== member.role || memberKeys.has(member.artifactKey)) throw new FolioError('PRODUCTION_CAPTURE_INVALID', 'bundle member must name one retained file from the same group and role');
      memberKeys.add(member.artifactKey);
      return { resourceId: file.resourceId, revisionId: file.revisionId, relativePath: member.relativePath, role: member.role, required: member.required };
    });
    const value = validateBundleManifest({ version: 1, bundleType: bundle.bundleType, members,
      unavailable: bundle.unavailable ?? [], dependencyCoverage: bundle.dependencyCoverage ?? 'unknown', restorability: bundle.restorability ?? 'unknown' });
    const revision = await json(bundle.resourceId, value, 'artifact-bundle');
    if (value.completeness === 'incomplete') observations.push({ artifactKey: bundle.artifactKey, groupId: bundle.groupId,
      resourceId: revision.resourceId, revisionId: revision.revisionId, completeness: value.completeness });
    else retained.push({ artifactKey: bundle.artifactKey, groupId: bundle.groupId, role: bundle.role, ...revision });
  }
  return { artifacts: retained, observations };
}
