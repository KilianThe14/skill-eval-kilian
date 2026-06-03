# Safety And Isolation

- Each scenario runs in an isolated workspace copy.
- Source projects are not modified by default.
- Verifier commands must come from benchmark config.
- Verifier commands should set `cwd` and `timeoutMs`.
- Failed runs preserve workspace and logs when configured.
- Reports redact likely secrets and avoid publishing raw sensitive logs.
- The tested agent does not own final scoring.
- Runner adapters collect evidence; core scores evidence.
