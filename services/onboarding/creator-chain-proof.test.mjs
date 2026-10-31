import test from "node:test";
import assert from "node:assert/strict";
import {Interface,keccak256} from "ethers";
import {creatorFactoryInterface,creatorTokenInterface,verifyCreatorReceiptOnRPC,verifyCreatorAcrossRPCs} from "./creator-chain-proof.mjs";
const owner="0x1234567890123456789012345678901234567890",factoryAddress="0x1111111111111111111111111111111111111111",operator="0x2222222222222222222222222222222222222222",token="0x3333333333333333333333333333333333333333";
const hash="0x"+"a".repeat(64),input={name:"Creator Example",symbol:"CREA",initialSupply:"10000",ownerAddress:owner};
const f={address:factoryAddress,runtimeCodeKeccak256:keccak256("0x60016000"),tokenRuntimeCodeKeccak256:keccak256("0x60026000")};
const supply=10000n*10n**18n;
function mock({badOwner=false,badFactory=false,unfinalized=false}={}){
 const data=creatorFactoryInterface.encodeFunctionData("createToken",[input.name,input.symbol,supply,owner]);
 const event=creatorFactoryInterface.encodeEventLog(creatorFactoryInterface.getEvent("TokenCreated"),[operator,token,owner,input.name,input.symbol,supply]);
 const tx={to:factoryAddress,from:operator,hash,input:data,value:"0x0",blockHash:"0x"+"9".repeat(64)};
 const receipt={to:factoryAddress,from:operator,transactionHash:hash,status:"0x1",
  blockHash:tx.blockHash,blockNumber:"0x64",logs:[{address:factoryAddress,topics:event.topics,data:event.data}]};
 return async(method,params)=>{
  if(method==="eth_chainId")return "0x66b";
  if(method==="eth_getCode")return params[0].toLowerCase()===factoryAddress.toLowerCase()?
   (badFactory?"0x00":"0x60016000"):"0x60026000";
  if(method==="eth_getTransactionReceipt")return receipt;
  if(method==="eth_getTransactionByHash")return tx;
  if(method==="eth_blockNumber")return unfinalized?"0x64":"0x66";
  if(method==="eth_call"){
   const fn=creatorTokenInterface.parseTransaction({data:params[0].data});
   let val;
   if(fn.name==="owner")val=badOwner?operator:owner;
   else if(fn.name==="totalSupply")val=supply;
   else if(fn.name==="balanceOf")val=fn.args[0].toLowerCase()===owner.toLowerCase()?supply:0n;
   else if(fn.name==="name")val=input.name;
   else if(fn.name==="symbol")val=input.symbol;
   else if(fn.name==="decimals")val=18;
   return creatorTokenInterface.encodeFunctionResult(fn.name,[val]);
  }
  throw Error("Unexpected RPC "+method);
 };
}
test("verify independently checks signed factory calldata, ERC20 code, supply and designated owner",async()=>{
 const proof=await verifyCreatorReceiptOnRPC({rpc:mock(),input,txHash:hash,factory:f});
 assert.equal(proof.ownerAddress,owner.toLowerCase());
 assert.equal(proof.tokenAddress,token.toLowerCase());
 assert.equal(proof.blockNumber,100);
});
test("wrong owner, factory bytecode, nonfinal receipts and conflicting nodes never publish Join",async()=>{
 for(const opts of [{badOwner:true},{badFactory:true},{unfinalized:true}])
  await assert.rejects(()=>verifyCreatorReceiptOnRPC({rpc:mock(opts),input,txHash:hash,factory:f}));
 await assert.rejects(()=>verifyCreatorAcrossRPCs({input,txHash:hash,factory:f,
  urls:["https://a.example.org","https://b.example.org"],
  call:(url,method,params)=>mock(url.includes("b.")?{badOwner:true}:{})(method,params)}));
});
