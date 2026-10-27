# NEYDRA — Autonomous cloud development protocol

The NEYDRA ChatGPT project conversation owns product decisions. GitHub documents store durable state. Codex Cloud performs bounded engineering goals on independent branches; GitHub CI checks results. Coding can proceed with the owner's PC off, but only a **configured** cloud task actually runs while the chat is inactive.

## Work allocation
- Initial parallel work: authentication feasibility and the genuinely 3D animation stage. They must not edit the same paths.
- Voice feasibility can begin once asset/stack boundaries are clear.
- Local hardware and interactive OAuth consent are *owner-run gates*, not things the agent may fake.
- Parallel work gets separately named task branches and explicit contracts; rebasing/merging is coordinated.

## Authorization model
Codex can research docs, choose implementation details, write code, create tests, run allowed checks, repair within the request and open a PR. It must not purchase, activate paid services, publish releases, change billing, copy secrets to the cloud, approve dangerous OS commands, delete external files, or auto-merge without approval.

## Task formulation
Each Codex cloud task needs:
1. GitHub repository and branch.
2. Problem statement and scope.
3. Exact file ownership and cross-module interface.
4. Constraints and forbidden shortcuts.
5. Acceptance conditions with independent evidence.
6. Reporting format and stop conditions.

## Convergence
At most two targeted retries for the same failing test. If unresolved, provide an honest blocker report rather than a repair loop. Do not create additional autonomous tasks as a workaround for subscription usage limits.

## Distinct tools
Codex Cloud develops source on hosted compute. Codex app-server is the feature to embed in NEYDRA later. GitHub Actions run scripted tests, not an unlimited agent. Continuous 24/7 task chaining or scheduling must be proven available under Plus before promised.

## First manual gate
Connecting the repository to Codex Cloud may require installation/authorization in the Codex UI. Once connected, use the issue tasks linked from the initial planning PR. The owner may provide the repo to Codex; Codex does not automatically start because files/issues were written.

## Reporting
Record plan, changed files, test commands/results, screenshots (for UI), costs/licenses, blockers and next ready tasks in the PR. Do not label an issue 'done' when the only proof is a mocked result.
