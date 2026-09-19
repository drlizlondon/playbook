#!/usr/bin/env node
// The Reading Room — generator (manifest -> one self-contained HTML page).
//
// The problem this solves: AI coding sessions generate piles of Markdown
// (plans, specs, handovers, research notes) that you never get around to
// reading. This turns a catalog of those docs into ONE published, private
// HTML "reading queue" on claude.ai, grouped by category and sortable by
// date, with per-doc read state (keep / done / delete) that syncs across
// every device you view it on.
//
// It works by splitting three concerns that a hand-grown HTML file usually
// conflates:
//   - CONTENT  lives wherever it already lives on disk (the file at each
//              manifest entry's `path` is the source of truth). Nothing is
//              copied or moved.
//   - CATALOG  lives in the manifest JSON (hand-maintained: which docs are
//              in the room, their title / category / path).
//   - STATE    (keep/done/delete per doc) lives in the published artifact's
//              own `db` capability, written directly by the page. A tick is
//              therefore a single db write from inside your browser -- NOT a
//              republish -- so marking something read never fights the
//              artifact save-lock, and it syncs live to every signed-in
//              viewer of that artifact.
//
// This script only decides, at BUILD time, which docs get their full
// Markdown physically embedded: a doc whose last-known state is "keep" (or
// unknown -- a brand-new catalog entry never yet ticked) is embedded in
// full; a doc already "done" or "delete" is emitted as a metadata-only row
// (no body), so the page stays small by construction as you read things.
//
// The db is server-side and this is an offline script, so it cannot read
// live state itself. Pass a snapshot of the current db state as
// --read-state=<path.json>, shaped {"<id>": "keep"|"done"|"del"}. You pull
// that snapshot with the ArtifactData tool (query/list the "docs" collection
// of the published artifact) before regenerating. Omitting it is fail-safe
// in the direction that never loses text: every doc embeds, so nothing is
// silently dropped before its db row actually says it is safe to drop.
//
// Usage:
//   node scripts/build.mjs \
//     [--manifest=path.json]     (default: ./reading-room-manifest.json)
//     [--out=path.html]          (default: ./reading-room.html)
//     [--read-state=path.json]   (default: none -> everything embeds)
//
// Doc paths in the manifest may be absolute, start with ~ (home dir), or be
// relative -- relative paths resolve against the manifest file's directory.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ---------------------------------------------------------------------
// 0. Parse args.
// ---------------------------------------------------------------------
const args = process.argv.slice(2);
let manifestArg = null;
let outArg = null;
let readStatePath = null;
for (const a of args) {
  let m;
  if ((m = a.match(/^--manifest=(.+)$/))) manifestArg = m[1];
  else if ((m = a.match(/^--out=(.+)$/))) outArg = m[1];
  else if ((m = a.match(/^--read-state=(.+)$/))) readStatePath = m[1];
  else {
    console.error(`build: unknown argument "${a}"`);
    process.exit(1);
  }
}

const cwd = process.cwd();
const manifestPath = path.resolve(cwd, manifestArg || "reading-room-manifest.json");
const manifestDir = path.dirname(manifestPath);
const outPath = path.resolve(cwd, outArg || "reading-room.html");

function expandHome(p) {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

// Resolve a doc path: ~ -> home, absolute stays, relative -> against the
// manifest's own directory (so a manifest is portable regardless of cwd).
function resolveDocPath(p) {
  const expanded = expandHome(p);
  return path.isAbsolute(expanded) ? expanded : path.resolve(manifestDir, expanded);
}

function wordCount(text) {
  const stripped = text.trim();
  if (!stripped) return 0;
  return stripped.split(/\s+/).filter(Boolean).length;
}

// Per-doc DATE for the "organise by date" view. Preference order:
//   1. A YYYY-MM-DD embedded in the manifest path/filename (docs are often
//      named like `...-2026-01-15.md`) -- the authoritative "as-of" date,
//      stable regardless of when the file was last touched on disk.
//   2. The file's mtime when the path carries no date.
//   3. null when the file is missing -- rendered as "Undated", sorted last,
//      never crashing.
function docDate(fullPath, missing) {
  const m = String(fullPath).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (!missing) {
    try {
      return fs.statSync(fullPath).mtime.toISOString().slice(0, 10);
    } catch (e) {
      /* fall through to null */
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// 1. Load the catalog + (optionally) a db read-state snapshot.
// ---------------------------------------------------------------------
if (!fs.existsSync(manifestPath)) {
  console.error(`build: manifest not found at ${manifestPath}`);
  console.error(`build: pass --manifest=<path>, or run from a directory containing reading-room-manifest.json`);
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (!Array.isArray(manifest.docs)) {
  console.error("build: manifest.docs is not an array -- NOT writing file");
  process.exit(1);
}

let readState = {};
if (readStatePath) {
  const resolved = path.resolve(cwd, readStatePath);
  if (!fs.existsSync(resolved)) {
    console.error(`build: --read-state file not found at ${resolved}`);
    process.exit(1);
  }
  readState = JSON.parse(fs.readFileSync(resolved, "utf8"));
  const bad = Object.entries(readState).filter(([, v]) => !["keep", "done", "del"].includes(v));
  if (bad.length) {
    console.error(`build: --read-state has invalid state value(s): ${bad.map(([k, v]) => `${k}=${v}`).join(", ")}`);
    process.exit(1);
  }
}

const roomTitle = manifest.title || "The Reading Room";
const roomSubtitle = manifest.subtitle || "Your reading queue";

// ---------------------------------------------------------------------
// 2. Build the doc list: recompute word counts from the real file, decide
//    whether to embed based on the (optional) read-state snapshot.
// ---------------------------------------------------------------------
const seenIds = new Set();
const docsOut = [];
const blocks = [];
const problems = [];

for (const entry of manifest.docs) {
  if (!entry.id || !entry.title || !entry.cat || !entry.path) {
    problems.push(`manifest entry missing id/title/cat/path: ${JSON.stringify(entry)}`);
    continue;
  }
  if (seenIds.has(entry.id)) {
    problems.push(`duplicate doc id in manifest: "${entry.id}"`);
    continue;
  }
  seenIds.add(entry.id);

  const fullPath = resolveDocPath(entry.path);
  let words = 0;
  let text = null;
  let missing = false;
  try {
    text = fs.readFileSync(fullPath, "utf8");
    words = wordCount(text);
  } catch (e) {
    missing = true;
  }

  // Fail-safe default: an id absent from the snapshot (new doc, or no
  // snapshot passed at all) is treated as "keep" -- never silently dropped
  // before its own db row says it is safe to.
  const knownState = readState[entry.id];
  const state = knownState || "keep";

  // A doc's raw text embeds verbatim inside a <script type="text/markdown">
  // element; per the HTML spec a script element's content ends at the FIRST
  // literal "</script" sequence regardless of context (quotes, code fences,
  // prose all included) -- so a doc that happens to quote a real closing
  // script tag would truncate itself and corrupt every block after it in
  // the file. Detect that structurally and degrade to a link-row rather
  // than ship a corrupted page; a mention of an OPENING "<script ...>" tag
  // (common in specs) is harmless and left alone.
  const hasClosingScriptTag = text !== null && /<\/script/i.test(text);
  const embed = state === "keep" && !missing && !hasClosingScriptTag;

  const date = docDate(fullPath, missing);

  docsOut.push({
    id: entry.id,
    title: entry.title,
    cat: entry.cat,
    path: entry.path,
    date,
    words,
    embedded: embed,
  });

  if (embed) {
    blocks.push(`<script type="text/markdown" data-doc="${entry.id}">\n${text.trim()}\n</script>`);
  }
  if (missing) {
    console.warn(`build: warning -- "${entry.id}" source file not found at ${fullPath}; emitted as a link-row with no body`);
  }
  if (hasClosingScriptTag && state === "keep" && !missing) {
    console.warn(`build: warning -- "${entry.id}" contains a literal "</script" sequence; emitted as a link-row with no body to avoid corrupting the page (the full text is still on disk at its path)`);
  }
}

if (problems.length) {
  console.error("build: manifest problems -- NOT writing file:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const stateJson = {
  updated: new Date().toISOString().slice(0, 10),
  title: roomTitle,
  subtitle: roomSubtitle,
  catOrder: manifest.catOrder || [],
  docs: docsOut,
  links: manifest.links || [],
};

// ---------------------------------------------------------------------
// 3. The shell -- CSS + markup, unchanged run to run (content-only: no
//    doctype/html/head/body, per the Artifact tool's single-wrap rule).
// ---------------------------------------------------------------------
const HEAD = `<title>${roomTitle}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600;6..72,700&family=Public+Sans:wght@400;500;600;700&family=Spline+Sans+Mono:wght@400;500;600&display=swap">
<style>
:root{
  --paper:#FAF7F0; --ink:#20303A; --muted:#647079; --faint:#8A949B;
  --accent:#0E6E74; --accent-soft:#E2EEED; --line:#E0DCD1; --card:#FFFFFF;
  --keep:#2F6E4F; --keep-soft:#E4F0E7;
  --done:#6C7A82; --done-soft:#ECEFF0;
  --del:#A9532F; --del-soft:#F6E7DE;
}
@media (prefers-color-scheme:dark){ :root:not([data-theme="light"]){
  --paper:#111A1E; --ink:#E8EDEC; --muted:#93A3A6; --faint:#6C7C80;
  --accent:#57B7BC; --accent-soft:#14292C; --line:#233238; --card:#172327;
  --keep:#7FC28E; --keep-soft:#16281C;
  --done:#859098; --done-soft:#1B262A; --del:#D98C63; --del-soft:#2A1C14;
}}
:root[data-theme="dark"]{
  --paper:#111A1E; --ink:#E8EDEC; --muted:#93A3A6; --faint:#6C7C80;
  --accent:#57B7BC; --accent-soft:#14292C; --line:#233238; --card:#172327;
  --keep:#7FC28E; --keep-soft:#16281C; --done:#859098; --done-soft:#1B262A; --del:#D98C63; --del-soft:#2A1C14;
}
*{box-sizing:border-box}
body{background:var(--paper);color:var(--ink);margin:0;
  font-family:"Public Sans","Helvetica Neue",Arial,sans-serif;line-height:1.62;
  padding:2.2rem 1rem 5rem;-webkit-text-size-adjust:100%}
.room{max-width:48rem;margin:0 auto}
.masthead{border-bottom:2px solid var(--ink);padding-bottom:1rem}
.eyebrow{font-family:"Spline Sans Mono",ui-monospace,monospace;font-size:.7rem;font-weight:600;
  letter-spacing:.18em;text-transform:uppercase;color:var(--accent);margin:0 0 .4rem}
.masthead h1{font-family:"Newsreader",Georgia,serif;font-size:2.3rem;font-weight:700;
  margin:0;letter-spacing:-.01em;text-wrap:balance}
.tally{display:flex;flex-wrap:wrap;gap:.4rem .5rem;margin-top:.9rem;
  font-family:"Spline Sans Mono",ui-monospace,monospace;font-size:.74rem}
.chip{border:1px solid var(--line);border-radius:99px;padding:.24rem .66rem;color:var(--muted);background:var(--card)}
.chip b{color:var(--ink);font-weight:700}
.intro{color:var(--muted);font-size:.9rem;margin:1rem 0 0;max-width:62ch}
.legend{font-size:.82rem;color:var(--muted);margin:.6rem 0 0;max-width:64ch}
.legend b{color:var(--ink)}
.controls{display:flex;align-items:center;gap:.6rem;margin:1.2rem 0 .2rem;flex-wrap:wrap}
.ctl-label{font-family:"Spline Sans Mono",ui-monospace,monospace;font-size:.7rem;font-weight:600;
  letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.ctl-select{font:inherit;font-family:"Public Sans","Helvetica Neue",Arial,sans-serif;font-size:.85rem;
  color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:8px;
  padding:.38rem 2rem .38rem .7rem;cursor:pointer;-webkit-appearance:none;appearance:none;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23647079' d='M6 8 0 0h12z'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right .7rem center}
.ctl-select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.cat{font-family:"Newsreader",Georgia,serif;font-size:1.02rem;font-weight:600;color:var(--accent);
  margin:2.1rem 0 .7rem;padding-bottom:.25rem;border-bottom:1px solid var(--line);letter-spacing:.01em}
.doc{background:var(--card);border:1px solid var(--line);border-radius:12px;margin-bottom:.7rem;overflow:hidden}
.doc.s-done{opacity:.72}
.doc.s-del{border-color:var(--del)}
.dhead{display:flex;align-items:flex-start;gap:.75rem;padding:.9rem 1rem}
.dtoggle{flex:1;min-width:0;cursor:pointer;background:none;border:0;text-align:left;padding:0;color:inherit;font:inherit;display:flex;gap:.6rem;align-items:flex-start}
.dtoggle:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:4px}
.caret{color:var(--faint);font-size:.72rem;margin-top:.3rem;transition:transform .15s}
.doc.is-open .caret{transform:rotate(90deg)}
.dtitle{font-weight:600;font-size:.98rem}
.dsub{display:block;margin-top:.15rem;font-family:"Spline Sans Mono",ui-monospace,monospace;
  font-size:.72rem;color:var(--faint);font-weight:400;word-break:break-all}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;flex-shrink:0}
.seg button{font:inherit;font-family:"Spline Sans Mono",ui-monospace,monospace;font-size:.68rem;font-weight:600;
  letter-spacing:.02em;border:0;background:var(--card);color:var(--muted);padding:.34rem .5rem;cursor:pointer;
  border-left:1px solid var(--line)}
.seg button:first-child{border-left:0}
.seg button:hover{background:var(--accent-soft)}
.seg button.on[data-s="keep"]{background:var(--keep-soft);color:var(--keep)}
.seg button.on[data-s="done"]{background:var(--done-soft);color:var(--done)}
.seg button.on[data-s="del"]{background:var(--del-soft);color:var(--del)}
.seg button:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.seg button:disabled{opacity:.5;cursor:default}
.dbody{display:none;border-top:1px solid var(--line);padding:.8rem 1.25rem 1.5rem}
.doc.is-open .dbody{display:block}
.linkrow{display:flex;align-items:center;gap:.6rem;padding:.55rem .7rem;border-radius:8px}
.linkrow .dsub{margin:0}
a.xlink{display:flex;align-items:center;justify-content:space-between;gap:.6rem;text-decoration:none;
  color:var(--ink);font-weight:600;font-size:.95rem;background:var(--accent-soft);border:1px solid var(--line);
  border-radius:10px;padding:.75rem 1rem;margin:.5rem 0 0}
a.xlink span{color:var(--accent);font-family:"Spline Sans Mono",ui-monospace,monospace;font-size:.72rem;font-weight:500;white-space:nowrap}
a.xlink:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.filed-wrap{margin-top:1rem;border:1px dashed var(--line);border-radius:12px;background:var(--card)}
.filed-wrap>summary{cursor:pointer;padding:.8rem 1rem;font-family:"Spline Sans Mono",ui-monospace,monospace;
  font-size:.75rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);list-style:none}
.filed-wrap>summary::-webkit-details-marker{display:none}
.filed-body{padding:.4rem .8rem .9rem}
.md{font-size:.92rem;color:var(--ink)}
.md h1{font-family:"Newsreader",Georgia,serif;font-size:1.4rem;margin:1rem 0 .5rem;text-wrap:balance}
.md h2{font-family:"Newsreader",Georgia,serif;font-size:1.16rem;margin:1.3rem 0 .4rem}
.md h3{font-size:1rem;margin:1.05rem 0 .3rem}
.md p{margin:0 0 .75rem;max-width:66ch}
.md ul,.md ol{margin:0 0 .8rem;padding-left:1.3rem}.md li{margin-bottom:.32rem}
.md blockquote{border-left:3px solid var(--accent);margin:.6rem 0 .95rem;padding:.15rem 0 .15rem .95rem;color:var(--muted)}
.md code{font-family:"Spline Sans Mono",ui-monospace,monospace;font-size:.85em;background:var(--accent-soft);border-radius:4px;padding:.06em .34em}
.md pre{background:var(--accent-soft);border-radius:8px;padding:.8rem .95rem;overflow-x:auto}.md pre code{background:none;padding:0}
.md hr{border:0;border-top:1px solid var(--line);margin:1.3rem 0}
.md a{color:var(--accent)}
.md .tw{overflow-x:auto;margin:0 0 .9rem}
.md table{border-collapse:collapse;font-size:.85rem;min-width:100%}
.md th,.md td{border:1px solid var(--line);padding:.35rem .6rem;text-align:left;vertical-align:top}
.md th{background:var(--accent-soft);font-weight:600}
.foot{margin-top:2.5rem;padding-top:1rem;border-top:1px solid var(--line);font-size:.78rem;color:var(--faint);max-width:64ch}
.toast{position:fixed;bottom:1.1rem;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--paper);
  padding:.55rem 1.1rem;border-radius:99px;font-size:.85rem;opacity:0;transition:opacity .25s;pointer-events:none;z-index:9}
.toast.show{opacity:1}
@media (prefers-reduced-motion:reduce){.caret,.toast{transition:none}}
</style>
<div class="room"><div id="app"></div></div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>`;

// ---------------------------------------------------------------------
// 4. The runtime -- reads catalog + embedded markdown from the page,
//    reads/writes TRIAGE STATE from the artifact `db` capability. No
//    `artifact.publish` call anywhere in here: a tick is a db write, not
//    a republish, so it never touches the save-lock/publish gate again.
//    Every db call is try/catch'd; db unavailable/empty degrades to
//    "everything defaults to keep" (== exactly what's physically
//    embedded), never a blank page.
// ---------------------------------------------------------------------
const RUNTIME = `<script>
const BT=String.fromCharCode(96), FENCE=BT+BT+BT;
const state = JSON.parse(document.getElementById("rr-state").textContent);
const app = document.getElementById("app");

// Live triage state, keyed by doc id: {keep|done|del}. Populated from the
// artifact db (collection "docs", one doc per id: {state, updatedAt}); a
// missing entry -- no db, no capability, or an id never yet triaged -- reads
// as undefined and falls back to "keep" everywhere below. That fallback is
// deliberately the same default the BUILD script uses, so an unreachable
// db never contradicts what's physically on the page.
const dbState = {};
let db = null, dbReady = false, dbOk = false;

// How the active library is organised on screen. "category" = the grouped
// view (default). "date" = a flat list, newest first. Purely client-side:
// switching re-renders from the same embedded data, no rebuild, and it does
// NOT touch triage state or the db in any way.
let sortMode = "category";

function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function inline(s){
  s=esc(s);
  s=s.replace(new RegExp(BT+"([^"+BT+"]+)"+BT,"g"),function(m,c){return "<code>"+c+"</code>";});
  s=s.replace(/\\*\\*([^*]+)\\*\\*/g,"<strong>$1</strong>");
  s=s.replace(/(^|[^*])\\*([^*]+)\\*/g,"$1<em>$2</em>");
  s=s.replace(/\\[([^\\]]+)\\]\\((https?:[^)]+)\\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}
function mdToHtml(md){
  const lines=md.split("\\n"); let h=""; let i=0;
  let inUl=false,inOl=false,inQuote=false;
  const closeLists=()=>{if(inUl){h+="</ul>";inUl=false;}if(inOl){h+="</ol>";inOl=false;}};
  const closeQuote=()=>{if(inQuote){h+="</blockquote>";inQuote=false;}};
  const isFence=l=>l.trim().slice(0,3)===FENCE;
  while(i<lines.length){
    let ln=lines[i];
    if(isFence(ln)){closeLists();closeQuote();
      i++;let code="";while(i<lines.length&&!isFence(lines[i])){code+=lines[i]+"\\n";i++;}i++;
      h+="<pre><code>"+esc(code)+"</code></pre>";continue;}
    if(/^\\|(.+)\\|\\s*$/.test(ln)&&i+1<lines.length&&/^\\|[\\s:|-]+\\|\\s*$/.test(lines[i+1])){
      closeLists();closeQuote();
      const row=l=>l.replace(/^\\||\\|$/g,"").split("|").map(c=>c.trim());
      let t='<div class="tw"><table><thead><tr>'+row(ln).map(c=>"<th>"+inline(c)+"</th>").join("")+"</tr></thead><tbody>";
      i+=2;
      while(i<lines.length&&/^\\|(.+)\\|\\s*$/.test(lines[i])){t+="<tr>"+row(lines[i]).map(c=>"<td>"+inline(c)+"</td>").join("")+"</tr>";i++;}
      t+="</tbody></table></div>";h+=t;continue;}
    let m;
    if(m=ln.match(/^(#{1,4})\\s+(.*)$/)){closeLists();closeQuote();const lv=m[1].length;h+="<h"+lv+">"+inline(m[2])+"</h"+lv+">";i++;continue;}
    if(/^\\s*(-{3,}|\\*{3,}|_{3,})\\s*$/.test(ln)){closeLists();closeQuote();h+="<hr>";i++;continue;}
    if(m=ln.match(/^\\s*>\\s?(.*)$/)){closeLists();if(!inQuote){h+="<blockquote>";inQuote=true;}h+=inline(m[1])+" ";i++;continue;}
    if(m=ln.match(/^\\s*[-*+]\\s+(.*)$/)){closeQuote();if(inOl){h+="</ol>";inOl=false;}if(!inUl){h+="<ul>";inUl=true;}h+="<li>"+inline(m[1])+"</li>";i++;continue;}
    if(m=ln.match(/^\\s*\\d+\\.\\s+(.*)$/)){closeQuote();if(inUl){h+="</ul>";inUl=false;}if(!inOl){h+="<ol>";inOl=true;}h+="<li>"+inline(m[1])+"</li>";i++;continue;}
    if(/^\\s*$/.test(ln)){closeLists();closeQuote();i++;continue;}
    closeLists();closeQuote();h+="<p>"+inline(ln)+"</p>";i++;
  }
  closeLists();closeQuote();return h;
}

function effState(d){ return dbState[d.id] || "keep"; }
function seg(d){
  const cur=effState(d);
  const b=s=>'<button data-doc="'+d.id+'" data-s="'+s+'"'+(cur===s?' class="on"':'')+'>'+s.toUpperCase()+'</button>';
  return '<div class="seg" role="group" aria-label="Triage">'+b("keep")+b("done")+b("del")+'</div>';
}
function count(s){return state.docs.filter(d=>effState(d)===s).length;}

// The muted, small meta line under a doc title -- carries the DATE (in both
// views), the word count, and the path. Undated docs simply omit the date.
function docMeta(d){
  return (d.date?d.date+" · ":"")+(d.words?d.words.toLocaleString()+" words · ":"")+d.path;
}
// One expandable doc card (identical markup in category + date views, so the
// toggle/body/triage wiring below works the same regardless of sort mode).
function docCard(d){
  return '<div class="doc s-'+effState(d)+'" id="doc-'+d.id+'">'+
    '<div class="dhead">'+
      '<button class="dtoggle" data-toggle="'+d.id+'" aria-expanded="false">'+
        '<span class="caret">▶</span>'+
        '<span class="dtitle">'+d.title+'<span class="dsub">'+docMeta(d)+'</span></span>'+
      '</button>'+seg(d)+
    '</div>'+
    '<div class="dbody"><div class="md" data-md="'+d.id+'"></div></div>'+
  '</div>';
}

function render(){
  const cats=state.catOrder.filter(c=>state.docs.some(d=>d.cat===c&&effState(d)!=="done"&&effState(d)!=="del"));
  let h='<header class="masthead"><p class="eyebrow">'+esc(state.subtitle)+' · updated '+state.updated+'</p>'+
    '<h1>'+esc(state.title)+'</h1>'+
    '<div class="tally">'+
    '<span class="chip"><b>'+count("keep")+'</b> keep</span>'+
    '<span class="chip"><b>'+count("done")+'</b> done</span>'+
    '<span class="chip"><b>'+count("del")+'</b> to delete</span>'+
    '<span class="chip">'+state.docs.length+' documents</span></div>'+
    '<p class="intro">Every document in your reading queue, full text while unread, grouped by area. Read here; triage each one with the control on its card. A doc\\'s text drops from this page the next time it\\'s regenerated once you\\'ve triaged it off Keep -- the original file is never touched.</p>'+
    '<p class="legend"><b>Keep</b> -- stays in the queue, full text here. <b>Done</b> -- read and filed; collapses to the folder below (the file stays on disk). <b>Delete</b> -- flagged for removal (nothing is deleted; it is only a marker for you). Your choices save instantly and sync across every device -- no republish needed.</p></header>';

  h+='<div class="controls"><label class="ctl-label" for="sortby">Sort / organise by</label>'+
    '<select id="sortby" class="ctl-select" aria-label="Sort or organise the reading room">'+
      '<option value="category"'+(sortMode==="category"?" selected":"")+'>Category</option>'+
      '<option value="date"'+(sortMode==="date"?" selected":"")+'>Date -- newest first</option>'+
    '</select></div>';

  for(const l of (state.links||[])) h+='<a class="xlink" href="'+l.url+'" target="_blank" rel="noopener">'+esc(l.title)+'<span>'+esc(l.cat||"link")+' · own page →</span></a>';

  // Active docs = everything not filed/deleted-away (keep or del). Rendered
  // either grouped by category (default) or flat, newest first.
  const isActive=d=>effState(d)==="keep"||effState(d)==="del";
  if(sortMode==="date"){
    const active=state.docs.filter(isActive).slice();
    // YYYY-MM-DD sorts correctly as a plain string; undated docs go last.
    active.sort((a,b)=>{
      if(a.date&&b.date) return b.date.localeCompare(a.date);
      if(a.date) return -1;
      if(b.date) return 1;
      return 0;
    });
    const dated=active.filter(d=>d.date), undated=active.filter(d=>!d.date);
    if(dated.length){ h+='<div class="cat">Newest first</div>'; for(const d of dated) h+=docCard(d); }
    if(undated.length){ h+='<div class="cat">Undated</div>'; for(const d of undated) h+=docCard(d); }
  } else {
    for(const cat of cats){
      h+='<div class="cat">'+esc(cat)+'</div>';
      for(const d of state.docs.filter(x=>x.cat===cat&&isActive(x))) h+=docCard(d);
    }
  }

  const filed=state.docs.filter(d=>effState(d)==="done");
  if(filed.length){
    h+='<details class="filed-wrap"><summary>Done · filed ('+filed.length+') -- click to expand</summary><div class="filed-body">';
    for(const d of filed){
      h+='<div class="doc s-done"><div class="dhead linkrow">'+
        '<span class="dtitle" style="flex:1">'+d.title+'<span class="dsub">'+docMeta(d)+'</span></span>'+seg(d)+
      '</div></div>';
    }
    h+='</div></details>';
  }

  h+='<div class="foot">This page\\'s catalog is regenerated from your files as new documents land; your Keep / Done / Delete choices live in this artifact\\'s own database and sync instantly, on every device, without a republish. "Done" keeps the document on disk at the path shown; "Delete" only flags it for your own attention -- this page never touches your files.</div>';
  app.innerHTML=h;

  app.querySelectorAll("[data-toggle]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const doc=btn.closest(".doc"), id=btn.dataset.toggle, tgt=doc.querySelector('[data-md="'+id+'"]');
      if(!tgt.dataset.rendered){
        const src=document.querySelector('script[type="text/markdown"][data-doc="'+id+'"]');
        tgt.innerHTML=src?mdToHtml(src.textContent.trim()):"<p>Source not embedded on this page -- already triaged off Keep, or newer than the last regeneration. See the path above.</p>";
        tgt.dataset.rendered="1";
      }
      const openNow=doc.classList.toggle("is-open");
      btn.setAttribute("aria-expanded",openNow);
    });
  });
  app.querySelectorAll(".seg button").forEach(b=>{
    b.addEventListener("click",()=>setState(b.dataset.doc,b.dataset.s));
  });
  const sortSel=document.getElementById("sortby");
  if(sortSel){
    sortSel.value=sortMode;
    sortSel.addEventListener("change",()=>{ sortMode=sortSel.value; render(); });
  }
}

function toast(m){const t=document.getElementById("toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200);}

// First paint: render immediately from whatever is physically on the page
// (== everything reads as "keep"/embedded, its build-time default) so the
// room is never blank while claude.use("db") resolves -- capabilities never
// block first paint by design.
render();

// Then light up live, cross-device triage once/if the db capability
// resolves. claude.use("db") settles after this script's first run and is
// not ordered against anything else, so nothing here assumes it is ready.
(async () => {
  try {
    db = await claude.use("db");
  } catch (e) {
    db = null;
  }
  dbReady = true;
  if (!db) { return; } // no capability granted to this view -- page stays on build-time defaults, fully usable, just not cross-device
  try {
    db.collection("docs").onSnapshot((snap) => {
      dbOk = true;
      for (const doc of snap.docs) {
        const data = doc.data();
        if (data && (data.state === "keep" || data.state === "done" || data.state === "del")) {
          dbState[doc.id] = data.state;
        }
      }
      render();
    }, (err) => {
      // Terminal for this listener (revoked/unavailable/etc). Keep whatever
      // state we already have; the page still works, just stops syncing
      // live until reloaded.
      dbOk = false;
    });
  } catch (e) {
    // Query construction or subscribe itself failed -- stay on defaults.
    dbOk = false;
  }
})();

async function setState(id, s) {
  const d = state.docs.find(x => x.id === id);
  if (!d) return;
  const prev = effState(d);
  if (prev === s) return;
  // Optimistic local update so the click feels instant even before the
  // write (or the db capability) resolves.
  dbState[id] = s;
  render();
  if (!dbReady) {
    try { db = await claude.use("db"); } catch (e) { db = null; }
    dbReady = true;
  }
  if (!db) {
    toast("Saved on this device only -- this view can't reach shared storage");
    return;
  }
  try {
    await db.doc("docs/" + id).set({ state: s, updatedAt: new Date().toISOString() });
    toast(s === "keep" ? "Kept" : s === "done" ? "Filed as done" : "Flagged to delete");
  } catch (err) {
    // Roll back the optimistic update so the UI doesn't lie about what's saved.
    dbState[id] = prev;
    render();
    toast("Could not save; try again");
  }
}
<\/script>`;

// ---------------------------------------------------------------------
// 5. Assemble + write.
// ---------------------------------------------------------------------
const stateScript = `<script id="rr-state" type="application/json">${JSON.stringify(stateJson)}</script>`;
const out = [HEAD, stateScript, ...blocks, RUNTIME].join("\n");

// Sanity: content-only (no doctype/html/head/body -- the Artifact tool wraps
// the page once; shipping any of these double-wraps it). Checked ONLY
// against the shell this script authors (HEAD/state/runtime) -- the doc
// blocks are inert markdown text inside <script type="text/markdown">
// elements (never parsed as markup regardless of content), and real docs
// legitimately discuss "<!doctype>"/"<html>" in prose or code fences, so
// scanning them would false-positive on content, not structure.
const forbidden = /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i;
const shellOnly = HEAD + "\n" + stateScript + "\n" + RUNTIME;
if (forbidden.test(shellOnly)) {
  console.error("build: generated shell contains a doctype/html/head/body tag -- NOT writing file (would double-wrap on publish)");
  process.exit(1);
}

fs.writeFileSync(outPath, out, "utf8");
const bytes = Buffer.byteLength(out, "utf8");
const embeddedCount = docsOut.filter(d => d.embedded).length;

console.log(`docs: ${docsOut.length} total, ${embeddedCount} embedded (keep), ${docsOut.length - embeddedCount} link-row only (done/del/missing)`);
console.log(`bytes: ${bytes} (approx tokens: ${Math.round(bytes / 4)})`);
console.log(`wrote ${outPath}`);
