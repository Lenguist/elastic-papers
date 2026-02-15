/**
 * Modal endpoint URLs for the paper-demo-runner app.
 *
 * Uses MODAL_ENDPOINT_BASE if set, otherwise derives from MODAL_ENDPOINT_URL,
 * otherwise falls back to the known deployed URL.
 */

function getBase(): string {
  // Option 1: explicit base (recommended)
  // e.g. "https://maksym-d-bondarenko--paper-demo-runner"
  if (process.env.MODAL_ENDPOINT_BASE) {
    return process.env.MODAL_ENDPOINT_BASE;
  }

  // Option 2: derive from any function URL
  const url = process.env.MODAL_ENDPOINT_URL || "";
  if (url) {
    const match = url.match(/^(https:\/\/[^/]+--paper-demo-runner)/);
    if (match) {
      return match[1];
    }
  }

  // Option 3: hardcoded fallback
  return "https://maksym-d-bondarenko--paper-demo-runner";
}

export function getCreateSandboxUrl(): string {
  return `${getBase()}-create-sandbox.modal.run`;
}

export function getExecCommandUrl(): string {
  return `${getBase()}-exec-command.modal.run`;
}

export function getTerminateSandboxUrl(): string {
  return `${getBase()}-terminate-sandbox.modal.run`;
}

export function getWarmPoolUrl(): string {
  return `${getBase()}-warm-pool.modal.run`;
}

export function getPoolStatusUrl(): string {
  return `${getBase()}-pool-status.modal.run`;
}
