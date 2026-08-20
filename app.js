const DATA_FILE = 'catalogue.json';
let DATA = {hotels:[],settings:{}}, activeCategory = "", selected = new Set(JSON.parse(localStorage.getItem("guq-catering-compare")||"[]"));
const $ = id => document.getElementById(id);
const CAT_ABBR={"Coffee Break":"CB","Breakfast":"BR","Buffet":"BF","Canapés":"CN","Set Menu":"SM","Beverage":"BV","Meeting Package":"MP","Family Style":"FS"};
function safeNum(v){const n=Number(String(v??"").replace(/[^0-9.]/g,""));return Number.isFinite(n)?n:0}
function enrich(payload){
  const p = payload && Array.isArray(payload.hotels) ? payload : {hotels:[],settings:{}};
  p.settings = p.settings || {};
  p.hotels.forEach(h=>{const prices=h.categories.map(c=>safeNum(c.average_price_qar)).filter(Boolean);h.from_price=prices.length?Math.min(...prices):0;h.overall_average=prices.length?Math.round(prices.reduce((a,b)=>a+b,0)/prices.length):0});
  return p;
}
async function load(){
  try{
    const r=await fetch(DATA_FILE+'?v='+Date.now(),{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    DATA=enrich(await r.json());
    if(!DATA.hotels.length) throw new Error('catalogue.json contains no hotels');
    $('statusText').textContent='Live · synced through Finance backend'; $('statusDot').classList.add('live-on');
    if(DATA.settings.events_upload_url){$('eventsBtn').href=DATA.settings.events_upload_url;$('eventsBtn').style.display='inline-flex'}
    updateStats(); render();
  }catch(err){
    console.error(err); $('statusText').textContent='Catalogue connection error';
    $('resultCount').textContent='The site could not read catalogue.json.';
    $('grid').innerHTML='<div class="empty"><b>Catalogue data is not connected.</b><br>Open <a href="CONNECTION_TEST.html">CONNECTION_TEST.html</a> for an exact diagnosis.</div>';
  }
}
function updateStats(){
  const cats=[...new Set(DATA.hotels.flatMap(h=>h.categories.map(c=>c.category)))];
  const prices=DATA.hotels.flatMap(h=>h.categories.map(c=>safeNum(c.average_price_qar))).filter(Boolean);
  $('statHotels').textContent=DATA.hotels.length; $('statCategories').textContent=cats.length;
  $('statAvg').textContent=prices.length?'QAR '+Math.round(prices.reduce((a,b)=>a+b,0)/prices.length):'—';
  $('statRange').textContent=prices.length?Math.min(...prices)+'–'+Math.max(...prices):'—';
}
function categories(){return [...new Set(DATA.hotels.flatMap(h=>h.categories.map(c=>c.category)))].sort()}
function maxPrice(){return Math.max(...DATA.hotels.flatMap(h=>h.categories.map(c=>safeNum(c.average_price_qar))),1)}
function initials(name){return name.split(/\s+/).filter(w=>!['Hotel','Doha','City','Center','Centre'].includes(w)).slice(0,2).map(w=>w[0]).join('').toUpperCase()}
function cleanStatus(s){return s?String(s).replace(/\s+/g,' ').trim():'Preferred catering partner'}
function renderFilters(){const cs=categories();$('filters').innerHTML=['<button class="filter-chip '+(!activeCategory?'active':'')+'" data-cat="">All categories</button>',...cs.map(c=>'<button class="filter-chip '+(activeCategory===c?'active':'')+'" data-cat="'+c+'">'+c+'</button>')].join('');$('filters').querySelectorAll('button').forEach(b=>b.onclick=()=>{activeCategory=b.dataset.cat;render()})}
function hotelsFiltered(){const q=$('search').value.trim().toLowerCase();let hs=DATA.hotels.map(h=>({...h,categories:h.categories.filter(c=>(!activeCategory||c.category===activeCategory)&&(!q||h.supplier.toLowerCase().includes(q)||c.category.toLowerCase().includes(q)))})).filter(h=>h.categories.length);const sort=$('sort').value;if(sort==='price')hs.sort((a,b)=>(a.from_price||9999)-(b.from_price||9999));else if(sort==='average')hs.sort((a,b)=>(a.overall_average||9999)-(b.overall_average||9999));else hs.sort((a,b)=>a.supplier.localeCompare(b.supplier));return hs}
function render(){renderFilters();const hs=hotelsFiltered(),mx=maxPrice();$('resultCount').textContent=hs.length+' hotel'+(hs.length===1?'':'s')+' shown';$('grid').innerHTML=hs.length?hs.map(h=>hotelCard(h,mx)).join(''):'<div class="empty"><b>No matching partners.</b><br>Try another hotel name or catering category.</div>';document.querySelectorAll('[data-compare]').forEach(b=>b.onclick=()=>toggleCompare(b.dataset.compare));renderDock()}
function hotelCard(h,mx){const isSel=selected.has(h.supplier);return `<article class="hotel-card"><div class="hotel-band"></div><div class="hotel-header"><div class="monogram">${initials(h.supplier)}</div><div class="hotel-title"><h3>${h.supplier}</h3><p>${cleanStatus(h.status)}</p></div><div class="hotel-summary"><span class="tier">${h.tier||'Preferred'}</span><div class="from">From <strong>${h.from_price?'QAR '+h.from_price:'Price pending'}</strong></div></div></div><div class="hotel-tools"><button class="compare-toggle ${isSel?'selected':''}" data-compare="${h.supplier}">${isSel?'✓ Added to compare':'＋ Compare hotel'}</button><div class="count-badge">${h.categories.length} catering categor${h.categories.length===1?'y':'ies'}</div></div><div class="category-list">${h.categories.map(c=>{const price=safeNum(c.average_price_qar),pct=price?Math.max(8,Math.min(100,Math.round((price/mx)*100))):0,hasMenu=!!c.menu_url;return `<a class="category-link" href="${hasMenu?c.menu_url:'#'}" ${hasMenu?'target="_blank" rel="noopener"':'onclick="return false"'}><span class="category-icon">${CAT_ABBR[c.category]||c.category.slice(0,2).toUpperCase()}</span><span class="category-name">${c.category}</span><span class="price-block"><strong>${price?'QAR '+Math.round(price):'Price on request'}</strong><span>${price?'average / person':'Finance pricing pending'}</span><div class="price-track"><i style="width:${pct}%"></i></div></span><span class="arrow">${hasMenu?'→':'Upload pending'}</span></a>`}).join('')}</div></article>`}
function toggleCompare(name){if(selected.has(name))selected.delete(name);else{if(selected.size>=3){alert('Compare up to 3 hotels at a time.');return}selected.add(name)}localStorage.setItem('guq-catering-compare',JSON.stringify([...selected]));render()}
function renderDock(){const names=[...selected];$('compareDock').classList.toggle('show',names.length>0);$('compareItems').innerHTML=names.map(n=>'<span class="compare-item">'+n+'</span>').join('')}
function openCompare(){const hs=DATA.hotels.filter(h=>selected.has(h.supplier)),cs=categories();if(!hs.length)return;let html='<table class="matrix"><thead><tr><th>Category</th>'+hs.map(h=>'<th class="hotel-col">'+h.supplier+'</th>').join('')+'</tr></thead><tbody>';cs.forEach(cat=>{html+='<tr><td><b>'+cat+'</b></td>'+hs.map(h=>{const c=h.categories.find(x=>x.category===cat);if(!c)return '<td>—</td>';const p=safeNum(c.average_price_qar);return '<td><strong>'+(p?'QAR '+Math.round(p):'Price pending')+'</strong><br>'+(c.menu_url?'<a target="_blank" rel="noopener" href="'+c.menu_url+'">Menu ↗</a>':'Menu pending')+'</td>'}).join('')+'</tr>'});html+='</tbody></table>';$('matrixWrap').innerHTML=html;$('compareModal').classList.add('show')}
$('search').addEventListener('input',render);$('sort').addEventListener('change',render);$('compareOpen').onclick=openCompare;$('compareClear').onclick=()=>{selected.clear();localStorage.removeItem('guq-catering-compare');render()};$('modalClose').onclick=()=>$('compareModal').classList.remove('show');$('compareModal').onclick=e=>{if(e.target===$('compareModal'))$('compareModal').classList.remove('show')};
load();
