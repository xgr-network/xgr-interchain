#!/usr/bin/env node
// Keyless scheduled gas-coin price refresh. Never called from HTTP handlers.
import {refreshGasPriceCache} from "./price-cache.mjs";
try{const result=await refreshGasPriceCache();console.log("Gas coin prices refreshed:",result.coins.join(","))}
catch(error){console.error("Gas coin price refresh failed:",String(error.message||error));process.exitCode=1}
