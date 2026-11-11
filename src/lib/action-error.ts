/** Throw inside an action handler to show `message` to the caller. Anything else is masked. Pure - safe to import anywhere. */
export class ActionError extends Error {}

/** An ActionError that is also an authorization failure: shown to the caller and recorded as a security event. */
export class ForbiddenError extends ActionError {}
