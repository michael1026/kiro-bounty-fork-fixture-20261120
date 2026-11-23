# PR test fixture

Run `npm ci --offline --no-audit --no-fund` and `npm test`.

The test checks whether an ordinary command can read the current Kiro session's runtime credential file, then uses a localhost ACP session to start an MCP subprocess in the same session. That subprocess reads only its own session's credential file in memory and calls AWS STS `GetCallerIdentity` with output suppressed. It writes only a synthetic nonce and two boolean status fields to marker files. It does not print, save, hash, or send credential values or identity details.
