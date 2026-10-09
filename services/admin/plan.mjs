// Deterministic deployment graph: no arbitrary commands, private keys or governance bypass.
export const HUB=1643;
export const SUPPORTED=["xgrchain","base"];
const SCRIPT={
  verifier:"script/DeployXETA.s.sol:DeployXETAEIP2537Verifier",
  validatorRegistry:"script/DeployXETA.s.sol:DeployXETARegistryV2",
  sourceRegistry:"script/DeployXETA.s.sol:DeployXETAILNRegistry",
  ism:"script/DeployXETA.s.sol:DeployXETAISM",
  nativeRouter:"script/DeployXETARouters.s.sol:DeployXETANativeAssetRouter",
  syntheticRouter:"script/DeployXETARouters.s.sol:DeployXETASyntheticAssetRouter",
  gateway:"script/DeployXETA.s.sol:DeployXETAGateway"
};
function step(id,chain,kind,dependsOn,description,extra={}){
  return {id,chain,kind,dependsOn,description,...extra};
}
export function validateDeployTopology(catalog){
  if(catalog?.schemaVersion!==1)throw Error("Invalid catalog");
  const x=catalog?.chains?.xgrchain,base=catalog?.chains?.base;
  if(x?.chainId!==1643||x.domainId!==1643||base?.chainId!==8453||base.domainId!==8453)
    throw Error("Unexpected XETA hub or Base chain IDs");
  for(const name of SUPPORTED){
    const chain=catalog.chains[name],infra=catalog.infrastructure?.[name];
    if(!infra||infra.chainId!==chain.chainId||infra.domainId!==chain.domainId)
      throw Error("Chain infrastructure mismatch: "+name);
    for(const key of ["mailbox","merkleTreeHook"]){
      const v=infra.hyperlaneCore?.[key];
      if(typeof v!=="string"||!/^0x[0-9a-f]{40}$/i.test(v)||/^0x0{40}$/i.test(v))
        throw Error("Missing Hyperlane "+name+" "+key);
    }
  }
  const routes=catalog.assets?.XGR?.routes?.routes||[];
  for(const [name,source,dest] of [["xgr_to_base","xgrchain","base"],["base_to_xgr","base","xgrchain"]]){
    const route=routes.find(x=>x.name===name);
    if(!route||route.sourceChain!==source||route.destinationChain!==dest)
      throw Error("Missing expected XETA route "+name);
  }
  return true;
}
export function buildPlan(catalog){
  validateDeployTopology(catalog);
  const plan=[
    step("rpc_xgr","xgrchain","preflight",[],"Verify XGRChain RPC, canonical Mailbox and MerkleTreeHook code."),
    step("rpc_base","base","preflight",[],"Verify Base RPC, canonical Mailbox and MerkleTreeHook code."),
    step("bls_base","base","security",["rpc_base"],"Prove EIP-2537 precompile support on Base with independent positive and negative BLS test vectors. Never assume EVM compatibility proves it.",{mandatoryProof:true}),
    step("verifier_base","base","deploy",["bls_base"],"Deploy the dedicated EIP-2537 BLS verifier.",{script:SCRIPT.verifier}),
    step("registry_xgr","xgrchain","deploy",["rpc_xgr"],"Bootstrap destination ValidatorRegistryV2 with the actual active validator keys and possession proofs; use native XGR BLS verifier.",{script:SCRIPT.validatorRegistry,requires:["MEMBERSHIP_ORIGIN_CHAIN_ID","BLS_VERIFIER","BLS_VERIFIER_FORMAT","MINIMUM_DEACTIVATION_RESERVE_WEI","MAX_EXECUTOR_REIMBURSEMENT_WEI","INITIAL_RESERVE_WEI","VALIDATOR_COUNT","VALIDATOR_N_ADDRESS","VALIDATOR_N_BLS_COMPRESSED","VALIDATOR_N_BLS_EIP2537","VALIDATOR_N_POSSESSION_PROOF"]}),
    step("registry_base","base","deploy",["verifier_base"],"Bootstrap RegistryV2 using verified EIP-2537 verifier, active validator set and PoP.",{script:SCRIPT.validatorRegistry}),
    step("iln_xgr","xgrchain","deploy",["registry_xgr"],"Deploy source ILNRegistry bound to local RegistryV2.",{script:SCRIPT.sourceRegistry}),
    step("iln_base","base","deploy",["registry_base"],"Deploy source ILNRegistry bound to local RegistryV2.",{script:SCRIPT.sourceRegistry}),
    step("ism_xgr","xgrchain","deploy",["registry_xgr"],"Deploy route-aware destination ISM V2.",{script:SCRIPT.ism}),
    step("ism_base","base","deploy",["registry_base"],"Deploy route-aware destination ISM V2.",{script:SCRIPT.ism}),
    step("router_xgr","xgrchain","deploy",["iln_xgr","ism_xgr"],"Deploy one Gateway-only native XGR router.",{script:SCRIPT.nativeRouter}),
    step("router_base","base","deploy",["iln_base","ism_base"],"Deploy one zero-supply wXGR synthetic router.",{script:SCRIPT.syntheticRouter}),
    step("gateway_xgr","xgrchain","deploy",["router_xgr"],"Deploy source Gateway XGRChain to Base and its constructor-created FeeVault.",{script:SCRIPT.gateway}),
    step("gateway_base","base","deploy",["router_base"],"Deploy source Gateway Base to XGRChain and FeeVault.",{script:SCRIPT.gateway}),
    step("bindings","both","verify",["gateway_xgr","gateway_base"],"Verify router-owner security, source registry bindings, correct Gateway/FeeVault, destination ISM, fee quotes, and zero initial wXGR supply.",{mandatoryProof:true}),
    step("governance_xgr","xgrchain","governance",["bindings"],"Collect current XGRChain source validator 2/3 approvals and execute ROUTE_ADD through node CLI. Route becomes enabled upon execution.",{mandatoryProof:true}),
    step("bootstrap_xgr","xgrchain","bootstrap",["governance_xgr"],"Permissionlessly bootstrap XGRChain router toward Base using the approved route ID.",{mandatoryProof:true}),
    step("governance_base","base","governance",["bindings","bootstrap_xgr"],"Collect and execute Base source route quorum; never bypass local validator set.",{mandatoryProof:true}),
    step("bootstrap_base","base","bootstrap",["governance_base"],"Bootstrap Base router toward XGRChain; verify reciprocal router identities.",{mandatoryProof:true}),
    step("e2e_outbound","both","e2e",["bootstrap_base"],"Small XGR lock to Base wXGR mint: validate source receipt, quorum metadata and destination Mailbox delivery.",{mandatoryProof:true}),
    step("e2e_return","both","e2e",["e2e_outbound"],"Small wXGR burn to XGR unlock, validator fee claims, and permissionless replay-safe recovery.",{mandatoryProof:true}),
    step("publish","both","publish",["e2e_return"],"Only after independent on-chain evidence, write deployment manifests and activate XETA UI routes.",{mandatoryProof:true})
  ];
  const seen=new Set();
  for(const s of plan){
    if(seen.has(s.id)||s.dependsOn.some(d=>!seen.has(d)))throw Error("Invalid XETA deployment graph: "+s.id);
    seen.add(s.id);
  }
  return plan.map((s,index)=>({order:index+1,...s}));
}
export function renderStepCommand(item){
  if(!item.script)return null;
  const rpc=item.chain==="xgrchain"?"$XGR_RPC":"$BASE_RPC";
  const account=item.chain==="xgrchain"?"$XETA_XGR_ACCOUNT":"$XETA_BASE_ACCOUNT";
  return "forge script "+item.script+" --rpc-url \""+rpc+"\" --account \""+account+"\" --broadcast";
}
