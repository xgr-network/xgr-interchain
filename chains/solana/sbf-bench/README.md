# XITA Direct-BLS SBFv3 / Agave 4.x feasibility probe

**Independent, experimental benchmark only. Not a bridge program.**

This sandbox implements the existing XGRChain MinPk BLS12-381 scheme using
Solana native group/pairing syscalls (SIMD-0388) and an on-chain *verified*
RFC9380 G2-hash witness. XGR's **unchanged DST**
`BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_` is compulsory.

- Input: 839 bytes, contains 3 compressed 48-byte G1 keys,
  96-byte compressed aggregate G2 signature, a 96-byte hash-to-G2 witness
  and the complete **501-byte canonical XITA Solana Direct message**.
- Auth: big-endian bitmap 2-of-3 quorum; all keys checked against duplicates
  and bad curve encodings, witness bound cryptographically to the signed bytes,
  native pairing equation checked in the program.
- Reply: returns one byte `1` on successful cryptographic verification.
- **No state, owner, upgrade, program governance, token, custody or minting
  controls.** Arbitrary caller-supplied keys are acceptable for a *benchmark*
  only; this sandbox MUST NOT be used as a source of authority.
- Success and adversarial replay/tampering tests run **inside Mollusk**, with
  explicit CU measurements and a limit of 1.4M CU. No RPC and no SOL needed.

The hash-to-G2 witness implementation is pinned to
`crypt0miester/bls12-381-hash@e1b6e50fee3b1a9d73ac5863e012c5836655c57b` for
**exploration only**. It is not audited for XITA. Source:
https://github.com/crypt0miester/bls12-381-hash .

## Run (Linux / Agave 4.x)

```bash
cd chains/solana/sbf-bench
cargo test -p xita-bls-sbf-probe --lib
cd program
cargo build-sbf --arch v3
cd ..
cargo test -p xita-bls-sbf-probe-tests --test xita_bls -- --nocapture
```

The SBF program binary is expected at
`chains/solana/sbf-bench/target/deploy/xita_bls_sbf_probe.so`.

**Release gate:** A successful benchmark confirms only the crypto/CU
feasibility in the tested Solana runtime. Before connecting XITA transfers:
authenticate the current XGR validator-set PDA and PoP-controlled transitions,
verify source custody and route, ensure correct replay and fee accounting, do
an independent review of the hash-to-G2 witness, and re-benchmark the complete
gateway path. Do not change existing EVM V315 wire formats.
