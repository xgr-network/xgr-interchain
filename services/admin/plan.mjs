// Deterministic deployment graph: no arbitrary commands, private keys or governance bypass.
export const HUB=1643;
export const SUPPORTED=["xgrchain","base"];
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
    // Transport remains a separate future deployment gate. The plan API
    // must remain readable while no historical Mailbox/Hook is configured.
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
    step("rpc_xgr","xgrchain","preflight",[],"Verify XGRChain RPC; new XITA transport is not yet deployed."),
    step("rpc_base","base","preflight",[],"Verify Base RPC; new XITA transport is not yet deployed."),
    step("bls_base","base","security",["rpc_base"],"Prove EIP-2537 positive and negative BLS vectors on Base.",{mandatoryProof:true}),
    step("verifier_base","base","deploy",["bls_base"],"Deploy the approved EIP-2537 verifier.",{component:"blsVerifier"}),
    step("registry_xgr","xgrchain","deploy",["rpc_xgr"],"Deploy V3 with verified XGR PoS keys and proof of possession.",{component:"validatorRegistry",mandatoryProof:true}),
    step("registry_base","base","deploy",["verifier_base"],"Deploy V3 with the verified BLS signer set.",{component:"validatorRegistry",mandatoryProof:true}),
    step("ism_xgr","xgrchain","deploy",["registry_xgr"],"Deploy asset-bound destination ISM.",{component:"ism"}),
    step("ism_base","base","deploy",["registry_base"],"Deploy asset-bound destination ISM.",{component:"ism"}),
    step("native_deployer_xgr","xgrchain","deploy",["registry_xgr"],"Deploy reusable, independent native router deployment module.",{component:"nativeRouterDeployer"}),
    step("synthetic_deployer_xgr","xgrchain","deploy",["registry_xgr"],"Deploy reusable, independent synthetic router module.",{component:"syntheticRouterDeployer"}),
    step("collateral_deployer_xgr","xgrchain","deploy",["registry_xgr"],"Deploy reusable, independent collateral router module.",{component:"collateralRouterDeployer"}),
    step("native_deployer_base","base","deploy",["registry_base"],"Deploy reusable, independent native router module.",{component:"nativeRouterDeployer"}),
    step("synthetic_deployer_base","base","deploy",["registry_base"],"Deploy reusable, independent synthetic router module.",{component:"syntheticRouterDeployer"}),
    step("collateral_deployer_base","base","deploy",["registry_base"],"Deploy reusable, independent collateral router module.",{component:"collateralRouterDeployer"}),
    step("factory_xgr","xgrchain","deploy",["ism_xgr","native_deployer_xgr","synthetic_deployer_xgr","collateral_deployer_xgr"],"Deploy small permissionless Factory using independently verified immutable modules.",{component:"factory"}),
    step("factory_base","base","deploy",["ism_base","native_deployer_base","synthetic_deployer_base","collateral_deployer_base"],"Deploy small permissionless Factory using independently verified immutable modules.",{component:"factory"}),
    step("iln_xgr","xgrchain","factory-call",["factory_xgr"],"Create the canonical source ILNRegistry via public Factory.deployRegistry().",{component:"sourceRegistry"}),
    step("iln_base","base","factory-call",["factory_base"],"Create the canonical source ILNRegistry via public Factory.deployRegistry().",{component:"sourceRegistry"}),
    step("router_xgr","xgrchain","factory-call",["iln_xgr"],"Deploy native XGR router via permissionless Factory."),
    step("router_base","base","factory-call",["iln_base"],"Deploy zero-supply wrapped XGR router via permissionless Factory."),
    step("register_xgr","xgrchain","factory-call",["router_xgr","router_base"],"Register the XGR-to-Base route; creates Gateway and FeeVault atomically, without validator vote."),
    step("register_base","base","factory-call",["register_xgr"],"Register Base-to-XGR reciprocal route; creates Gateway and FeeVault atomically, without validator vote."),
    step("bindings","both","verify",["register_base"],"Independently verify token identity, reciprocal router bindings, runtime and final receipts.",{mandatoryProof:true}),
    step("e2e_outbound","both","e2e",["bindings"],"Execute small XGR->Base transfer using message-specific BLS and Mailbox verification.",{mandatoryProof:true}),
    step("e2e_return","both","e2e",["e2e_outbound"],"Execute Base->XGR reverse transfer; verify replay resistance and fee claims.",{mandatoryProof:true}),
    step("publish","both","publish",["e2e_return"],"Publish independently verified contract addresses and routable UI state.",{mandatoryProof:true})
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
