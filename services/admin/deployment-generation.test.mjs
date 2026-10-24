import test from "node:test";
import assert from "node:assert/strict";
import {isPreResetIntent,RESET_COMMIT} from "./deployment-generation.mjs";

const old="a".repeat(40),current="b".repeat(40);
const entry=sourceCommit=>({sourceCommit});
function git(entries){
 return args=>{
  if(args[0]==="cat-file")return entries.includes(args[2].split("^")[0])?0:1;
  if(args[0]==="merge-base")return args[3]===old?1:0;
  throw Error("Unexpected Git operation");
 };
}
test("pre-reset deployment WAL is ignored only with proven Git ancestry",()=>{
 assert.equal(isPreResetIntent("/repo",entry(old),{run:git([RESET_COMMIT,old,current])}),true);
 assert.equal(isPreResetIntent("/repo",entry(current),{run:git([RESET_COMMIT,old,current])}),false);
});
test("unknown, pruned or malformed Git history cannot retire an intent",()=>{
 assert.equal(isPreResetIntent("/repo",entry(old),{run:git([RESET_COMMIT])}),false);
 assert.equal(isPreResetIntent("/repo",entry(old),{run:git([])}),false);
 assert.equal(isPreResetIntent("/repo",entry("not-a-commit"),{run:git([RESET_COMMIT,old])}),false);
 assert.equal(isPreResetIntent("/repo",entry(old),{run:()=>128}),false);
});
