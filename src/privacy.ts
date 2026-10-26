/** This product has no network writes. Enforce this before initializing third-party ML.
 * MediaPipe 1.1.1 includes usage telemetry without an opt-out; do not let it leave
 * either the page or worker. No request body, frame or landmark is inspected/logged. */
export function localAssetRequest(url: string, method: string, origin: string, scope: string) {
  try {
    const target = new URL(url, origin);
    return (
      method.toUpperCase() === 'GET' &&
      target.origin === origin &&
      target.pathname.startsWith(scope)
    );
  } catch {
    return false;
  }
}
export function enforceLocalNetwork(scope: string) {
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    if (!localAssetRequest(url, method, location.origin, scope))
      return Promise.reject(new TypeError('Only local static assets are permitted.'));
    return originalFetch(input, init);
  };
  if (typeof XMLHttpRequest !== 'undefined') {
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      async: boolean = true,
      username?: string | null,
      password?: string | null,
    ) {
      if (!localAssetRequest(String(url), method, location.origin, scope))
        throw new TypeError('Only local static assets are permitted.');
      return originalOpen.call(this, method, url, async, username, password);
    };
  }
  if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator)
    navigator.sendBeacon = () => false;
}
