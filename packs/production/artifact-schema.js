import { FolioError } from '../../core/errors.js';
import { assertRevisionId } from '../../core/resources/schema.js';
const invalid = (message) => { throw new FolioError('OUTPUT_GROUP_INVALID', message); };
export function validateGroupManifest(value) {
  if (!value || value.version !== 1 || typeof value.groupId !== 'string' || !Array.isArray(value.members) || !value.members.length || value.members.length > 4096 || Object.keys(value).some((key) => !['version', 'groupId', 'members'].includes(key))) invalid('invalid output group manifest');
  const keys = new Set();
  for (const member of value.members) {
    if (!member || Object.keys(member).some((key) => !['artifactKey', 'role', 'revisionId'].includes(key)) || typeof member.artifactKey !== 'string' || !member.artifactKey.length || keys.has(member.artifactKey) || typeof member.role !== 'string' || !member.role.length) invalid('invalid output group member');
    assertRevisionId(member.revisionId); keys.add(member.artifactKey);
  }
  return value;
}
