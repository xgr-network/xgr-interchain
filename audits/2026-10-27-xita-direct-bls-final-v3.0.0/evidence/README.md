# Public audit evidence — XITA, 27 October 2026

This directory contains publication-safe copies and explicitly identified summaries of actual audit evidence. It accompanies the final report; it is not an application checkout or an executable exploit bundle. No production mutation or new application change was performed during curation.

## Frozen source scope

| Repository | Branch | Audited commit |
| --- | --- | --- |
| xgr-network/xgr-interchain | main | ffc24139738bcb25ab516e5d3242f258a75fcfb8 |
| xgr-network/xgr-node | XGR3.0 | 4d341a08baa604c7871e10af8c7c2e2406f4d032 |

`snapshot.json` and the two `*-source-tree.json` files preserve the captured Git tree/blob inventory. They describe 589 interchain blobs and 764 node blobs. They do not silently include later commits. Standard existing tests are represented by their actual named logs; new confidential reproducer source and dependency trees are excluded.

## Reading the results

`verification-summary.json` retains each measurement's own unit. There is deliberately no overall pass total. The 102-case race run repeats part of the 127-case node suite. The seven final independent/isolation Solidity tests contain six auditor tests and one adjusted existing fixture; 257 fuzz iterations belong to one property. Passing a negative reproducer can confirm an open defect.

The unmodified Solidity suite still has one fixture failure (102/103 pass). Browser-side unit files have 273/280 pass: five stale assertions and two unavailable-Chromium failures. The indexer has 136/137 pass with one stale rejection expectation. None of those failures is removed by the public summary. `node/tests-initial.jsonl`, `contracts/forge-full.log`, `contracts/independent-initial-summary.json` and the initial probe/file-level logs retain setup/fixture outcomes separately from completed reruns.

SQL evidence uses PGlite 0.5.12 and actual PostgreSQL SQL behavior, migrations and exported functions. It does not attest separate-process PostgreSQL concurrency, installed roles or production failure recovery. Some existing concurrency-labelled JavaScript tests use a fake pool. Read-only live observations do not establish an installed-binary hash for every validator, independent RPC truth, a paid empty-gas journey or all-time supply conservation.

## Provenance and normalization

`MANIFEST.json` inventories every staged evidence entry except the manifest itself, with byte length, SHA-256, source-record hashes and the applied transformation. Normal copied logs retain their result text and counts. Ordinary absolute workspace/runtime paths are replaced with `AUDIT_WORKSPACE/`, `DEPENDENCY_WORKSPACE/`, `RUNTIME_HOME/` or `TEMP_DIRECTORY/`; repository-relative source paths and Git tree contents remain unchanged. Source-file hashes and transformed-copy hashes are distinguished.

`phase-a-findings.md`, the four component records under `phase-a/`, and `phase-a-freeze.json` are byte-identical frozen records. The original filenames in the freeze identify those source records; the manifest maps their publication paths. Phase A precedes historical reassessment and can contain preliminary judgments or facts explicitly corrected by the final report. In particular, the published release embeds Go 1.23.12, while the local audit test toolchain was Go 1.23.11; `node-release-buildinfo-summary.json` retains that distinction.

`contracts/admin-reassessment-summary.json` and `contracts/deferred-native-ui-summary.json` are derived from the actual executed offline records. They preserve observed results and limitations while omitting full synthetic fixture inputs. The original source-record hashes remain in the manifest. `publication-omissions.json` documents all omitted categories and replaced raw records. It does not assert that the public folder contains the confidential archive.

## Main evidence groups

| Group | Contents |
| --- | --- |
| `node/` | Existing standard/race logs, initial setup log, source correction/ancestry metadata, static transport review and observed release-version output |
| `contracts/` | Unmodified Solidity baseline, final independent/isolation results, initial fixture summary, dependency/build fingerprints, runtime comparison and normalized current admin/UI checks |
| `sponsorship/` | Managed-relay and targeted administration tests, bounded negative-check logs, SQL semantics, exact corrective PR metadata and historical reassessment checks |
| `ui/` | All 39 per-file named test logs, summary and initial reporter outputs, including the actual failed assertions and browser setup failures |
| `indexer/`, `relayer/` | Current existing suites and bounded historical-regression results |
| `live/` | Public GET/JSON-RPC observations at pinned blocks, configuration checks and supplement records |
| Root provenance files | Git trees, source freeze, published release digests and normalized embedded build provenance |

The manifest does not grant permission to execute confidential fixtures, deploy code, send transactions or infer that a merged source correction has been released to every host.

## Final finding inventories

`current-findings.json` contains the 29 consolidated current findings. `historical-findings.json` retains 43 historical identities from the two prior audit dates with their individual current assessments. These are byte-identical copies of the lead auditor's final normalized inventories after QA, not copies of raw historical documents. Current severity, original severity, remediation status and production verification remain separate concepts. The frozen Phase A records retain their original bytes even where final reassessment corrects or narrows them.

## Exact archive inventory

The actual ZIP contains 104 entries. ZIP timestamps are normalized to 2026-10-27 00:00:00 for reproducible packaging; observation times remain in the evidence. The following table identifies every entry, including the manifest. Source-record commitments and transformations are inside `MANIFEST.json`. The two admin/native-UI summaries both live under `contracts/`.

| ZIP entry | Bytes | SHA-256 |
| --- | ---: | --- |
| `MANIFEST.json` | 53831 | `01ab319019fd6c945cea595bcd3b15ec03e19c8b72931de38d5b39f9d310ad9b` |
| `README.md` | 5684 | `5e0423786a072470189ac5f06e6b1053fdcc86020c6818e52be163d645439048` |
| `contracts/admin-reassessment-summary.json` | 1424 | `0c2c5c6396fd36d91fd8390798c4b5d28eedd8ce6be042f6ac2bbc9a0e5b736a` |
| `contracts/build-environment.json` | 957 | `2705b73c4b437e26efa0013a975978c843da77c2eef9a3d17c0e5f80cfa4ccb3` |
| `contracts/deferred-native-ui-summary.json` | 1452 | `6b3012de0369a268a0258b8333c4106ec24d5ca5ac2bcc20964cb174e19d63f6` |
| `contracts/dependencies.json` | 603 | `f36439cf713114e5da484d16cb99be77e1e1775b40825dce85e0827b8f0164cc` |
| `contracts/fixture-adjustment-summary.json` | 1012 | `23a991cad8e4f049f6bbb62d86b0ef3607168054ed209104630177b4eeaaa8de` |
| `contracts/forge-full.log` | 8803 | `b7d6ad62a6c6cdc3deb672754690de318892feaf0280e878113d304d26fa426f` |
| `contracts/forge-independent-final.log` | 3748 | `8709bc048732d7eeb0daeca09a97625587dd54cdd4e43389602e07ee2b0fdaf5` |
| `contracts/forge-run-2.log` | 14999 | `371ccc374ece262eee4d2001373ad02cc5bd37130763f34f5f58337895f11c62` |
| `contracts/independent-initial-summary.json` | 844 | `849b787173e46bb2499f284fce1042e97c39e90c11a83a33e6c09fc8f0985609` |
| `contracts/phase-b-history.json` | 9398 | `bb371b0df94cb23635a7211b8cb7de71d42a1e22f45ed4c2e193894ab7ce6bbc` |
| `contracts/runtime-comparison.json` | 171975 | `96305fe162c482a53f8206924e0877cbf1f57f0abc6ba2383eaa6d901f8a9779` |
| `contracts/summary.json` | 995 | `e03580d92426225677f9bd8dcde286cdfe370a395f696c46ce6259e40e438090` |
| `current-findings.json` | 37209 | `e5a603e0b5b29ef90c4edc5f2cccd0d7df73d8b88bdf72c197f4efff8b54b4b6` |
| `historical-findings.json` | 113433 | `0eec3cf8cea70ea45cdfb6871fc689962a3f372bae4b2dece5bfc02a4e8e6935` |
| `indexer/historical-checks.tap` | 822 | `6c7d37d0fb093cdfdd55c97f47d94ae69a8c5febb91322cbdb0bd725f4efa57b` |
| `indexer/indexer-tests.log` | 13348 | `3dfd90d9a701bada341f034e5d7812cf52b95eb3190d849d39a19aca1c1aa1e9` |
| `interchain-source-tree.json` | 204417 | `31c413172e762553b6cdc29e8ca0addb2c5ec779f79b4828a5a6457e95efe8f9` |
| `live/observations.json` | 1057026 | `f13234b3a8df0ebca245a6a63562351d16c9b55c1215aac2c36d611b5e67d100` |
| `live/route-configuration-final.log` | 5002 | `75752cd7fb33b41141825c7b97b125dbbc9f17b264d6cc13f5e3a3a857712a2a` |
| `live/route-configuration-run.log` | 981 | `49045fbed6d511711bb9536b018d0d4a314afb48e653c03434bd81537811bf21` |
| `live/route-configuration-summary.md` | 4969 | `c6339d59fd22ac50402be9ee24129f80caa8846dc04a0768e6df8bb0fadb971c` |
| `live/route-configuration-supplement.log` | 702 | `83259754e86639252201d05cc4e953947ca58ad7312b681b07077925400f9cf7` |
| `live/route-configuration.json` | 409540 | `385ec87f248c45197ee37079ee2787e29518e100da39e5a76578170fef509073` |
| `live-probe-summary-proxy.log` | 4137 | `3b03180fc66c00ae17f81853dddd32f797b73a2d08c1f1c4da6a3fcd6dd78e70` |
| `live-probe-summary.log` | 1304 | `5d880fbfd0993ece328b5bfc1b9b7acf01d919c9a19247d64e90c9065b7e68d6` |
| `node/corrective-ancestry.json` | 1892 | `ef0394980536180fe29bdf6d4db5dd373105d962a50b51264b01e8b8f87abe87` |
| `node/corrective-commits.json` | 25757 | `c41fb8782d43dbaa0e7449e8f2a7e58ab8eec2173b63454e7bab0b66fddca95c` |
| `node/m04-transport-static.json` | 6307 | `10683fcf8e3c4041931713607659f8acc3ef1010adfa98c8d3c0adbf8a1efcc6` |
| `node/release-cli-version.txt` | 353 | `c97f946fd29b489adc78ed6e81998f314b5d621088632761151c86fa10e46a9e` |
| `node/test-summary.json` | 2233 | `ab5a6c42b1c5ef95a8855ac920e90419e48c08bbe9229faeb5d556f9992faef6` |
| `node/tests-initial.jsonl` | 71365 | `482b5cce2f82f53708324611c69dcf483eec716591cd16a46c0178acf210c0b0` |
| `node/tests-initial.stderr` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `node/tests-race.jsonl` | 92088 | `1c5abfe6bca1b1a4cbf3c019e0d8c21e022579b132d4aeee42615d876e5a7ef1` |
| `node/tests-race.stderr` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `node/tests-standard.jsonl` | 115287 | `c6dd12ee57dbf24fc983df542c93beefdb51fb584525231acaf6ae24d1469049` |
| `node/tests-standard.stderr` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `node-release-api.json` | 1162 | `089dca7ad0714b0f365fd855029567d70d586c5b03097f1e141f4190d5c687ff` |
| `node-release-buildinfo-summary.json` | 1358 | `b5803d9ba639d0714994ce4dbdcabd66bca0352e827cf2bd8d3408ba245ab689` |
| `node-release-download.json` | 913 | `da741b2e1c1b557791a8ce2a34c06d184ab337bc2035338df8453fc2ceab499d` |
| `node-source-tree.json` | 272494 | `003b74fd19bb7ba3dc1658b318c91edf627511dfb6028f52c4120cdf7a4bc457` |
| `phase-a/contracts.md` | 17234 | `ee9edc45aa9f5149a5ff5f020cb3d2621b84c7fa4eade87f1dadbfb5ddc48a5a` |
| `phase-a/lead.md` | 9561 | `e241a810e37e9c8a9deb07d8e9fc971b4d5113785fe0874018d976019db85597` |
| `phase-a/node.md` | 18863 | `92c1429c998844838f012c574b3555cfa149f8cfbb71a094dfce2a9ec4a7fd68` |
| `phase-a/sponsorship.md` | 16312 | `8be5d7947e26d7314db6263ee0d461a4557b5fb10bf6eadee05fc55ca4d32d0b` |
| `phase-a-findings.md` | 62233 | `2a50051a01d73f36dcd01faed86709947395ed4474ae93578b4802d2fa85be32` |
| `phase-a-freeze.json` | 1146 | `f7341dccdba60f149a96b14580b94d3d0ac308f5640417671cdd39db37e7a398` |
| `publication-omissions.json` | 3037 | `c288149b0161c5c2166db75e654358441e5b1d9d4dbf0e1dff4d9544feeee4e1` |
| `publication-review.json` | 3165 | `75aa84b5826007e460afa686555bfab19e7408462304b4e8b1634b7c79874354` |
| `relayer/relayer-tests.log` | 3128 | `8b5f99a86a20c2f23ef3dc1a4ca07d4f8034204c069dd1ecc4e89ccad3b79d3e` |
| `snapshot.json` | 463 | `bedd4e25808f5205f5bf145fd58ee581c673a563bc9c734b295555fc4f89d5b5` |
| `sponsorship/admin-security-tests.tap` | 4554 | `15a629c9d0d290f1dde4fb36161e62a3f802f9fc084cb2a30d86722c26766668` |
| `sponsorship/auditor-fault-tests.tap` | 1051 | `6210b9fd8a03784e094e20d17b814df82b9a02ac027f24399d2e3d60aed83546` |
| `sponsorship/historical-l06-current.tap` | 375 | `336e4a18da9054b2369641b0dec3e2eebcdd0d89f8ce312f4f0899e709253d73` |
| `sponsorship/historical-n05-n12-sql.log` | 545 | `b4490c8ce6d446079f0cd08a3cb6e5efc68b3bd0c95a44922bf79037a083f1a2` |
| `sponsorship/historical-sponsor-current.tap` | 1129 | `e8727cb3e98c76f02eb8109d3cebbe9a97fdd759fa7eb424c3f33ff8cc3607e5` |
| `sponsorship/managed-relay-tests.tap` | 19582 | `df1cda3c2653eae5e935b366e5fba54efaf008e8cd910172442d02e0b6676845` |
| `sponsorship/remediation-pr-metadata.json` | 7691 | `e0af3169ccebb493f91faeed4234dcb3e1e88d58e12f2a55975d314b1179dc64` |
| `sponsorship/sql-permissions.log` | 1198 | `46572b1f64f1df8ba9375fadf70848ac871c69349d8e16cc79f585d57cf1dd4f` |
| `sponsorship/sql-runtime.json` | 277 | `5df6144ee1b593348caa781c7defbc83e403aa2b3ed1f20471fc00452d9ec982` |
| `ui/per-file/automatic-transfer-step.test.log` | 1147 | `4c0878c21dde484ca41d46c815f0d8833968e74c5b971a11ccd6aa21ca11cb9a` |
| `ui/per-file/browser-smoke.test.log` | 1978 | `b094390b4586bb35e0cd15eb579481b0156e0caf144ad0cc1e086696637beebf` |
| `ui/per-file/chain-finality.test.log` | 1017 | `f50d930d5d4849dce76e4933e02a348b42b10989b8e8822b9c0f4c4b7da2a4ad` |
| `ui/per-file/experience.test.log` | 9438 | `a05a2142ceb65fe8a49d9392f3961701c2e6d57c64ed609f51a00d5806e8adba` |
| `ui/per-file/fee-gas-projection.test.log` | 1086 | `0feb4bcbb3b25d16c77083a665c72edc990a789c49b76616794ea82aa1398ece` |
| `ui/per-file/join.test.log` | 1690 | `a6cc569a330bd0b3c1bc3613a4e2e4e5626242edaf1f0f113c8c4bc0af58604e` |
| `ui/per-file/keccak.test.log` | 464 | `a5a4da8fb60b4d9f646c92f2e55c514274e385e359e5d11af56eed2a075a2996` |
| `ui/per-file/leaderboard-data.test.log` | 1365 | `b1d1c9affae2311a5b183770d248e765b7e3a7617a8f04c2134600edbe4a8179` |
| `ui/per-file/legal.test.log` | 314 | `4a8362ff2f08d58b11855b4266d50c5080fa75b623d7f8a37489b097e4a0cc2d` |
| `ui/per-file/listing-visibility.test.log` | 1144 | `c98b369c72248c5057411b733f7f00ceb596fd303708190550fd3269cd1ae962` |
| `ui/per-file/metamask-token.test.log` | 2652 | `320f35806a50bc6f06907ac4abb90447b565fb9874691f7b770e5d7745863d63` |
| `ui/per-file/publication-mainnet-regression.test.log` | 1322 | `5560f3aea8bea909136a0cfeb59fc41b65b9b4b727e643bc998587c5a7628530` |
| `ui/per-file/route-availability.test.log` | 9529 | `c2874d79024bc01df93134996e7db5f04450f8b5bd2ea7b793e41f1dd25df076` |
| `ui/per-file/source-tx-hints.test.log` | 721 | `7cf2b72f0f6530570ad9cb6ceb80c4d78b610635d6bd2b352fed4bf531dfdc4d` |
| `ui/per-file/sponsor-route-readiness.test.log` | 713 | `828cfef3017a21de3974da36d8866dcbc0dcc7387bf67a11e1efb40d0df24b88` |
| `ui/per-file/system-rankings.test.log` | 486 | `1131cf552100cb51eba18c81777828830d8ec6578a04c049a73f5f84da43719b` |
| `ui/per-file/token-inventory.test.log` | 2021 | `7368de2ccdf7fdc3f11a0a6ad0d79d76f0417a1b0de38f0a51bc1274f65c403d` |
| `ui/per-file/token-representation.test.log` | 689 | `e728d2125edee2b61708c7a24392fa7ad02ce765a63111f6fe45650274d083b7` |
| `ui/per-file/token-slug.test.log` | 891 | `4649e895f514286ab535d1de5e4428ee21aa783aa16587b6e1bbea7a945b5fde` |
| `ui/per-file/transfer-actions.test.log` | 6932 | `d68522423be1c00da89ce4ce950eff2e66954bc869cc2967976017193250c0f6` |
| `ui/per-file/transfer-balance-refresh.test.log` | 819 | `af1d90913025d0774301824d7ae40c6e299f443c01f8a99cc85904a25ad38591` |
| `ui/per-file/transfer-flow-binding.test.log` | 1344 | `77609763529802f1e17e5093717d1bac6cab5416aacfeec39818846db44b6610` |
| `ui/per-file/transfer-page.test.log` | 2521 | `02fc528af65d667eeab598f3637de28cd5148704f26e42e9d89a9878b819fa8d` |
| `ui/per-file/transfer-sponsor-evidence.test.log` | 723 | `fd23dfef19aef1f55284688aae2090105a3ed8e518954d04316d8b016f57b10d` |
| `ui/per-file/transfer-status-flow.test.log` | 6269 | `e66da650d362ffdf9b8f6ceeb2b6ed67bf6cac0e49d4e888c9043b75cfe061fe` |
| `ui/per-file/transfer-step-timer.test.log` | 528 | `7d8de4cf6ad40e3b95982c3402e570adbd0e9286a6e6eb4dec81409c4c55a09f` |
| `ui/per-file/transfer-token-journey.test.log` | 1711 | `7fb5b66dd057955bad4d9176fb8b993e05993a5f114007600b74c5ff8e6d87fb` |
| `ui/per-file/universe-orbits.test.log` | 1586 | `9abf85296ddf3f9898021bd5f9a6ca185fcdd0866cede553dee1d476f6e9839e` |
| `ui/per-file/universe-scene.test.log` | 332 | `0fb9dfc4fe4c47f90666034e55ade85fb594b8a6508b3fc80c8ba8607faab37b` |
| `ui/per-file/universe-token-layout.test.log` | 1256 | `adecc47e9e73ed36ba1e832cbea2136cc78b5cba24aac0e0a41f3cc9b89619bd` |
| `ui/per-file/verified-journey.test.log` | 2039 | `8dc0d1816fb1da19d4f1b156996950b26937aa869504e350b1283e60a63d6281` |
| `ui/per-file/wallet-action-attention.test.log` | 954 | `73c6959db5c37fae8330ebd8c19e3b937dfa2dae2f763700cf4b759294744f94` |
| `ui/per-file/wallet-core.test.log` | 940 | `0c131f53e157f0a918803abaa4f5eaa5198196a3640bd050b3c94c1b334dc2ab` |
| `ui/per-file/wallet-gas.test.log` | 865 | `fefff5022e518f872a464d474bcbeae94322dc5f20dc883fb4b02fc912100f7e` |
| `ui/per-file/wallet-index-projection.test.log` | 1250 | `f7c93813a7d73231497f633585f66b557374143f1fc6607fccf7862bd280fa6a` |
| `ui/per-file/wallet-nonce.test.log` | 1287 | `773aa8c145f0c2dfac0dee9c9e79fad8d4069fa0cf6733d7572897b2ac5a4c93` |
| `ui/per-file/wallet-pending.test.log` | 1364 | `fdc1cf1c5e647d7b5d7c4ef9775b711b72c142b05df9794c5137b7e230be313f` |
| `ui/per-file/wallet-transfer-selection.test.log` | 803 | `3a3c74cb938f1e7c37969361d2b0e9b4904563033a94ea4036aa12320f5be47d` |
| `ui/per-file/wallet-transfers.test.log` | 4964 | `4686c80e691372cc9ebebcb5a2636ed0495904e89dd2b987e3bc0ed86b4f20c2` |
| `ui/web-tests-isolation-none.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `ui/web-tests-summary.json` | 6978 | `0a27b6dc9fb0f30a34c654f1ca9f5ed9c812e1a07293114471805358db63b848` |
| `ui/web-tests.log` | 4503 | `c108f87fe49729876d54ab22e4e89664ddf590de79b795c70c49b7d5504e789e` |
| `verification-summary.json` | 5953 | `d059c7288b9b7692747f397b9c01a9b76e699a6a87960c2526ae8d4b838b6689` |
