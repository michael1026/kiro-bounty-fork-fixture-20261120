# PR test fixture

Run `npm ci --offline --no-audit --no-fund` and `npm test`.

The test performs a marker-only localhost ACP boundary check. It does not read credentials or contact an external service. It writes one synthetic marker in the outer session and one in the project workspace so the test can confirm whether the command sandbox and outer session differ.
