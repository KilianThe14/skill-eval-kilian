# Aily Full Capability Interface

Aily runner is designed for full capability access, not a minimum-only loop.

Required interface surface:

- `createSession`
- `configureEnvironment`
- `installSkill`
- `listAvailableTools`
- `configureTools`
- `listAvailableSkills`
- `configureSkills`
- `listMcpServers`
- `configureMcpServers`
- `uploadWorkspace`
- `snapshotWorkspace`
- `runTask`
- `sendFollowUp`
- `getTaskStatus`
- `getFinalAnswer`
- `listMessages`
- `listToolCalls`
- `listMcpCalls`
- `listPermissionEvents`
- `listContextEvents`
- `listArtifacts`
- `downloadArtifact`
- `exportWorkspaceDiff`
- `runVerifier`
- `exportRunLog`
- `exportTelemetry`
- `cleanupSession`

Aily provides execution evidence. Skill Eval core owns scoring.
