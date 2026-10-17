// Dependency-free Keccak-256 for Ethereum ABI selectors and event signatures.
// Ethereum uses legacy Keccak padding, not FIPS SHA3-256.
const MASK = (1n << 64n) - 1n;
const ROT = [0,1,62,28,27,36,44,6,55,20,3,10,43,25,39,41,45,15,21,8,18,2,61,56,14];
const RC = [
  0x0000000000000001n,0x0000000000008082n,0x800000000000808an,0x8000000080008000n,
  0x000000000000808bn,0x0000000080000001n,0x8000000080008081n,0x8000000000008009n,
  0x000000000000008an,0x0000000000000088n,0x0000000080008009n,0x000000008000000an,
  0x000000008000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,
  0x8000000000008002n,0x8000000000000080n,0x000000000000800an,0x800000008000000an,
  0x8000000080008081n,0x8000000000008080n,0x0000000080000001n,0x8000000080008008n
];
function rot(v, n) {
  return n === 0 ? v : ((v << BigInt(n)) | (v >> BigInt(64 - n))) & MASK;
}
function permutation(a) {
  for (const rc of RC) {
    const c = Array.from({length: 5}, (_,x) => a[x] ^ a[x+5] ^ a[x+10] ^ a[x+15] ^ a[x+20]);
    for (let x=0;x<5;x++) {
      const d = c[(x+4)%5] ^ rot(c[(x+1)%5], 1);
      for (let y=0;y<5;y++) a[x+5*y] = (a[x+5*y] ^ d) & MASK;
    }
    const b = Array(25).fill(0n);
    for(let x=0;x<5;x++) for(let y=0;y<5;y++) {
      const i = x+5*y;
      b[y+5*((2*x+3*y)%5)] = rot(a[i], ROT[i]);
    }
    for(let x=0;x<5;x++) for(let y=0;y<5;y++) {
      a[x+5*y] = (b[x+5*y] ^ ((~b[(x+1)%5+5*y]) & b[(x+2)%5+5*y])) & MASK;
    }
    a[0] = (a[0] ^ rc) & MASK;
  }
}
export function keccak256(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  if (!(bytes instanceof Uint8Array)) throw new TypeError("Keccak expects UTF-8 text or Uint8Array");
  const rate = 136;
  const len = Math.ceil((bytes.length + 1) / rate) * rate || rate;
  const padded = new Uint8Array(len);
  padded.set(bytes);
  padded[bytes.length] = 0x01;
  padded[len-1] |= 0x80;
  const state = Array(25).fill(0n);
  for(let offset=0;offset<len;offset+=rate) {
    for(let i=0;i<rate;i++) {
      state[Math.floor(i/8)] ^= BigInt(padded[offset+i]) << BigInt(8*(i%8));
    }
    permutation(state);
  }
  const out = new Uint8Array(32);
  for(let i=0;i<32;i++) out[i] = Number((state[Math.floor(i/8)] >> BigInt(8*(i%8))) & 255n);
  return "0x" + Array.from(out, x => x.toString(16).padStart(2,"0")).join("");
}
export function selector(signature) {
  return keccak256(signature).slice(0,10);
}
