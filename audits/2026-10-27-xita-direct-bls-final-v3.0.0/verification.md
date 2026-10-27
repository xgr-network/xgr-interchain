# Verification record

### 9.1 Pinned live state

| Chain | Chain ID | Pinned block | Canonical block hash |
| --- | --- | --- | --- |
| XGRChain | 1643 | 12176701 | 0x82eecc381fb46fac5c9ff2c4b3b9aa12c140da889cbf0d8d3072ac71835da5d5 |
| Base | 8453 | 53148028 | 0xf2ba5663a19fd2133367a40516d73ab9192472987b91debed7cbd2a8ed881d95 |
| Arbitrum | 42161 | 518669953 | 0xc3f4426f2c9b05259e8b3b3435a942ff6ea56fca57a35f2f62a5ffffc4f1f5f5 |

The initial successful probe ran from 07:17:51.860Z to 07:18:10.139Z. Supplementary reads used the same pinned heights and reread unchanged canonical hashes. The first attempt without the audit environment's required proxy failed; it is retained as an environment/setup failure, not a production outage.

All 57 unique runtimes (21 XGR, 18 Base, 18 Arbitrum) matched receipt Keccak-256 hashes. Fresh compiled lengths matched all 57. Forty-five instances differed only in trailing IPFS metadata digests after declared immutables were separated; twelve additionally contained metadata digests embedded in child creation data. No unexplained instruction differences remained. This is not byte-for-byte compiler metadata reproduction. Getter/receipt checks supplement excluded immutable values; unexposed constructor-time values without independently decoded inputs remain limited.

Supplementary verification produced 424 getter/balance observations: 393 matching expected comparisons, zero mismatches and 31 descriptive values. Separate additional checks read six validator-set encodings, verified three EIP-712 quote digests and reconciled three Arbitrum activation getters against canonical creation receipts. All eight inbound routes accepted the correct binding and rejected wrong route IDs/routers. All six router owners are zero. All eight FeeVault balances cover observed allocated-minus-claimed obligations.

| Registered asset | Direction set | Verified routes |
| --- | --- | --- |
| XGR | XGRChain to/from Base and Arbitrum | 4 |
| ARB | XGRChain to/from Base and Arbitrum | 4 |

All three validator registries reported set 1, three members, threshold 2 and matching ordered public keys. This confirms configured on-chain membership, not independent private-key control. The Execution Gateway owner was 0x2f1048cf4c55bcafc0846a72c5bcb86a5b947b40 and service wallet 0xf0dcd6aad6de2057c7e49e7d294b3736504d4316 on all three chains; distinct addresses do not prove separate key storage.

The sampled XGR native router held 215 XGR, while synthetic supplies were 130 on Arbitrum and 85 on Base; pending native claims were zero. ARB collateral and corresponding synthetic supplies were zero. These are consistent asynchronous snapshots, not an all-time or in-flight-message supply proof.

### 9.2 Source, published release and installation

| Evidence level | Actual result | Limit |
| --- | --- | --- |
| GitHub source | Two exact branch SHAs and all blob hashes matched | Later source changes are outside this freeze |
| Published node release | v3.3.8 points to frozen node SHA; downloaded binary digest matches asset/checksum metadata | Not a reproducible rebuild or installed-host proof |
| Embedded build data | Go 1.23.12; frozen VCS revision; vcs.modified=false | Embedded metadata is a release claim, separately corroborated by downloaded digest |
| CLI product version | Four version fields are empty in the published binary | I-02/F-27 remains open despite correct Go VCS data |
| Public node behavior | Self-reports v3.3.8 and healthy caught-up eight-route observer | One endpoint cannot attest every signing validator or successful live quorum recovery |
| Public frontend | app.js and catalog.json exactly match frozen source hashes | Other modules and all service installations not comprehensively attested |
| Managed sponsorship | Enabled and wallet-aware, but unavailable on all three chains | No production cause attribution; no paid empty-gas acceptance journey |

The downloaded Linux release binary is 73,021,839 bytes; SHA-256 **95fd72cc72b942d206b130ff4ef63df83d2d161a99d092cd68b9b240c6be9617**. The exact published commit is 4d341a08baa604c7871e10af8c7c2e2406f4d032. [Release v3.3.8](https://github.com/xgr-network/xgr-node/releases/tag/v3.3.8).

Final verification corrects a toolchain detail in the immutable Phase A notes: the downloaded release embeds **Go 1.23.12**. The local test toolchain was Go 1.23.11, and the public RPC client string reported Go 1.23.11. These are separate observations; their mismatch reinforces that a public version string cannot establish installation of the downloaded release. The original Phase A bytes remain preserved with this explicit correction.

Live managed health returned `paidQuoteReady=true` but `sponsorship.available=false`, reason `sponsor-reserves-or-worker-not-ready`. The health endpoint reports `proofBuilder=installed`. This does not independently attest the executable's identity, successful execution or current-quorum formation. The observed complete index coverage 8/8 is not eight completed end-to-end wallet journeys. No live role/secret audit, service process attestation, sustained resource test or installed binary hash capture was available.

## 10. Executed verification and limitations

| Area | Actual result | Meaning and limit | Evidence inside public ZIP |
| --- | --- | --- | --- |
| Node existing suite | 127 passed /127 | Interchain/protocol packages; isolated frozen copy | node/tests-standard.jsonl |
| Node race detector | 102 passed /102 | Subset rerun of the 127, not additional unique cases | node/tests-race.jsonl |
| Unmodified Solidity suite | 102 passed /103; 1 fixture failure | Misplaced expected revert; production guard separately confirmed | contracts/forge-run-2.log |
| Independent/isolation Solidity | 7 passed /7 | Six new tests plus one corrected existing fixture; 257 fuzz cases x 40 epochs | contracts/forge-independent-final.log |
| Managed-relay existing suite | 92 passed /92 | Includes quote/funding/finality behavior; some concurrency-labelled tests use a fake pool | sponsorship/managed-relay-tests.tap |
| Admin/security targeted suite | 20 passed /20 | Health, read-only reconciliation, role/rotation and Nginx checks | sponsorship/admin-security-tests.tap |
| Browser-side unit files | 273 passed /280 | Five stale assertions; two missing-Chromium failures; 39 files invoked separately | ui/web-tests-summary.json and per-file logs |
| Indexer suite | 136 passed /137 | One stale assertion rejecting now-intended pinned eth_call | indexer/indexer-tests.log |
| Native-relayer suite | 14 passed /14 | Offline current-source regression checks | relayer/relayer-tests.log |
| New sponsor fault checks | 4 passed /4 | Passing reproduces nonce/interruption, RPC isolation, expiry and lifecycle conditions | sponsorship/auditor-fault-tests.tap |
| Historical sponsor regressions | 4 passed /4 | Above-safe/orphan rejection and bounded exact-transfer gas estimation | sponsorship/historical-sponsor-current.tap |
| Historical fee backfill reproduction | 1 passed /1 | Passing confirms still-open L-06 rollback | sponsorship/historical-l06-current.tap |
| Historical indexer checks | 3 passed /3 | Real SQL N-11 starvation plus route/shared event-bound failures | indexer/historical-checks.tap |
| Actual PostgreSQL-engine scenarios | Executed with PGlite 0.5.12 | Restricted-role mismatch/rollback; nonce uniqueness; N-05/N-12 candidate SQL. No multi-process stress | sponsorship/sql-permissions.log;historical-n05-n12-sql.log |
| Current admin and native UI checks | Two admin conditions and one UI composition reproduced | Actual functions with synthetic offline fixtures; no live deployment/claim | contracts/admin-reassessment-summary.json;deferred-native-ui-summary.json |
| Read-only deployed runtimes | 57 /57 receipt hashes match | Fresh source bodies match outside explained immutable/metadata regions | contracts/runtime-comparison.json;live/observations.json |
| Read-only route configuration | 393 matches /424 observations; 0 mismatches | 31 descriptive values; 8 valid routes and 16 wrong-binding rejections; separate 6 set / 3 digest / 3 receipt checks | live/route-configuration.json |

The source suites ran on isolated copies. Node used Go 1.23.11; JavaScript used Node 24.22.1; Solidity used solc 0.8.24 and Forge 1.5.1. The configured Prague compiler target was normalized to the latest target supported by that compiler, Cancun, while the EIP-2537-capable test runtime executed the cryptographic vectors. Exact settings and dependency fingerprints are in the evidence. PGlite 0.5.12 executes PostgreSQL SQL semantics in WASM; it does not establish production process-level lock fairness, deployment grants or concurrent failure recovery.

The race run is a rerun of 102 tests from the 127-test node suite, not 102 additional unique security cases. The seven final independent/isolation Solidity results comprise six new auditor tests and one corrected existing fixture. The 257 fuzz cases are iterations of one property, not 257 different test functions. The custom fault tests passing confirms their asserted behavior, including open failures. Initial missing-dependency, sandbox-loopback and missing-browser failures are distinguished from production faults and from completed reruns.

### Work not performed

No full malicious consensus proposal, production false-RPC takeover, live reorganization, paid transfer, funded smart-wallet claim, destructive database/host crash, sustained gossip flood or complete validator rollout was performed. No formal verification of every protocol invariant, exhaustive compiler equivalence or independently attested provider topology was available. Browser smoke checks did not execute successfully because the required browser binary was absent. The report does not infer a working real-wallet matrix from unit tests.

The automated security filter stopped further exploit-oriented node work. Already completed local checks were segregated, not expanded or reattempted through another tool. The unfinished first-disagreement witness scenario is described from source only. Public evidence excludes executable reproductions and detailed unrepaired accounting outputs. These limits reduce certainty about full exploitation; they do not establish safe launch readiness.

## Reproduction environment and commands

The public logs retain named case results. Executable new failure fixtures are in the confidential archive, not public GitHub. Frozen production source was unchanged.

- Node: `go test -count=1 -json ./interchain/... ./consensus/ibft/interchain/...`; race subset: `go test -race -count=1 -json ./interchain/evm ./interchain/runtime`.
- JavaScript: Node 24.22.1, named-test reporting with `--test-isolation=none`; the 39 browser-unit files were invoked individually, and component test groups were invoked in isolated copies.
- Solidity: Forge 1.5.1 with local solc 0.8.24; exact dependency/configuration fingerprints and fixture isolation are inventoried in the evidence. The seven selected final checks are not substituted for the failed unmodified baseline.
- SQL: PGlite 0.5.12 applied the exact relevant source migrations, exercised actual functions and constraints, and kept all production databases untouched.
- Live observations: HTTPS JSON-RPC reads and GET health/static asset requests only, using explicit canonical block tags and post-read hash checks where stated. No send/sign/deploy endpoint was invoked.

## Phase ordering

Phase A was sealed before historical document retrieval; `phase-a-freeze.json` commits all original note bytes. Later corrections supplement the final report and never rewrite that frozen record.
