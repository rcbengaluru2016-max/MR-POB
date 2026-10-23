const {execFileSync} = require('node:child_process');
const {resolve} = require('node:path');
execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '-p', 'test/e2e/tsconfig.json'], {stdio: 'inherit'});
require(resolve('.local/e2e/test/e2e/backend-harness.js'));
