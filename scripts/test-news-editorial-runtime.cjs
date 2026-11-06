// Execute the actual TypeScript news validator offline in Vercel CI.
// No Anthropic requests, Webz searches, or database writes.
const fs=require("node:fs");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");
const assert=require("node:assert/strict");
const filename=path.resolve("scripts/lib/playerNewsEditorial.ts");
const compiled=ts.transpileModule(fs.readFileSync(filename,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  reportDiagnostics:true
});
const fatal=(compiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
assert.equal(fatal.length,0, "Editorial TypeScript must transpile cleanly");
const mod=new Module(filename,module);
mod.filename=filename;
mod.paths=Module._nodeModulePaths(path.dirname(filename));
mod._compile(compiled.outputText,filename);
const validate=mod.exports.validateNewsEditorial;
assert.equal(typeof validate,"function");
const source=[
 "The Athletics declined Jeff McNeil's team option, opening second base.",
 "Las Vegas Aviators shortstop Drew Swift is among the players under consideration.",
 "The report also names Jacob Wilson and Leo De Vries as other possibilities.",
 "No promotion or starting appointment was announced."
].join(" ");
const input={playerName:"Drew Swift",highSchool:"Hamilton High School",classOf:"2019",
 currentTeam:"Las Vegas Aviators",currentOrg:"Athletics",sourceTitle:"Athletics weigh options",
 sourceName:"Example",sourceUrl:"https://example.com/sports",publishedAt:"2026-11-01",articleText:source};
const good={decision:"publish",headline:"Drew Swift in contention as Athletics weigh second-base options",
 recap:"Drew Swift has emerged as one of the possible solutions at second base for the Athletics after the club declined Jeff McNeil's option. The Hamilton alumnus is one of several players named in the report, which does not announce a promotion or a decision about who will start. His situation remains an opportunity rather than a confirmed major-league assignment.",
 newsworthiness:"FEATURED",evidence_quotes:[
 "Las Vegas Aviators shortstop Drew Swift is among the players under consideration.",
 "The Athletics declined Jeff McNeil's team option, opening second base."
 ]};
assert.equal(validate(good,input)?.kind,"story");
assert.equal(validate({...good,recap:"Drew Swift gets a mention in this article."},input),null);
assert.equal(validate({...good,headline:"Drew Swift is promoted to the majors"},input),null);
assert.equal(validate({...good,evidence_quotes:["A claim not present in source"]},input),null);
assert.equal(validate({...good,decision:"skip"},input),null);
assert.equal(validate(good,{...input,articleText:"An unrelated player is mentioned."}),null);
console.log("PASS: actual AI editorial validator enforces source quotes, identity, original writing and promotion certainty");