# XITA security audits

This directory is the permanent index of version-pinned XITA security reviews. An AI-assisted code review is **not** a formal third-party security certification.

## Audit register

| Date | Subject | Reviewer | Frozen interchain commit | Frozen node commit | Disclosure |
| --- | --- | --- | --- | --- | --- |
| 2026-10-16 | [XITA v3.1.5](./2026-10-16-xita-v3.1.5-gpt-6-pro/) | GPT-6 Pro (AI-assisted review) | `250adc61838896c77360adad22a4952da9263766` | `99b7b915fb09adaf67c1c3527c8ad45522e0414a` | Remediation in progress; detailed report withheld |

## Required lifecycle

1. **Freeze** the audited revisions, component scope and limitations.
2. **Triage privately**. Keep unresolved security details, proof-of-concepts and source snapshots out of public PRs/issues; use GitHub private security advisories or another access-controlled channel as applicable.
3. **Remediate** in the affected repository, linked to a reviewable pull request and exact merge commit. Code changes and deployment are separate states.
4. **Verify** relevant unit, integration, adversarial and end-to-end cases; retain test logs and cross-repository commit IDs. Do not infer production behavior from a passing isolated test.
5. **Publish** the complete original report, remediation record and non-sensitive evidence only after disclosure review, verified fixes and any necessary rollout.

## Status vocabulary

- `OPEN` — no correction accepted yet.
- `FIXED_IN_CODE` — corrective code exists in a commit; required verification or rollout is incomplete.
- `VERIFIED` — specified regression and integration acceptance tests passed at pinned revisions.
- `RELEASED` — verified correction is confirmed in the intended deployment.
- `ACCEPTED_RISK` — explicitly approved architecture/risk with rationale, owner and review trigger.
- `NOT_APPLICABLE` — justified non-finding or superseded finding, without deleting history.

Never mark a finding `VERIFIED` merely because CI is green, or `RELEASED` merely because a PR was merged. Report an unknown test or deployment status as unknown.

For confidential disclosures see [../SECURITY.md](../SECURITY.md). The `deployments/` manifest records deployment receipts; audit documents must not be used as an alternative deployment authority.
