import { capabilityReleaseV1, accessReleaseV1 } from './catalog-release-v1.js';

// Append releases containing only new IDs. Keep all previous release hashes and catalog entries.
export const capabilityReleases = Object.freeze([capabilityReleaseV1]);
export const accessReleases = Object.freeze([accessReleaseV1]);
