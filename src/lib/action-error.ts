/** Throw inside an action handler to show `message` to the caller. Anything else is masked. Pure — safe to import anywhere. */
export class ActionError extends Error {}
