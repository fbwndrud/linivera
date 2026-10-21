function isSecretKey(key) {
  const normalized = key.toLowerCase().replace(/[-_]/g, '');
  return /^(authorization|proxyauthorization|(?:xi|x)?apikey|(?:set)?cookie|token|signature|audiobase64)$/.test(normalized)
    || /(secret|password|credential)/.test(normalized)
    || /^(?:access|refresh|id|auth|authentication|session|security|xamzsecurity)token$/.test(normalized)
    || /^(?:aws|amazon|xamz)?accesskey(?:id)?$/.test(normalized);
}

export function nativeRecord(stage, value) {
  const omittedPaths = [];
  function visit(item, path) {
    if (Array.isArray(item)) return item.map((value, index) => visit(value, `${path}[${index}]`));
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, value]) => {
      const next = path ? `${path}.${key}` : key;
      if (isSecretKey(key)) { omittedPaths.push(next); return [key, '[redacted]']; }
      return [key, visit(value, next)];
    }));
    if (typeof item !== 'string') return item;
    return item.replace(/https?:\/\/[^\s"<>]+/g, (raw) => {
      try {
        const url = new URL(raw);
        if (url.search || url.hash || url.username || url.password) {
          omittedPaths.push(path);
          url.search = ''; url.hash = ''; url.username = ''; url.password = '';
        }
        return url.href;
      } catch { return '[invalid-url]'; }
    }).replace(/\b(?:Bearer|Basic|Key)\s+[A-Za-z0-9._~+/=-]+/g, () => {
      omittedPaths.push(path); return '[redacted-credential]';
    });
  }
  return { stage, record: visit(value, ''), omittedPaths: [...new Set(omittedPaths)] };
}
