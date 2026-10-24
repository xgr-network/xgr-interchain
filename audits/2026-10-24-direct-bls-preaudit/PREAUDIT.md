# XITA Direct-BLS – technisches Voraudit (24.10.2026)

**Status: PRE-AUDIT / keine Mainnet-Deploy-Freigabe.** Dies ist eine quellcodebasierte, nicht unabhängige Sicherheits-Vorprüfung und keine vollständige Audit-Zertifizierung. Es wurden keine Wallet-Transaktionen durchgeführt. Die bereits durch GitHub CI absolvierten Tests sind separat von einer echten L1/L2-End-to-End-Verifikation zu betrachten.

## Eingefrorene Prüfstände

| Teil | Repository / Branch | Commit |
| --- | --- | --- |
| XITA Contracts, Admin, Relayer, Web | xgr-network/xgr-interchain / main | `85e9dbbc03122c1c2ecf8014fee0e2e511a15492` |
| XGR-Node / Interchain Validator | xgr-network/xgr-node / XGR3.0 | `e6fecf8de08e7261afb24014b3d2d56ccbc8eb40` |
| Letzter Node-Release | XGR-Node v3.3.1, light release | `e6fecf8de08e7261afb24014b3d2d56ccbc8eb40` |
| Vorheriges Audit (unverändert archivieren) | interchain freeze / node freeze 16.10.2026 | `250adc61838896c77360adad22a4952da9263766` / `99b7b915fb09adaf67c1c3527c8ad45522e0414a` |

Belegte CI: [XITA Validate](https://github.com/xgr-network/xgr-interchain/actions/runs/40066563040) und [Native Interchain Contracts](https://github.com/xgr-network/xgr-interchain/actions/runs/40066563039) waren erfolgreich auf exakt 85e9dbb. [XGR v3.3.1 Light Release](https://github.com/xgr-network/xgr-node/actions/runs/40066935256) war erfolgreich. Der Light Release enthält nicht die vollständige EEST/ForkGate-Kette.

## Ursprüngliche Sicherheitsvorgaben: Abgleich

| Vorgabe | Befund | Code-Evidenz |
| --- | --- | --- |
| Permissionless Routes ohne zentralen Freigabeschritt | **Erfüllt im Contract** | `XETATokenFactoryV315.sol`, `XGRILNRegistryV315.sol` |
| XGRChain exakt ein Hop-Endpunkt (1643); keine direkte Spoke-Spoke-Route | **Erfüllt im Factory-Modell** | `XETATokenFactoryV315.sol` |
| 2/3-BLS für Nachricht, Mitgliedschaft und Source-Chain-Fee; keine Route-Governance | **Implementiert** | `XITADirectBLSISM.sol`, `XGRInterchainValidatorRegistryV3.sol`, `XGRILNRegistryV315.sol` |
| Eine signierte, eindeutig gebundene Nachricht | **Erfüllt im neuen Direct-BLS-Payload** | `XITADirectProtocol.sol` und Node `xita_direct_message.go`: chainId, beide Domains, routeId, setId, Block, sourceRegistry, Gateway, Source/DestinationRouter, Mailbox, validatorFeeWei, messageId, Ziel-ISM und Ziel-Registry |
| Keine Merkle-Roots, Leaf-Indizes, historische State-Proofs für neue Transfers | **Erfüllt für aktiven Direct-BLS-Verifikationspfad** | `XITADirectTransport.sol`, Node `iln_direct_operation.go`, `iln_direct_signing.go` |
| Keine zentrale Custody / eigener Wallet-Prozess | **Erfüllt im Code** | `ILNGateway.sol`, `XITAExecutionGateway.sol`, `recover-iln.mjs`: Wallet signiert, auch Permissionless-Protokolleinstieg ohne Firma |
| Protokoll-Validatorgebühren getrennt von optionaler GmbH-Service-Fee | **Erfüllt** | `ILNGateway.sol`, `XGRILNFeeVault.sol`, `XITAExecutionGateway.sol` |
| Prüfbarkeit tatsächlicher Zielchain-Sicherheit und endgültiger Zahlung | **Code vorhanden; produktive E2E-Verifikation fehlt** | BLS-Tests und Go-Quellbelege reichen allein nicht |

Starke Eigenschaften der neuen Architektur: Durch den festen Signatur-Domaintext `XITA_DIRECT_MESSAGE_V1`, das unabhängige Rekonstruieren genau der Source-Receipt-/Dispatch-Bytes bei *jedem* Validator, die Echtzeitbindung an die gerade gültige Ziel-Registry und das unveränderte Hyperlane-`Mailbox.process` ist der Security-Boundary kleiner als bei Merkle-Prefixes und Peer-Replica-Proofs. Der Relayer enthält keine private BLS-Signaturberechtigung, sondern erzeugt ein unsigned, zuvor statisch simuliertes `Mailbox.process`-Call.

## Vorläufige Befunde (nicht gleichbedeutend mit bewiesener Ausnutzbarkeit)

### PRE-D01 – HIGH – Reproduzierbarer Deployment-Ledger-Konflikt nach Transport-Bundle-TX

**Festgestellter Codefehler.** `services/admin/chain-reconcile.mjs`, Funktion `verifyTransportChildren`, benutzt den identischen `ProtocolFee`-Contract für `dispatchHook` und `requiredHook` (`addresses.requiredHook=addresses.dispatchHook`). `services/admin/chain-operator.mjs` (Transport-Publish) erzeugt trotzdem zwei separate Eingabebelege mit **demselben TX-Hash und derselben Contract-Adresse**. `services/admin/deployment-ledger.mjs` setzt den unveränderlichen Receipt-Pfad ausschließlich aus `chain/txHash-address.json` zusammen und lehnt doppelte Pfade explizit mit `Duplicate deployment receipt in batch` ab.

**Folge:** Die auf Chain erfolgreich abgeschlossene Wallet-Deployment-TX für den Transport kann im vorgesehenen GitHub-Dokumentationsschritt nicht publiziert werden. Der Zustand bleibt in der Recovery-/Journal-Kette hängen; keine zweite TX signieren, um den Fehler zu umgehen.

**Korrektur:** Genau **einen** Contract-Receipt für die eine `ProtocolFee`-Adresse speichern. `requiredHook` nur als aus `Mailbox.requiredHook()` bestätigtes **Alias** der `dispatchHook`-Adresse in Index/Katalog dokumentieren, ohne eine zweite unzulässige Datei anzulegen. Danach einen Integrationstest für den echten Transport-Bundle-Publish mit geteiltem Hook und anschließende Wiederaufnahme des bereits signierten Deployments ausführen. **Nicht erneut deployen, wenn die ursprüngliche TX erfolgreich war.**

Quellen: [chain-reconcile.mjs](https://github.com/xgr-network/xgr-interchain/blob/85e9dbbc03122c1c2ecf8014fee0e2e511a15492/services/admin/chain-reconcile.mjs#L130-L162), [chain-operator.mjs](https://github.com/xgr-network/xgr-interchain/blob/85e9dbbc03122c1c2ecf8014fee0e2e511a15492/services/admin/chain-operator.mjs#L260-L278), [deployment-ledger.mjs](https://github.com/xgr-network/xgr-interchain/blob/85e9dbbc03122c1c2ecf8014fee0e2e511a15492/services/admin/deployment-ledger.mjs#L155-L162).

### PRE-S02 – HIGH, Sicherheitsmodell zu klären – Source-Finality auf L2 nur durch Blockabstand

`interchain/evm/iln_registry.go` verwendet in `confirmedILNHead` ausschließlich `eth_blockNumber - confirmations`. Für Base sind in der aktuellen Konfiguration **12**, für Arbitrum **64** L2-Blöcke vorgesehen. `runtime/native-relayer/recover-iln.mjs` bestätigt ebenfalls nur Blockabstand + aktuelle Blockhash-Übereinstimmung. Es fehlt ein dokumentierter, nachprüfbarer Policy-Nachweis, dass diese L2-Blöcke den verlangten Settlement-/Finalitätsgrad besitzen. Ein momentaner kanonischer Blockhash ersetzt keine dauerhafte L1-Finalität.

**Risiko:** Bei einem ausreichend tiefen L2-Reorg nach dem BLS-Mint/Unlock auf der Zielchain wäre der ursprüngliche Lock/Burn nicht mehr in der kanonischen Source-Chain, obwohl eine Direct-BLS-Quorum-Attestierung schon zugestellt wurde. Das ist ein **Sicherheitsmodell-Risiko**, keine nachgewiesene Ausnutzung.

**Erforderlich vor Geldfluss:** Chain-spezifische, technisch dokumentierte Finalität (z. B. anerkanntes safe/finalized-Signal oder verifizierte Settlement-Policy) verbindlich einführen und fehlgeschlagene RPC-Finalitätsabfragen **fail-closed** behandeln. Für unterschiedliche Sequencer/Chains eine überprüfbare generische Schnittstelle statt bloßer willkürlicher N-Erhöhung einsetzen. Bis dahin Limits/keine Freigabe für risikobehaftete L2→XGR-Mints.

Quellen: [Node iln_registry.go](https://github.com/xgr-network/xgr-node/blob/e6fecf8de08e7261afb24014b3d2d56ccbc8eb40/interchain/evm/iln_registry.go#L97-L116), [Base config](https://github.com/xgr-network/xgr-interchain/blob/85e9dbbc03122c1c2ecf8014fee0e2e511a15492/config/chains/base/chain.json), [Arbitrum config](https://github.com/xgr-network/xgr-interchain/blob/85e9dbbc03122c1c2ecf8014fee0e2e511a15492/config/chains/arbitrum/chain.json).

### PRE-S03 – MEDIUM – Potenzielle Cross-Registry-Replays bei Validator-Membership

Die Direct-BLS-Nachricht bindet Ziel-ISM und Ziel-Registry explizit. Dagegen umfasst `XGRInterchainValidatorRegistryV3.encodeMembershipPayload` **keine Ziel-Registry-Contract-Adresse** (nur OriginChainID, DestinationDomain, setId, Ablauf, Action, Validator und Schlüssel). Der Node benutzt dieselben Bytes. Auch der PoP-Bootstrap-Payload bindet den Registry-Contract nicht.

**Szenario:** Zwei unveränderliche RegistryV3-Deployments mit denselben Anfangsmitgliedern, gleicher Chain/Domain und `setId` akzeptieren während des kurzen Zeitfensters potentiell dieselbe gültig signierte Membership-Transition, sofern die übrigen Vorgaben erfüllt sind. Damit wird die bewusste Zustimmung zu Registry A nicht technisch von Registry B unterschieden. Die aktuelle Gültigkeit von höchstens zehn Minuten und eine exakte `setId`-Prüfung begrenzen die praktische Ausnutzbarkeit; das ist kein nachgewiesener Custody-Diebstahl.

**Prüfauftrag vor dem ersten RegistryV3-Deployment:** Negativen Zwei-Registry-Replaytest schreiben und festlegen, ob Membership-Signaturen ebenfalls per `address(this)` / Contract-Domain sowie ChainID eindeutig gebunden werden müssen. Wird das verlangt, ist es eine **koordinierte Contract+Node-Wire-Format-Änderung** vor dem Deployment, keine bloße nachträgliche Serverkorrektur.

Quellen: [Registry V3](https://github.com/xgr-network/xgr-interchain/blob/85e9dbbc03122c1c2ecf8014fee0e2e511a15492/contracts/XGRInterchainValidatorRegistryV3.sol#L376-L451), [Node protocol.go](https://github.com/xgr-network/xgr-node/blob/e6fecf8de08e7261afb24014b3d2d56ccbc8eb40/consensus/ibft/interchain/protocol.go#L103-L146).

### PRE-A05 – MEDIUM, Journey-Provenienz – `continueJourney` vertraut einem nicht verifizierten Parent

`XITAExecutionGateway.continueJourney` validiert die Onward-Gateway-/Route-/Fee-Bindings und den echten Wallet-Sender, jedoch **nicht on-chain**, dass `parentMessageId` tatsächlich ein dem Wallet gehörender zugestellter erster Hop mit identischer Asset-/Amount-/Recipient-Identität ist. Der Contract verhindert nur pro Wallet/Parent eine Wiederholung und emittiert `OnwardJourneyDispatched`.

**Folge:** Das Event darf niemals allein als beweiskräftige Verbindung eines echten Zwei-Hop-Transfers dienen. Ein bewusst falscher Parent-Bezug verschafft keine Kontrolle über fremde Token und kann die verpflichtende Validatorgebühr nicht umgehen, aber Audit/UI/Indexer-Journey-Daten verfälschen, wenn Downstream-Systeme das Event als Herkunftsbeleg akzeptieren.

**Maßnahme:** Explizite Trust Boundary im Datenmodell; Cross-Chain-Source-Receipt, Empfänger, Asset, Amount, Parent-Delivery und Zielgateway unabhängig verifizieren. Negative Falsch-Parent-Tests in Indexer/UI und Hinweis, dass es keine Onchain-Kryptoverknüpfung gibt. Bei Bedarf eine zusätzliche Commitment-/Intent-Lösung statt stillschweigender Behauptung.

Quelle: [XITAExecutionGateway.sol](https://github.com/xgr-network/xgr-interchain/blob/85e9dbbc03122c1c2ecf8014fee0e2e511a15492/contracts/XITAExecutionGateway.sol#L250-L289).

### PRE-L06 – MEDIUM, Availability – Recovery einer alten Source-Operation benötigt `eth_getLogs`

Der Node vermeidet historische `eth_call`-Abfragen und verifiziert originale Receipts. Für nachträglich angeforderte Quorums wird allerdings `GetConfirmedILNOperations` für den **konkreten alten Source-Block** verwendet (`eth_getLogs`). Nicht jeder öffentliche Base-/Arbitrum-RPC liefert historische Events dauerhaft; neue Validatoren starten außerdem regulär nur in einem jüngeren Scanfenster.

**Maßnahme:** Reale RPC-Tests mit älteren vorhandenen Transaktionen und Provider-Failover. Eine sichere, nachweisbare TxHash→Receipt-Quelle oder robust dokumentierte Langzeit-Aufbewahrung einrichten. Ein RPC 403/429/503 darf keinen Cursor dauerhaft vorziehen oder gültige noch offene Gelder verlieren.

Quellen: [Node iln_direct_operation.go](https://github.com/xgr-network/xgr-node/blob/e6fecf8de08e7261afb24014b3d2d56ccbc8eb40/interchain/evm/iln_direct_operation.go), [Node iln_registry.go](https://github.com/xgr-network/xgr-node/blob/e6fecf8de08e7261afb24014b3d2d56ccbc8eb40/interchain/evm/iln_registry.go#L338-L391).

### PRE-H07 – LOW, Defense in depth – Hyperlane Version im ISM selbst streng ablehnen

Der Node validiert Nachrichten-Version `3`, Hash und Größenlimit. Der Contract `XITADirectBLSISM` verifiziert Router/Domains/MessageID, weist aber Version `message[0] == 3` nicht gesondert als eigene unveränderliche Invariante aus. Auch wenn der Hyperlane-Mailbox-Pfad diese Version erwarten sollte, ist ein zusätzlicher enger Contract-Test sinnvoll.

**Maßnahme:** ISM-Negativtest für falsche Version und kaputtes Header-/ABI-Format; möglichst explizite Version-Assertion im ISM, wenn ohne Kompatibilitätsbruch möglich.

### PRE-D08 – LOW / Dokumentationsschulden

`contracts/README.md`, Teile von `services/admin/README.md` und `docs/XITA_SPEC_V315.md` beschreiben noch alte Merkle-/V2-/Deploy-Disabled-Zustände. Die neue `ProtocolFee`-Contract-Adresse wird teilweise unter historischer Bezeichnung `transport-merkle-hook` erfasst. Fehlende exakte Versions- und Deployment-Protokolldokumentation erschwert Nachvollziehbarkeit und Auditierbarkeit trotz korrekter neuer Kryptografie.

**Maßnahme:** Eine **einzige** freigegebene Direct-BLS-Spezifikation mit den belegten SHA, ABI-Daten, Architekturannahmen und Deploy-Reihenfolge, ohne aktive widersprechende Legacy-Pfade.

## Nachweisstand und noch offene Security-Gates

- [x] Auf gegenwärtigem Interchain-Main-Commit: `Validate` und `Native Interchain Contracts` erfolgreich.
- [x] Einzelne *echte positive kryptografische Vektoren* in `test/XGRInterchainBLSVerifier.t.sol` bestehen laut aktueller Foundry-CI; es handelt sich nicht nur um negative Mock-Tests.
- [x] Go ↔ Solidity-Payload-Konsistenz über `XITA_DIRECT_MESSAGE_V1` und Felder/Bytes im Node-Test vorhanden.
- [ ] **Noch offen:** Ziel-Chain-`eth_call` eines positiven und negativen EIP-2537-BLS-Vektors auf Base, Arbitrum und positiver nativer XGR-BLS-Vektor mit effektivem Gasbudget.
- [ ] **Noch offen:** **echtes, nicht gemocktes** End-to-End-Zusammenspiel `3 Validator-BLS-Keys → RegistryV3 → XITADirectBLSISM → Mailbox.process → realer Token Lock/Mint/Burn/Unlock` inklusive 2/3 und falscher Signature.
- [ ] **Noch offen:** Neue Direct-BLS-Release-Revision mit vollständigem node EEST/ForkGate; v3.3.1 ist ein **Light Release**, dessen Vollsuite nicht nachgewiesen ist.
- [ ] **Noch offen:** Ein echter Transfer in beide Richtungen sowie Zwei-Hop Base→XGRChain→Arbitrum, einer ohne GmbH-Relayer oder Service-Gebühr, vor/ nach Validator-Set-Rotation, Wiederholung bereits zugestellter Nachricht.
- [ ] **Noch offen:** Base/Arbitrum-Finalität gegen realen RPC prüfen, Reorg-Szenario als negative Sicherheitsannahme simulieren.
- [ ] **Noch offen:** Admin Transport-Bundle nachweisbar ausrollen, seine **eine** ProtocolFee-Adresse korrekt dokumentieren und nach Unterbrechung ohne zweite MetaMask-TX fortsetzen.
- [ ] **Noch offen:** Live-Receipt-/Runtime-Codehash/Owner-/Registry-/Mailbox-/Hook-/Gateway-Bindings für jeden neuen Chain-Deployment-Schritt nachweisen.

## Erste Deploy-Reihenfolge – ausschließlich nach Freigabe

1. Auf der vorgesehenen Chain BLS-Kapazität und die positiven/negativen Signaturvektoren gegen den tatsächlichen Netzwerkzustand nachweisen.
2. Bei EIP-2537-Chains neuen BLS-Verifier deployen und Codehash plus realen positiven/negativen Verifier-Aufruf prüfen; auf XGRChain den eingebauten komprimierten Verifier prüfen, nicht blind redeployen.
3. RegistryV3-Membership-Domänentrennung (PRE-S03) entscheiden und anschließend neue Registry mit geprüftem Bootstrap-BLS-Set, Reserven, Chain/Domain und Contract-Receipt deployen.
4. DirectBLSISM exakt an diese Registry binden und die aktiven Set-ID-/Inbounds-/BLS-Vektoren gegen genau dieses ISM prüfen.
5. **Vor dem Transport-Bundle PRE-D01 korrigieren**; neue Mailbox und genau einen gebührenfreien ProtocolFee-Hook deployen; unveränderliche Konfiguration/Receipts prüfen.
6. Native-/Synthetic-/Collateral-Router-Deployer, Factory, Source Registry und optional Execution Gateway gemäß freigegebener Provenienz deployen; keine hartcodierten oder alten Mainnet-Adressen wiederverwenden.
7. Erst nach Source- und Destination-Deployment mit echten Quorums erste Routes/Transaktionen freischalten.

## Verbindliche Einordnung

**Geltungsbereich:** XITA befindet sich noch in der aktiven Entwicklung. Vorherige Testdeployments werden verworfen; eine Migration älterer Testbestände ist ausdrücklich **nicht Gegenstand dieser Sicherheitsprüfung**. Es wird ausschließlich die neue Direct-BLS-Struktur und deren Erstdeployment auditiert.

**Voraudit-Urteil:** Die neue Direct-BLS-Signatur-/Receipt-Architektur ist gegenüber dem vorherigen Merkle-Ansatz qualitativ einfacher und besser überprüfbar. Es wurde bislang **keine unmittelbare beliebige Mint-Befugnis ohne 2/3 Quorum** festgestellt. Gleichwohl besteht **keine Freigabe für einen kompletten neuen Mainnet-Deploy-/Asset-Transfer-Betrieb**: PRE-D01 ist ein bestätigter operativer Deploy-Fehler, PRE-S02 und PRE-S03 sind vor irreversiblen Sicherheitsdeployments zu klären, und echte kryptografische Cross-Chain-E2E-Sicherheit ist noch nicht nachgewiesen.

Dies ist **keine externe unabhängige Prüfung**; der Bericht ist ein überprüfbares, signiertes (GitHub-Commit) Arbeitsdokument und ersetzt kein vollständiges Audit. Vorhandene Audit-Historie und den gefrorenen Altstand behalten, nicht löschen.
