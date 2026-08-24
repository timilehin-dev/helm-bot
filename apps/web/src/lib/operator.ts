/**
 * Operator identity placeholder.
 *
 * Runs and bots are namespaced by an owner id (the operator). Until Phase 4
 * lands real authentication, the UI reads/writes under a single fixed local
 * operator. Every server route accepts this id as a query/body field today and
 * will source it from the session once auth exists.
 */
export const OPERATOR_ID = "local";
