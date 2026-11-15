# Scoped operating decisions after PR419

F-36 is VERIFIED RESOLVED for original invalid-item/publication failure isolation. F-40 is VERIFIED RESOLVED at the tested source/schema boundary; migration 018 and its role grants were not independently inspected in production. F-08 remains PARTIALLY MITIGATED because stored-transaction recovery still serializes chains, despite the verified fresh-send repair. F-19 remains PARTIALLY MITIGATED for both outcome policy and current-state handling. F-20 closure is inherited on unchanged node v3.5.1.

Core self-funded permissionless transfers retain the prior CONDITIONAL GO within its existing restrictions. No new node release or contract redeployment is required by PR419 or this audit. The Creator F-36 blocker is removed, but F-37/F-38 are not waived. Unrestricted unattended sponsorship is not approved while F-08/F-19 and inherited F-17 remain. Staffed bounded service operation requires explicit accepted responsibilities and preservation of uncertain obligations. UI/email maintenance is not classified as a contract exploit.

No new finding ID, source modification, production transaction, service restart or database migration is introduced by this publication. Missing operational access is an evidence limit, not an assumed production failure.
