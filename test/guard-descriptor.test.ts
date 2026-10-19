import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";

const exec=promisify(execFile);
let directory:string;
let script:string;
beforeAll(async()=>{
  directory=await mkdtemp(path.join(os.tmpdir(),"iterlay-guard-export-"));
  script=path.join(directory,"dist/main.mjs");
  await mkdir(path.dirname(script),{recursive:true});
  await build({entryPoints:["cli/src/main.ts"],bundle:true,platform:"node",format:"esm",outfile:script});
  await cp("resources/guard",path.join(directory,"guard"),{recursive:true});
});
afterAll(async()=>{await rm(directory,{recursive:true,force:true});});
describe("offline Guard source export",()=>{
  it("outputs the exact bundled descriptor without connecting to or launching an app",async()=>{
    const source=JSON.parse(await readFile("resources/guard/command.iterlay.json","utf8"));
    const {stdout,stderr}=await exec(process.execPath,[script,"guard","descriptor","--no-launch","--user-data-path",path.join(directory,"missing-workspace")]);
    expect(JSON.parse(stdout)).toEqual(source);
    expect(stderr).toBe("");
    expect(source).toMatchObject({schema:"guard.command-extension-source.v1",extension:{extension_id:"command.iterlay"}});
  });
  it("keeps the standard JSON response envelope and no runtime credentials",async()=>{
    const {stdout}=await exec(process.execPath,[script,"--json","guard","descriptor","--no-launch","--user-data-path",path.join(directory,"missing-workspace")]);
    expect(JSON.parse(stdout)).toMatchObject({schemaVersion:1,ok:true,data:{extension:{extension_id:"command.iterlay"}}});
    expect(stdout).not.toMatch(/Bearer |apiKeyByProviderId|local-api\.json/u);
  });
});
