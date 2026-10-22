import { builtInFileRoles, comfyApi, comfyUi } from './comfy.js';
import { dependencyManifest } from './dependency-manifest.js';
import { extendProjection } from './extend.js';
import { invalid, object, pointer } from './common.js';

export function comfyDependencies(value, { format, declaration }) {
  const api = format === 'comfy-api'; const p = extendProjection(api ? comfyApi(value) : comfyUi(value));
  const contracts = declaration === undefined ? new Map() : dependencyManifest(declaration);
  const rows = api ? Object.entries(value).map(([id, node]) => ({ id: '/' + pointer(id), node, classType: node.class_type }))
    : value.nodes.map((node, i) => ({ id: `/nodes/${i}`, node, classType: node.type }));
  for (const { id, node, classType } of rows) {
    const contract = contracts.get(classType); const properties = api ? null : node.properties;
    const builtins = builtInFileRoles(classType);
    function wired(input) {
      const index = Array.isArray(node.inputs) ? node.inputs.findIndex((slot) => slot?.name === input) : -1;
      return index >= 0 && p.value.links.some((link) => link.target === id && link.inputIndex === index);
    }
    let nativePackage;
    if (object(properties) && properties.cnr_id !== undefined) {
      if (typeof properties.cnr_id !== 'string' || !properties.cnr_id || properties.cnr_id.length > 512 || (properties.ver != null && (typeof properties.ver !== 'string' || properties.ver.length > 512))) invalid('UI package observation requires bounded cnr_id and optional ver');
      nativePackage = { id: properties.cnr_id, version: properties.ver || null };
      if (!nativePackage.version) p.unknown(`UI package version is unreported: ${id}`);
    }
    if (nativePackage && contract && (nativePackage.id !== contract.package.id || (nativePackage.version !== null && nativePackage.version !== contract.package.version))) invalid('declared package differs from retained UI package/version');
    const packageInfo = contract?.package ?? nativePackage;
    if (packageInfo) {
      const packageId = id + '/@package'; p.unit(packageId, 'node-package', { package: packageInfo });
      p.link(id, packageId, 'node-package'); p.ref(packageId, packageId, 'node-package', `${packageInfo.id}@${packageInfo.version ?? 'unreported'}`);
    }
    for (const file of contract?.files ?? []) {
      if (Object.hasOwn(builtins, file.input) && builtins[file.input] !== file.role) invalid('dependency contract cannot override a built-in file role');
      let key; let hint;
      if (api) {
        const input = node.inputs[file.input];
        if (Array.isArray(input)) {
          if (p.value.links.some((link) => link.locator === `${id}/inputs/${pointer(file.input)}`)) continue;
          invalid('declared file slot is neither a static file nor a graph link');
        }
        key = `${id}/inputs/${pointer(file.input)}`; hint = input;
      } else {
        if (wired(file.input)) continue;
        if (file.widgetIndex === undefined || !Array.isArray(node.widgets_values) || file.widgetIndex >= node.widgets_values.length) invalid('UI file dependency requires an explicit existing widget index');
        key = `${id}/widgets_values/${file.widgetIndex}`; hint = node.widgets_values[file.widgetIndex];
      }
      const existing = p.value.references.find((ref) => ref.key === key);
      if (existing) { if (existing.role !== file.role || existing.hint !== hint) invalid('dependency contract cannot override a built-in file role'); }
      else p.ref(key, id, file.role, hint);
    }
    if (!api) for (const [input, role] of Object.entries(builtins)) {
      if (contract?.files.some((file) => file.input === input) || wired(input)) continue;
      p.ref(`${id}/@file/${pointer(input)}`, id, role, `Unmapped ${classType}.${input}`);
      p.unknown(`Unmapped UI file requires explicit binding or widget declaration: ${id}/${input}`);
    }
  }
  p.unknown('Package metadata and file declarations pin observations only; custom code, implicit runtime dependencies and installation compatibility are not executed or inferred.');
  return p.finish();
}
