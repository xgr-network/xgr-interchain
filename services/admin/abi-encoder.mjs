// Minimal, strict ABI encoder for the constructors used by XITA v3.1.5.
// No browser-supplied ABI, selectors, constructor arguments or arbitrary calls.
const UINT=/^uint(8|32|64|256)$/;
const HASH=/^0x[0-9a-f]{64}$/i;
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const BYTES=/^0x(?:[0-9a-fA-F]{2})*$/;
const word=n=>{
 const v=BigInt(n);
 if(v<0n||v>=(1n<<256n))throw Error("ABI uint256 overflow");
 return v.toString(16).padStart(64,"0");
};
const dynamic=t=>t==="bytes"||t==="address[]"||t==="bytes[]";
const address=a=>{
 if(!ADDRESS.test(a||""))throw Error("Malformed ABI address");
 return a.slice(2).toLowerCase().padStart(64,"0");
};
const uint=(type,value)=>{
 if(!UINT.test(type))throw Error("Unsupported ABI uint type");
 if(typeof value!=="bigint" && (typeof value!=="number"||!Number.isSafeInteger(value))&&
    (typeof value!=="string"||!/^(0|[1-9][0-9]*)$/.test(value)))
  throw Error("Malformed ABI unsigned integer");
 const n=BigInt(value),bits=BigInt(type.slice(4));
 if(n<0n||n>=(1n<<bits))throw Error("Unsigned integer exceeds "+type);
 return word(n);
};
const hexBytes=s=>{
 if(!BYTES.test(s||""))throw Error("Malformed ABI bytes");
 return s.slice(2).toLowerCase();
};
const bytesChunk=value=>{
 const h=hexBytes(value);
 return word(h.length/2)+h.padEnd(Math.ceil(h.length/64)*64,"0");
};
const dynamicChunk=(type,value)=>{
 if(type==="bytes")return bytesChunk(value);
 if(!Array.isArray(value)||value.length>1024)throw Error("Invalid ABI dynamic array");
 if(type==="address[]")return word(value.length)+value.map(address).join("");
 if(type==="bytes[]"){
  const values=value.map(bytesChunk);
  let offset=value.length*32;
  const heads=values.map(chunk=>{
   const h=word(offset);offset+=chunk.length/2;return h;
  });
  return word(value.length)+heads.join("")+values.join("");
 }
 throw Error("Unsupported dynamic ABI type: "+type);
};
export function encodeAbi(types,values){
 if(!Array.isArray(types)||!Array.isArray(values)||types.length!==values.length||types.length>32)
  throw Error("ABI signature and constructor values mismatch");
 let offset=32*types.length;
 const tails=[];
 const heads=types.map((type,i)=>{
  if(dynamic(type)){
   const tail=dynamicChunk(type,values[i]);const head=word(offset);
   offset+=tail.length/2;tails.push(tail);return head;
  }
  if(type==="bytes32"){
   if(!HASH.test(values[i]||""))throw Error("Invalid ABI bytes32");
   return values[i].slice(2).toLowerCase();
  }
  return type==="address"?address(values[i]):uint(type,values[i]);
 });
 return "0x"+heads.join("")+tails.join("");
}
export function encodeFunctionCall(signature,types,values,selector){
 if(typeof signature!=="string"||typeof selector!=="function"||
    !/^[_a-zA-Z][_a-zA-Z0-9]*\([a-zA-Z0-9,\[\]]*\)$/.test(signature))
  throw Error("Invalid contract function signature");
 const data=selector(signature);
 if(!/^0x[0-9a-f]{8}$/i.test(data))throw Error("Bad ABI selector");
 return data+encodeAbi(types,values).slice(2);
}
