/**
 * Derive Modal endpoint URLs from the base MODAL_ENDPOINT_URL env var.
 *
 * MODAL_ENDPOINT_URL should be any one of the deployed function URLs, e.g.:
 *   https://user--paper-demo-runner-create-sandbox.modal.run
 *   https://user--paper-demo-runner-deploy-demo.modal.run
 *
 * We extract the base (everything before the last function name) and build
 * all three sandbox endpoint URLs from it.
 */

function getBase(): string {
  const url = process.env.MODAL_ENDPOINT_URL || "";
  // Pattern: https://USER--APP-NAME-FUNCTION-NAME.modal.run
  // We need: https://USER--APP-NAME-
  const match = url.match(/^(https:\/\/[^/]+--)([^.]+)(\.modal\.run.*)$/);
  if (match) {
    // match[1] = "https://user--"
    // match[2] = "paper-demo-runner-FUNCTION"  
    // match[3] = ".modal.run..."
    const prefix = match[1];
    const middle = match[2];
    const suffix = match[3];
    // Remove the function name from middle (last segment after app name)
    // App name is "paper-demo-runner", function names are "create-sandbox", "exec-command", etc.
    // The app name part has the format: APP-NAME-FUNCTION-NAME
    // We need to find where the app name ends and function name begins
    // Since we know our app is "paper-demo-runner", let's use that
    const appName = "paper-demo-runner";
    const appIdx = middle.indexOf(appName);
    if (appIdx >= 0) {
      const baseMiddle = middle.slice(0, appIdx + appName.length);
      return `${prefix}${baseMiddle}`;
    }
    return `${prefix}${middle}`;
  }
  // Fallback: try simple replacement
  return url;
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
