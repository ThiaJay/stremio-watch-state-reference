import fs from "node:fs";
import {buildBulkPlan,validateBulkApply,reconcile} from "./reference.js";
const command=process.argv[2];
const file=process.argv[3];
if(!command||!file){console.log("Usage: node src/cli.js reconcile|bulk-plan|bulk-validate <input.json>");process.exit(0);}
const input=JSON.parse(fs.readFileSync(file,"utf8"));
const result=command==="reconcile"
  ? reconcile(input.previous??null,input.stremio,input.trakt,input.policy,input.observations,input.now)
  : command==="bulk-plan"
    ? buildBulkPlan(input)
    : command==="bulk-validate"
      ? validateBulkApply(input.plan,input.current)
      : (()=>{throw new Error("UNKNOWN_COMMAND")})();
console.log(JSON.stringify(result,null,2));
