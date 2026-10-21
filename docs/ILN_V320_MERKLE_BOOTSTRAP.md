# XGR-Node v3.2.0: one-time Merkle tree initialization

This console-only XITA tool bootstraps canonical Hyperlane Merkle leaf
replicas into an existing XGR-Node data directory. It does not modify
the blockchain, deploy any contract, sign a BLS vote, or require v3.2.1.

## Prerequisites

Node.js 20+; the current xgr-interchain checkout; an existing absolute
XGR-Node data directory; and a source RPC supporting confirmed Hook state
plus historical InsertedIntoTree event logs from the documented Hook
deployment. Base public RPC providers may prune such historical queries.
Select a capable provider through --rpc. Back up the node data dir.

## Usage

First run the complete read-only verification:

    cd ~/repos/xgr-interchain
    ./manage.sh init-merkle --chain base \
      --data-dir /ABSOLUTE/PATH/TO/XGR-DATADIR \
      --rpc https://mainnet.base.org --chunk-size 250 --dry-run

If successful, stop **only the validator whose data dir will be written**,
then run the same command without --dry-run:

    ./manage.sh init-merkle --chain base \
      --data-dir /ABSOLUTE/PATH/TO/XGR-DATADIR \
      --rpc https://mainnet.base.org --chunk-size 250

Initialize the other existing source Hook as well:

    ./manage.sh init-merkle --chain xgrchain \
      --data-dir /ABSOLUTE/PATH/TO/XGR-DATADIR \
      --rpc https://rpc.xgr.network

To insist on a particular pending transfer, also supply
--expect-message-id with its complete actual 0x-prefixed 32-byte message ID.

Arbitrum is also supported once its MerkleTreeHook has at least one confirmed
insertion. Run a dry-run first using a source RPC capable of historical
`InsertedIntoTree` log reads:

    ./manage.sh init-merkle --chain arbitrum \
      --data-dir /ABSOLUTE/PATH/TO/XGR-DATADIR \
      --rpc https://arb1.arbitrum.io/rpc --chunk-size 250 --dry-run

For count=0, the tool reports `status: "empty-hook-no-replica"` and
writes no file. Initialize the Merkle replica after the first confirmed
source-chain message. The source's correct Merkle root will be verified
during seeding; it is not a fixed value to copy into node.conf.

The Base/XGR/Arbitrum output files are written at:

    <DATADIR>/interchain/iln/replicas/8453/0xa831991450e2a150951da8c2f3344f940603c714.json
    <DATADIR>/interchain/iln/replicas/1643/0x44a8374cf1ff674a92a6876832af245b805e2161.json
    <DATADIR>/interchain/iln/replicas/42161/0x1b9df66feafaf7f4d49b39abbeccc7146cd27f70.json

These files contain the complete ordered 32-byte message-hash leaves and
the confirmed checkpoint root/count. Their exact format matches XGR-Node
v3.2.0. No wallet keys or serialized message bodies are stored in this JSON.

## Safety and availability

- Run --dry-run first. It never writes local files.
- Every insertion must be contiguous from index zero; incomplete, malformed
  or reordered events are rejected.
- The tool checks chain ID, immutable deployed runtime bytecode, confirmed
  Hook mailbox, count, 32-level reconstructed root and stable checkpoint hash.
  Nothing is written on a mismatch or missing historical RPC data.
- If the validator has an active heartbeat, writes are blocked.
- Existing divergent snapshots are preserved. --replace is explicit and
  creates a backup. Do not use it while a validator runs.
- Writes are atomic (temporary file, fsync, rename).
- Source RPCs may require smaller log ranges; the initializer recursively
  splits rejected ranges, but never skips or invents blocks.
- Start the seeded validator and check xgr_getILNIndexerStatus. Other
  validators can fetch bounded verified leaf chunks via v3.2.0 libp2p.
  Avoid taking all PoS validators offline simultaneously.
- The Merkle root cannot reconstruct missing historical leaves. Seed at
  least one intact source first or restore from verified backups.
- A Merkle replica does not contain the full serialized Mailbox message.
  Pending delivery also requires the original source Dispatch bytes,
  current destination BLS quorum and successful Mailbox.process.staticCall.

## XITA recovery

The accompanying XITA recovery patch obtains Merkle siblings using the
public xgr_getILNReplicaProof RPC, distinguishes the original Gateway
transaction block from the signed checkpoint epoch and checks the
immutable FeeVault allocation. Source fees can legitimately change
between original dispatch and checkpoint signing.

No second Lock/Burn or contract redeployment is required just to try the
existing pending 0.5-wXGR recovery. A successful complete live
Mailbox.process.staticCall still has to confirm actual deliverability.
