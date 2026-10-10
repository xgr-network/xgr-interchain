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
const MAP_INPUT =
  "0000000000000000000000000000000007355d25caf6e7f2f0cb2812ca0e513bd026ed09dda65b177500fa31714e09ea0ded3a078b526bed3307f804d4b93b04" +
  "0000000000000000000000000000000002829ce3c021339ccb5caf3e187f6370e1e2a311dec9b75363117063ab2015603ff52c3d3b98f19c2f65575e99e8b78c";
const MAP_EXPECTED =
  "0000000000000000000000000000000000e7f4568a82b4b7dc1f14c6aaa055edf51502319c723c4dc2688c7fe5944c213f510328082396515734b6612c4e7bb7" +
  "00000000000000000000000000000000126b855e9e69b1f691f816e48ac6977664d24d99f8724868a184186469ddfd4617367e94527d4b74fc86413483afb35b" +
  "000000000000000000000000000000000caead0fd7b6176c01436833c79d305c78be307da5f6af6c133c47311def6ff1e0babf57a0fb5539fce7ee12407b0a42" +
  "000000000000000000000000000000001498aadcf7ae2b345243e281ae076df6de84455d766ab6fcdaad71fab60abb2e8b980a440043cd305db09d283c895e3d";
const address = n => "0x" + BigInt(n).toString(16).padStart(40, "0");
const boolWord = n => "0x" + String(n).padStart(64, "0");
export const EIP2537_VECTORS = Object.freeze([
  {name:"G1ADD generator + identity",to:address(0x0b),data:"0x"+G1+Z1,expected:"0x"+G1},
  {name:"G2ADD generator + identity",to:address(0x0d),data:"0x"+G2+Z2,expected:"0x"+G2},
  {name:"PAIRING generator non-identity",to:address(0x0f),data:"0x"+G1+G2,expected:boolWord(0)},
  {name:"PAIRING identity",to:address(0x0f),data:"0x"+G1+Z2,expected:boolWord(1)},
  {name:"MAP_FP2_TO_G2 published vector",to:address(0x11),data:"0x"+MAP_INPUT,expected:"0x"+MAP_EXPECTED}
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
