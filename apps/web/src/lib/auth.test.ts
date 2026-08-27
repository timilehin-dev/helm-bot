import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { OPERATOR_ID } from "./operator";
import {
  LOCAL_OPERATOR_ID,
  createSessionToken,
  verifySessionToken,
  createOAuthState,
  verifyOAuthState,
  resolveOwner,
} from "./auth";

/**
 * Phase 4 hardening — auth.ts unit tests.
 *
 * Exercises the sign/verify core (HMAC-SHA256 "sign, don't encrypt") without a
 * live NextRequest: session round-trip, tamper rejection, expiry, OAuth state
 * nonce round-trip, and the resolveOwner precedence rules (session > required
 * refusal > local fallback). These read SESSION_SECRET from the environment and
 * restore it around each case so individual tests are isolated from one another.
 */

const SECRET = "unit-test-session-secret";

function withSecret<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.SESSION_SECRET;
  if (value === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prev;
  }
}

/**
 * Re-implementation of the HMAC signing used by auth.ts, so expiry/missing-field
 * tests can forge a validly-signed token with a mutated payload without exposing
 * the (private) sign helper. Kept in sync with `sign()` in lib/auth.ts.
 */
function forgeToken(payload: unknown): string {
  const body = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const sig = createHmac("sha256", Buffer.from(SECRET, "utf-8")).update(body).digest("hex");
  return `${body}.${sig}`;
}

describe("auth session sign/verify", () => {
  it("round-trips a session token to the same user", () => {
    withSecret(SECRET, () => {
      const user = { id: "gh_123", login: "ada", name: "Ada Lovelace" };
      const token = createSessionToken(user);
      assert.ok(token, "expected a signed token when SESSION_SECRET is set");
      const back = verifySessionToken(token as string);
      assert.deepEqual(back, user);
    });
  });

  it("returns null for createSessionToken when SESSION_SECRET is unset", () => {
    withSecret(undefined, () => {
      assert.equal(createSessionToken({ id: "gh_1", login: "x" }), null);
    });
  });

  it("returns null for verifySessionToken when SESSION_SECRET is unset", () => {
    withSecret(undefined, () => {
      assert.equal(verifySessionToken("anything.payload"), null);
    });
  });

  it("rejects a token signed with a different secret", () => {
    const token = withSecret(SECRET, () =>
      createSessionToken({ id: "gh_1", login: "x" }),
    );
    withSecret("a-different-secret", () => {
      assert.equal(verifySessionToken(token as string), null);
    });
  });

  it("rejects a tampered token", () => {
    withSecret(SECRET, () => {
      const token = createSessionToken({ id: "gh_1", login: "x" }) as string;
      const sig = token.split(".")[1];
      const tamperedBody = Buffer.from(
        JSON.stringify({ id: "gh_999", login: "mallory", exp: 4102444800 }),
        "utf-8",
      ).toString("base64url");
      assert.equal(verifySessionToken(`${tamperedBody}.${sig}`), null);
    });
  });

  it("rejects a token with a past expiry", () => {
    withSecret(SECRET, () => {
      const token = createSessionToken({ id: "gh_1", login: "x" }) as string;
      const body = token.split(".")[0];
      const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
      payload.exp = 1;
      assert.equal(verifySessionToken(forgeToken(payload)), null);
    });
  });

  it("rejects a token with a missing login field", () => {
    withSecret(SECRET, () => {
      const token = forgeToken({ id: "gh_1", exp: 4102444800 });
      assert.equal(verifySessionToken(token), null);
    });
  });
});

describe("auth OAuth state nonce", () => {
  it("round-trips a state token to the same nonce", () => {
    withSecret(SECRET, () => {
      const state = createOAuthState();
      assert.ok(state, "expected a signed state when SESSION_SECRET is set");
      const nonce = verifyOAuthState(state as string);
      assert.ok(nonce, "expected a nonce back");
      assert.equal(nonce?.length, 64); // 32 random bytes hex-encoded
    });
  });

  it("returns null when SESSION_SECRET is unset", () => {
    withSecret(undefined, () => {
      assert.equal(createOAuthState(), null);
      assert.equal(verifyOAuthState("anything"), null);
    });
  });
});

describe("auth resolveOwner precedence", () => {
  const user = { id: "gh_42", login: "ada" };

  it("prefers a verified session over any hint", () => {
    assert.deepEqual(resolveOwner(user, true, "hint-owner"), {
      ok: true,
      userId: "gh_42",
    });
  });

  it("refuses when auth is required and no session is present", () => {
    assert.deepEqual(resolveOwner(null, true, "hint-owner"), {
      ok: false,
      error: "Authentication required",
      status: 401,
    });
  });

  it("falls back to the hint in local (non-required) mode", () => {
    assert.deepEqual(resolveOwner(null, false, "some-owner"), {
      ok: true,
      userId: "some-owner",
    });
  });

  it("falls back to the local operator id when no hint is given", () => {
    assert.deepEqual(resolveOwner(null, false), {
      ok: true,
      userId: LOCAL_OPERATOR_ID,
    });
    assert.equal(LOCAL_OPERATOR_ID, OPERATOR_ID);
  });

  it("trims whitespace from the hint", () => {
    assert.deepEqual(resolveOwner(null, false, "  owner  "), {
      ok: true,
      userId: "owner",
    });
  });
});
