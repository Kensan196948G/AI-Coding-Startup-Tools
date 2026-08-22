import { assertPathInWorkspace, validateWorkspaceSelection } from "../validation/workspace-validator.mjs";

export class WorkspaceSession {
  #selection;

  constructor(options) {
    this.#selection = validateWorkspaceSelection(options);
    Object.freeze(this);
  }

  get workspace() {
    return this.#selection.workspace;
  }

  get storageType() {
    return this.#selection.storageType;
  }

  authorize(target, operation = "read") {
    return assertPathInWorkspace(this.#selection, target, { operation });
  }
}
