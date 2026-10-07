import assert from 'node:assert/strict';
import { isSignupEnabled } from './env.js';

assert.equal(isSignupEnabled({ NODE_ENV: 'development' }), false);
assert.equal(isSignupEnabled({ NODE_ENV: ' Development ' }), false);
assert.equal(isSignupEnabled({ NODE_ENV: 'production' }), true);
assert.equal(isSignupEnabled({}), true);

// explicit override wins over NODE_ENV
assert.equal(isSignupEnabled({ NODE_ENV: 'development', SIGNUP_ENABLED: 'true' }), true);
assert.equal(isSignupEnabled({ NODE_ENV: 'production', SIGNUP_ENABLED: 'false' }), false);
// unrecognized override values fall back to NODE_ENV
assert.equal(isSignupEnabled({ NODE_ENV: 'development', SIGNUP_ENABLED: 'yes' }), false);

console.log('env.test.ts: ok');
