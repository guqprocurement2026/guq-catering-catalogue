const CONFIG = window.GUQ_CONFIG || {};
let DATA = { hotels: [] };
let activeCategory = "";
let selected = new Set(JSON.parse(localStorage.getItem("guq-catering-compare") || "[]"));
const $ = id => document.getElementById(id);
const CAT_ABBR = {"Coffee Break":"CB","Breakfast":"BR","Buffet":"BF","Canapés":"CN","Set Menu":"SM","Beverage":"BV","Meeting Package":"MP","Family Style":"FS"};

function numberOrNull(v){
  if(v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function pricesForHotel(h){ return (h.categories||[]).map(c=>numberOrNull(c.average_price_qar)).filter(v=>v!==null && v>0); }
function enrich(payload){
  const hotels = Array.isArray(payload?.hotels) ? payload.hotels : [];
  hotels.forEach(h=>{
    const p=pricesForHotel(h);
    h.from_price=p.length?Math.min(...p):null;
    h.overall_average=p.length?Math.round(p.reduce((a,b)=>a+b,0)/p.length):null;
  });
  return {hotels, settings: payload?.settings || {}};
}
async function loadCatalogue(){
  try{
    const url = CONFIG.DATA_URL || "data/catalogue.json";
    const res = await fetch(url + (url.includes("?")?"&":"?") + "v=" + Date.now(), {cache:"no-store"});
    if(!res.ok) throw new Error("Catalogue data could not be loaded");
    DATA=enrich(await res.json());
    $("statusText").textContent="Catalogue synced from the approved menu register";
    $("statusDot").classList.add("live-on");
  }catch(err){
    $("statusText").textContent="Catalogue data unavailable";
    $("grid").innerHTML='<div class="empty"><b>Catalogue data could not be loaded.</b><br>Please contact Finance support.</div>';
    return;
  }
  configureActions(); updateStats(); render();
}
function configureActions(){
  const manage=$("manageBtn");
  const uploadUrl = DATA.settings?.events_upload_url || CONFIG.EVENTS_UPLOAD_URL || '';
  if(uploadUrl){manage.hidden=false;manage.textContent='Events: Add menu';manage.onclick=()=>window.open(uploadUrl,"_blank","noopener");}
}
function categories(){return [...new Set(DATA.hotels.flatMap(h=>(h.categories||[]).map(c=>c.category)))].sort()}
function maxPrice(){return Math.max(...DATA.hotels.flatMap(h=>(h.categories||[]).map(c=>numberOrNull(c.average_price_qar)||0)),1)}
function initials(name){return name.split(/\s+/).filter(w=>!["Hotel","Doha","City","Center","Centre"].includes(w)).slice(0,2).map(w=>w[0]).join("").toUpperCase()}
function cleanStatus(s){return s?String(s).replace(/\s+/g," ").trim():"Preferred catering partner"}
function updateStats(){
  const cs=categories(); const all=DATA.hotels.flatMap(h=>(h.categories||[]).map(c=>numberOrNull(c.average_price_qar))).filter(v=>v!==null&&v>0);
  $("statHotels").textContent=DATA.hotels.length;
  $("statCategories").textContent=cs.length;
  $("statAverage").textContent=all.length?"QAR "+Math.round(all.reduce((a,b)=>a+b,0)/all.length):"—";
  $("statRange").textContent=all.length?Math.min(...all)+"–"+Math.max(...all):"—";
}
function renderFilters(){
  const cs=categories();
  $("filters").innerHTML=['<button class="filter-chip '+(!activeCategory?'active':'')+'" data-cat="">All categories</button>',...cs.map(c=>'<button class="filter-chip '+(activeCategory===c?'active':'')+'" data-cat="'+escapeHtml(c)+'">'+escapeHtml(c)+'</button>')].join("");
  $("filters").querySelectorAll("button").forEach(b=>b.onclick=()=>{activeCategory=b.dataset.cat;render()});
}
function hotelsFiltered(){
  const q=$("search").value.trim().toLowerCase();
  let hs=DATA.hotels.map(h=>({...h,categories:(h.categories||[]).filter(c=>(!activeCategory||c.category===activeCategory)&&(!q||h.supplier.toLowerCase().includes(q)||c.category.toLowerCase().includes(q)))})).filter(h=>h.categories.length);
  const sort=$("sort").value;
  if(sort==="price") hs.sort((a,b)=>(a.from_price??999999)-(b.from_price??999999));
  else if(sort==="average") hs.sort((a,b)=>(a.overall_average??999999)-(b.overall_average??999999));
  else hs.sort((a,b)=>a.supplier.localeCompare(b.supplier));
  return hs;
}
function render(){
  renderFilters(); const hs=hotelsFiltered(), mx=maxPrice();
  $("resultCount").textContent=hs.length+" hotel"+(hs.length===1?"":"s")+" shown";
  $("grid").innerHTML=hs.length?hs.map(h=>hotelCard(h,mx)).join(""):'<div class="empty"><b>No matching partners.</b><br>Try another hotel name or catering category.</div>';
  document.querySelectorAll("[data-compare]").forEach(b=>b.onclick=()=>toggleCompare(b.dataset.compare)); renderDock();
}
function hotelCard(h,mx){
  const isSel=selected.has(h.supplier);
  return `<article class="hotel-card"><div class="hotel-band"></div><div class="hotel-header"><div class="monogram">${escapeHtml(initials(h.supplier))}</div><div class="hotel-title"><h3>${escapeHtml(h.supplier)}</h3><p>${escapeHtml(cleanStatus(h.status))}</p></div><div class="hotel-summary"><span class="tier">${escapeHtml(h.tier||"Preferred")}</span><div class="from">From <strong>${h.from_price?"QAR "+Math.round(h.from_price):"Price on request"}</strong></div></div></div><div class="hotel-tools"><button class="compare-toggle ${isSel?"selected":""}" data-compare="${escapeAttr(h.supplier)}">${isSel?"✓ Added to compare":"＋ Compare hotel"}</button><div class="count-badge">${h.categories.length} catering categor${h.categories.length===1?"y":"ies"}</div></div><div class="category-list">${h.categories.map(c=>categoryRow(c,mx)).join("")}</div></article>`;
}
function categoryRow(c,mx){
  const price=numberOrNull(c.average_price_qar); const pct=price?Math.max(8,Math.min(100,Math.round((price/mx)*100))):0;
  const href=c.menu_url||"#"; const clickable=Boolean(c.menu_url);
  return `<a class="category-link ${clickable?"":"disabled"}" href="${escapeAttr(href)}" ${clickable?'target="_blank" rel="noopener"':'onclick="return false"'}><span class="category-icon">${escapeHtml(CAT_ABBR[c.category]||c.category.slice(0,2).toUpperCase())}</span><span class="category-name">${escapeHtml(c.category)}</span><span class="price-block"><strong>${price?"QAR "+Math.round(price):"Price on request"}</strong><span>${price?"average / person":"Finance to confirm"}</span>${price?`<div class="price-track"><i style="width:${pct}%"></i></div>`:""}</span><span class="arrow">${clickable?"→":""}</span></a>`;
}
function toggleCompare(name){
  if(selected.has(name)) selected.delete(name); else {if(selected.size>=3){alert("Compare up to 3 hotels at a time.");return}selected.add(name)}
  localStorage.setItem("guq-catering-compare",JSON.stringify([...selected])); render();
}
function renderDock(){const names=[...selected];$("compareDock").classList.toggle("show",names.length>0);$("compareItems").innerHTML=names.map(n=>'<span class="compare-item">'+escapeHtml(n)+'</span>').join("")}
function openCompare(){
  const hs=DATA.hotels.filter(h=>selected.has(h.supplier)), cs=categories(); if(!hs.length)return;
  let html='<table class="matrix"><thead><tr><th>Category</th>'+hs.map(h=>'<th class="hotel-col">'+escapeHtml(h.supplier)+'</th>').join("")+'</tr></thead><tbody>';
  cs.forEach(cat=>{html+='<tr><td><b>'+escapeHtml(cat)+'</b></td>'+hs.map(h=>{const c=(h.categories||[]).find(x=>x.category===cat);if(!c)return'<td>—</td>';const p=numberOrNull(c.average_price_qar);return '<td><strong>'+(p?'QAR '+Math.round(p):'Price on request')+'</strong><br>'+(c.menu_url?'<a target="_blank" rel="noopener" href="'+escapeAttr(c.menu_url)+'">Menu ↗</a>':'—')+'</td>'}).join("")+'</tr>'});
  html+='</tbody></table>'; $("matrixWrap").innerHTML=html; $("compareModal").classList.add("show");
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function escapeAttr(s){return escapeHtml(s)}
$("search").addEventListener("input",render); $("sort").addEventListener("change",render); $("compareOpen").onclick=openCompare; $("compareClear").onclick=()=>{selected.clear();localStorage.removeItem("guq-catering-compare");render()}; $("modalClose").onclick=()=>$("compareModal").classList.remove("show"); $("compareModal").onclick=e=>{if(e.target===$("compareModal"))$("compareModal").classList.remove("show")};
loadCatalogue();
