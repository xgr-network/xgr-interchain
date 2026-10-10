import test from "node:test";
import assert from "node:assert/strict";
import {resolveForgeExecutable} from "./forge-tooling.mjs";
test("systemd restricted PATH resolves actual service account Foundry home",()=>{
 const f=resolveForgeExecutable({env:{PATH:"/usr/bin",HOME:"/wrong",},
  userHome:"/home/xgradmin",systemPaths:[],
  isExecutable:x=>x==="/home/xgradmin/.foundry/bin/forge"});
 assert.equal(f,"/home/xgradmin/.foundry/bin/forge");
});
test("server-only explicit binary takes precedence over PATH",()=>{
 assert.equal(resolveForgeExecutable({env:{XITA_FORGE_BIN:"/opt/foundry/forge",PATH:"/usr/bin"},
  userHome:"/home/xgradmin",isExecutable:x=>x==="/opt/foundry/forge"}),"/opt/foundry/forge");
});
test("reject relative, nonexistent or unexecutable override",()=>{
 for(const path of ["forge","/not/installed/forge",""]){
  assert.throws(()=>resolveForgeExecutable({env:{XITA_FORGE_BIN:path},
   userHome:"/home/xgradmin",isExecutable:()=>false}),/XITA_FORGE_BIN/);
 }
});
test("unavailable binary reports actionable service configuration error",()=>{
 assert.throws(()=>resolveForgeExecutable({env:{PATH:"/nonexistent",HOME:"/bad"},
  userHome:"/home/xgradmin",systemPaths:[],isExecutable:()=>false}),
  /Foundry Forge is not executable/);
});
