import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stateSignature } from "./storage-safety.mjs";

test("Firestore map ordering does not cause conflicts; values and arrays still do", () => {
  const local = { tasks: [{ id: 1, title: "test", nested: { z: 1, a: 2 } }], notes: "note", updatedAt: 1 };
  const remote = { updatedAt: 1, notes: "note", tasks: [{ nested: { a: 2, z: 1 }, title: "test", id: 1 }] };
  assert.equal(stateSignature(local), stateSignature(remote));
  for (const changed of [
    { ...remote, notes: "changed" },
    { ...remote, updatedAt: 2 },
    { ...remote, tasks: [] },
    { ...remote, worklist: [{ id: 2 }] },
    { ...remote, tasks: [{ ...remote.tasks[0], title: "changed" }] },
    { ...remote, tasks: [{ ...remote.tasks[0], nested: { z: 3, a: 2 } }] },
  ]) assert.notEqual(stateSignature(local), stateSignature(changed));
  assert.notEqual(stateSignature({ tasks: [1, 2] }), stateSignature({ tasks: [2, 1] }));
});

test("repeated saves survive Firestore normalization and protect real concurrent edits", async () => {
  const appSource = readFileSync(new URL("./script.js", import.meta.url), "utf8");
  const signatureSource = readFileSync(new URL("./storage-safety.mjs", import.meta.url), "utf8").replace(/export \{[^}]+\};/, "");
  const saveFunctions = appSource.slice(appSource.indexOf("function setSyncWarning"), appSource.indexOf("async function loadFromFirestore"));
  const navigationGuard = appSource.slice(appSource.indexOf('window.addEventListener("beforeunload"'), appSource.indexOf("// ---------- 초기화 ----------"));
  assert.ok(saveFunctions && navigationGuard);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction(`
${signatureSource}
let currentUser={uid:"test-user"},isDataReady=true,saveBlocked=false,saving=false;
let authGeneration=1,pendingChanges=0,savedRevision=0,saveTimer=null,lastLoadedTime=1;
let tasks=[],worklist=[],db={},errors=[];
const notes={value:"initial"},note={textContent:"",hidden:true};
const document={getElementById:id=>id==="notesArea"?notes:note};
const clone=x=>JSON.parse(JSON.stringify(x));
const sorted=x=>JSON.parse(JSON.stringify(x,(_k,v)=>v&&typeof v==="object"&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v));
let remote={tasks:[],worklist:[],notes:"initial",updatedAt:1};
let loadedSignature=stateSignature(remote);
const console={error:(...args)=>errors.push(args)};
const setTimeout=()=>1,clearTimeout=()=>{};
const doc=()=>({});
const runTransaction=async (_db,callback)=>{let next; await callback({get:async()=>({exists:()=>true,data:()=>clone(remote)}),update:(_ref,value)=>{next=value;}}); if(next) remote=sorted({...remote,...next});};
let beforeUnload;
const window={addEventListener:(_name,callback)=>{beforeUnload=callback;}};
${saveFunctions}
${navigationGuard}
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const leaving=()=>{let prevented=false;beforeUnload({preventDefault:()=>{prevented=true;},returnValue:undefined});return prevented;};
tasks.push({id:1,title:"test schedule",time:null,category:"개인",done:false,date:"2026-10-17"});
scheduleSave();assert(leaving(),"Warn for pending debounce");
await saveToFirestore();assert(!saveBlocked&&remote.tasks.length===1,"first add persisted");
assert(!leaving()&&note.textContent==="저장 완료","acknowledged save permits navigation");
notes.value="edited note";scheduleSave();await saveToFirestore();
assert(!saveBlocked&&remote.notes==="edited note","second save after map sorting succeeds");
tasks.push({id:2,title:"second",time:null,category:"업무",done:false,date:"2026-10-18"});
scheduleSave();await saveToFirestore();
assert(!saveBlocked&&remote.tasks.length===2,"third save succeeds");
const reload=clone(remote);assert(reload.tasks.length===2&&reload.notes==="edited note","reload retains edits");
remote.notes="another user's newer edit";
notes.value="local conflicting edit";scheduleSave();await saveToFirestore();
assert(saveBlocked&&remote.notes==="another user's newer edit","real conflict still blocks overwrite");
assert(leaving(),"blocked unsaved edit warns before reload");
return "PASS: repeated saves, Firestore map reorder, reload retention, save indicator, pending-refresh warning, true-conflict protection";
`)();
});
