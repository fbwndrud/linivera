export const relationLabel = (kind) => ({
  input: 'Production input', output: 'Production output', revision: 'Revision history', contains: 'Included file',
  usage: 'Used in context', 'context-input': 'Provided context', 'context-evidence': 'Context evidence',
  'iteration-reference': 'Revision guidance', 'session-command': 'Recorded command', 'session-artifact': 'Observed media',
  'structure-source': 'Structure source', 'structure-reference': 'Linked structure file',
}[kind] ?? kind);
export const familyLabel = (family) => ({
  image: 'Image', audio: 'Audio', video: 'Video', model: '3D model', code: 'Code and build', workflow: 'Workflow',
  bundle: 'File bundle', context: 'Context', iteration: 'Revision guidance', session: 'Session record', alignment: 'Audio timing',
  text: 'Text', data: 'Structured data', file: 'File',
  structure: 'File structure',
}[family] ?? 'Resource');
