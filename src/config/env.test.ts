import assert from 'node:assert/strict';
import { isProduction, isSignupEnabled } from './env.js';

assert.equal(isSignupEnabled({ NODE_ENV: 'development' }), false);
assert.equal(isSignupEnabled({ NODE_ENV: ' Development ' }), false);
assert.equal(isSignupEnabled({ NODE_ENV: 'production' }), true);
assert.equal(isSignupEnabled({}), true);

// explicit override wins over NODE_ENV
assert.equal(isSignupEnabled({ NODE_ENV: 'development', SIGNUP_ENABLED: 'true' }), true);
assert.equal(isSignupEnabled({ NODE_ENV: 'production', SIGNUP_ENABLED: 'false' }), false);
// unrecognized override values fall back to NODE_ENV
assert.equal(isSignupEnabled({ NODE_ENV: 'development', SIGNUP_ENABLED: 'yes' }), false);

assert.equal(isProduction({ NODE_ENV: 'production' }), true);
assert.equal(isProduction({ NODE_ENV: ' Production ' }), true);
assert.equal(isProduction({ NODE_ENV: 'development' }), false);
assert.equal(isProduction({}), false);

console.log('env.test.ts: ok');
