import test from "node:test";
import assert from "node:assert/strict";
import {keccak256,selector} from "./keccak.js";
import {sourceBoundMailboxProcess} from "./mailbox-process.js";
const word=n=>BigInt(n).toString(16).padStart(64,"0");
const message="0x"+"42".repeat(90);
const bytes=Uint8Array.from(message.slice(2).match(/.{2}/g),x=>parseInt(x,16));
const id=keccak256(bytes);
const dynamic=h=>word(h.length/2)+h.padEnd(Math.ceil(h.length/64)*64,"0");
function calldata(meta="abcdef",body=message.slice(2)){
 const m=dynamic(meta),b=dynamic(body);
 return selector("process(bytes,bytes)")+word(64)+word(64+m.length/2)+m+b;
}
test("canonical destination calldata is cryptographically bound to source message ID",()=>{
 assert.equal(sourceBoundMailboxProcess(calldata(),id).messageId,id);
});
test("different inner message rejected with identical outer source ID",()=>{
 assert.throws(()=>sourceBoundMailboxProcess(calldata("abcdef","41".repeat(90)),id),/does not match/);
});
test("reject forged offsets, trailing bytes and padding",()=>{
 const data=calldata();
 for(const invalid of [
  data.slice(0,10)+word(32)+data.slice(74),
  data.slice(0,74)+word(96)+data.slice(138),
  data+"00".repeat(32),
  data.slice(0,-2)+"ff"
 ])assert.throws(()=>sourceBoundMailboxProcess(invalid,id));
});
export {id,message,calldata};
