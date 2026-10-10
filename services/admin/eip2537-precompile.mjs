// Exact public EIP-2537 test vectors, run via read-only JSON-RPC eth_call.
// Source: https://eips.ethereum.org/assets/eip-2537/test-vectors
// NOT a validator BLS proof verifier and NOT deployment authorization.
const FIELD = x => {
  if (!/^[0-9a-f]{96}$/i.test(x)) throw Error("Malformed EIP-2537 field element");
  return x.padStart(128, "0").toLowerCase();
};
const G1 = [
  "17f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb",
  "08b3f481e3aaa0f1a09e30ed741d8ae4fcf5e095d5d00af600db18cb2c04b3edd03cc744a2888ae40caa232946c5e7e1"
].map(FIELD).join("");
const G2 = [
  "024aa2b2f08f0a91260805272dc51051c6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb8",
  "13e02b6052719f607dacd3a088274f65596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e",
  "0ce5d527727d6e118cc9cdc6da2e351aadfd9baa8cbdd3a76d429a695160d12c923ac9cc3baca289e193548608b82801",
  "0606c4a02ea734cc32acd2b02bc28b99cb3e287e85a763af267492ab572e99ab3f370d275cec1da1aaa9075ff05f79be"
].map(FIELD).join("");
const Z1 = "0".repeat(256);
const Z2 = "0".repeat(512);
const address = n => "0x" + BigInt(n).toString(16).padStart(40, "0");
const boolWord = n => "0x" + String(n).padStart(64, "0");
export const EIP2537_VECTORS = Object.freeze([
  {name:"G1ADD generator + identity",to:address(0x0b),data:"0x"+G1+Z1,expected:"0x"+G1},
  {name:"G2ADD generator + identity",to:address(0x0d),data:"0x"+G2+Z2,expected:"0x"+G2},
  {name:"PAIRING generator non-identity",to:address(0x0f),data:"0x"+G1+G2,expected:boolWord(0)},
  {name:"PAIRING identity",to:address(0x0f),data:"0x"+G1+Z2,expected:boolWord(1)}
].map(Object.freeze));
export async function probeEip2537Precompiles(rpc,url) {
  if(typeof rpc !== "function" || typeof url !== "string" || !url.startsWith("https://"))
    throw Error("Invalid EIP-2537 RPC");
  for(const v of EIP2537_VECTORS){
    const result=await rpc(url,"eth_call",[{to:v.to,data:v.data,gas:"0x1e8480"},"latest"]);
    if(typeof result!=="string"||result.toLowerCase()!==v.expected)
      throw Error("EIP-2537 positive/negative precompile vector mismatch: "+v.name);
  }
  // Invalid wire input MUST revert; an empty EOA response cannot pass.
  let malformedRejected=false;
  try {
    await rpc(url,"eth_call",[{to:address(0x0b),data:"0x01",gas:"0x1e8480"},"latest"]);
  }catch{malformedRejected=true}
  if(!malformedRejected)throw Error("EIP-2537 malformed G1ADD call was not rejected");
  return {vectorsPassed:EIP2537_VECTORS.length,malformedRejected:true};
}
