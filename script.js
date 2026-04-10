
// ── CONFIG ──
let SUPABASE_URL = localStorage.getItem('sb_url')||'';
let SUPABASE_KEY = localStorage.getItem('sb_key')||'';
let listingType  = 'free';
let pendingBuyId = null;

// ── DEMO DATA ──
const DEMO = [
  { id:'d1', title:'Fresh Paneer Sabzi', quantity:'4 servings', category:'cooked', listing_type:'free',
    location:'Annapurna Dhaba, Station Road', contact:'Ramesh – 9812345678', description:'No onion/garlic. Freshly made.',
    expiry_time:new Date(Date.now()+3*36e5).toISOString(), status:'available', created_at:new Date().toISOString() },

  { id:'d2', title:'Surplus Bread Loaves', quantity:'8 loaves', category:'baked', listing_type:'sale',
    original_price:160, discount_pct:50, final_price:80, upi_id:'bakery@upi',
    location:'Modern Bakery, MG Road', contact:'Baker – 9823456789', description:'Day-old bread, perfect for toast.',
    expiry_time:new Date(Date.now()+85*6e4).toISOString(), status:'available', created_at:new Date().toISOString() },

  { id:'d3', title:'Mixed Vegetables 1 kg', quantity:'1 kg', category:'fruits', listing_type:'free',
    location:'Green Mart, Civil Lines', contact:'Sunita – 9834567890', description:'Tomato, potato, onion mix.',
    expiry_time:new Date(Date.now()+48*36e5).toISOString(), status:'available', created_at:new Date().toISOString() },

  { id:'d4', title:'Chicken Biryani Boxes', quantity:'12 boxes', category:'cooked', listing_type:'sale',
    original_price:280, discount_pct:60, final_price:112, upi_id:'hotel.radiant@upi',
    location:'Hotel Radiant, NH-31', contact:'Manager – 9845678901', description:'Sealed event surplus. Hygienic packaging.',
    expiry_time:new Date(Date.now()+110*6e4).toISOString(), status:'available', created_at:new Date().toISOString() },

  { id:'d5', title:'Assorted Biscuit Packets', quantity:'20 packets', category:'packaged', listing_type:'sale',
    original_price:50, discount_pct:40, final_price:30, upi_id:'shop@paytm',
    location:'Shree General Store, Bypass', contact:'Vijay – 9856789012', description:'Near best-before, fully sealed.',
    expiry_time:new Date(Date.now()+4*36e5).toISOString(), status:'claimed', created_at:new Date().toISOString() },

  { id:'d6', title:'Dal Makhani + Roti', quantity:'6 portions', category:'cooked', listing_type:'free',
    location:'Home Kitchen, Sector 4', contact:'Priya – 9867890123', description:'Made too much! Please collect today.',
    expiry_time:new Date(Date.now()-25*6e4).toISOString(), status:'available', created_at:new Date().toISOString() },

  { id:'d7', title:'Cakes &amp; Pastries Mix', quantity:'15 pieces', category:'baked', listing_type:'sale',
    original_price:400, discount_pct:70, final_price:120, upi_id:'sweets@phonepe',
    location:'Sweet Dreams Bakery, Park Road', contact:'Arjun – 9878901234', description:'End-of-day stock. Fresh today only.',
    expiry_time:new Date(Date.now()+3*36e5).toISOString(), status:'available', created_at:new Date().toISOString() }
];

// ── UTILS ──
const isConfig = () => SUPABASE_URL.length > 10 && SUPABASE_KEY.length > 10;
const fmtP = n => '₹' + Number(n).toFixed(0);
const CAT = { cooked:'🍲', raw:'🥦', baked:'🍞', fruits:'🍎', packaged:'📦', other:'🥡' };

function toast(msg, type='success') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = 'show '+type;
  setTimeout(() => el.className='', 3400);
}

function expInfo(iso) {
  const d = new Date(iso)-Date.now(), m = Math.floor(d/6e4), h = Math.floor(d/36e5);
  if (d < 0) return { lbl:`Expired ${Math.abs(m)<60?Math.abs(m)+'m':Math.abs(h)+'h'} ago`, cls:'expired' };
  if (m < 120) return { lbl:`⚡ ${m}m left — URGENT`, cls:'near' };
  if (h < 6)   return { lbl:`⏰ ${h}h ${m%60}m left`, cls:'near' };
  return { lbl:`✅ ${h}h left`, cls:'fresh' };
}

// ── TABS ──
function switchTab(name, el) {
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  if (el) el.classList.add('active');
  if (name==='browse') loadFoods();
  if (name==='deals')  loadDeals();
  if (name==='add')    { document.getElementById('setup-notice').style.display = isConfig()?'none':'block'; }
  if (name==='setup')  { document.getElementById('cfg-url').value=SUPABASE_URL; document.getElementById('cfg-key').value=SUPABASE_KEY; }
}

// ── LISTING TYPE ──
function setType(t) {
  listingType = t;
  document.getElementById('btn-free').className = 'type-btn'+(t==='free'?' active-free':'');
  document.getElementById('btn-sale').className = 'type-btn'+(t==='sale'?' active-sale':'');
  document.getElementById('sale-fields').classList.toggle('show', t==='sale');
  const btn = document.getElementById('submit-btn');
  btn.className = t==='sale'?'btn sale-submit':'btn';
  btn.textContent = t==='sale'?'🏷️ Post Discount Deal':'🚀 Post Listing';
}

// ── PRICE CALC ──
function calcPrice() {
  const o = parseFloat(document.getElementById('f-orig').value)||0;
  const d = parseFloat(document.getElementById('f-disc').value)||0;
  const p = document.getElementById('price-preview');
  if (!o||!d) { p.innerHTML='Enter price<br/>&amp; discount %'; return; }
  const f = o*(1-d/100), s = o-f;
  p.innerHTML = `<strong>${fmtP(f)}</strong>${fmtP(o)} <span style="color:var(--accent);font-weight:700">-${d}%</span><br/><small>Save ${fmtP(s)}</small>`;
}

// ── SUPABASE ──
async function sbGet(t,q='') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}?order=created_at.desc${q}`,
    { headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY} });
  if (!r.ok) throw new Error('Fetch failed '+r.status);
  return r.json();
}
async function sbPost(t,d) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}`,{
    method:'POST',
    headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=representation'},
    body:JSON.stringify(d)
  });
  if (!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||'Insert failed');}
  return r.json();
}
async function sbPatch(t,id,d) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}?id=eq.${id}`,{
    method:'PATCH',
    headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify(d)
  });
  if (!r.ok) throw new Error('Update failed');
}

// ── DATA ──
let allFoods = [];

async function loadFoods() {
  setLoader('loader',true);
  document.getElementById('food-grid').innerHTML='';
  document.getElementById('empty-state').style.display='none';
  document.getElementById('setup-notice-browse').style.display='none';
  try {
    allFoods = isConfig() ? await sbGet('foods') : DEMO;
    if (!isConfig()) document.getElementById('setup-notice-browse').style.display='block';
  } catch(e) {
    toast('Load error: '+e.message,'error');
    allFoods = DEMO;
    document.getElementById('setup-notice-browse').style.display='block';
  }
  renderGrid(allFoods,'food-grid','empty-state');
  updateStats(allFoods);
  setLoader('loader',false);
}

async function loadDeals() {
  setLoader('loader-deals',true);
  document.getElementById('deals-grid').innerHTML='';
  document.getElementById('deals-empty').style.display='none';
  try {
    const data = isConfig()
      ? await sbGet('foods','&listing_type=eq.sale')
      : DEMO.filter(f=>f.listing_type==='sale');
    renderGrid(data,'deals-grid','deals-empty');
  } catch(e) {
    renderGrid(DEMO.filter(f=>f.listing_type==='sale'),'deals-grid','deals-empty');
  }
  setLoader('loader-deals',false);
}

function setLoader(id,on) { document.getElementById(id).classList.toggle('show',on); }

function updateStats(f) {
  const now = Date.now();
  document.getElementById('stat-total').textContent   = f.length;
  document.getElementById('stat-free').textContent    = f.filter(x=>x.listing_type!=='sale'&&x.status==='available'&&new Date(x.expiry_time)>now).length;
  document.getElementById('stat-deals').textContent   = f.filter(x=>x.listing_type==='sale'&&x.status==='available'&&new Date(x.expiry_time)>now).length;
  document.getElementById('stat-claimed').textContent = f.filter(x=>x.status==='claimed'||x.status==='sold').length;
}

// ── RENDER ──
function renderGrid(foods, gridId, emptyId) {
  const g = document.getElementById(gridId);
  g.innerHTML='';
  if (!foods.length) { document.getElementById(emptyId).style.display='block'; return; }

  foods.forEach(f => {
    const ei = expInfo(f.expiry_time);
    const isSale    = f.listing_type==='sale';
    const isClaimed = f.status==='claimed'||f.status==='sold';
    const isExpired = ei.cls==='expired';
    const isNear    = ei.cls==='near';

    const cardCls = isClaimed?(isSale?'sold':'claimed'): isExpired?'expired': isSale?'for-sale': isNear?'near-expiry':'fresh';
    const bdgCls  = isClaimed?(isSale?'sold':'claimed'): isExpired?'expired': isSale?'sale': isNear?'near':'fresh';
    const bdgTxt  = isClaimed?(isSale?'🏷️ Sold':'📦 Claimed'): isExpired?'❌ Expired': isSale?'🏷️ On Sale': isNear?'⚡ Urgent':'✅ Free';
    const cdCls   = isClaimed?(isSale?'sold':'claimed'): isExpired?'expired': isSale?'sale': isNear?'near':'fresh';
    const cdLbl   = isClaimed?(isSale?'🎉 Sold out!':'🎉 Already claimed'): ei.lbl;

    const icon    = CAT[f.category||'other']||'🥡';
    const expFmt  = new Date(f.expiry_time).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});

    // Price block
    let priceHTML = '';
    if (isSale && f.original_price) {
      const sav = f.original_price - f.final_price;
      const hot = f.discount_pct >= 50;
      priceHTML = `<div class="price-block">
        <div>
          <div class="orig-price">${fmtP(f.original_price)}</div>
          <div class="final-price">${fmtP(f.final_price)}</div>
          <div class="savings-tag">You save ${fmtP(sav)}</div>
        </div>
        <div style="text-align:right">
          <span class="disc-badge ${hot?'hot':''}">${f.discount_pct}% OFF${hot?' 🔥':''}</span>
          ${f.upi_id?`<div style="font-size:.7rem;color:var(--muted);margin-top:5px;">UPI: ${f.upi_id}</div>`:''}
        </div>
      </div>`;
    }

    // Action
    let action = '';
    if (isClaimed||isExpired) {
      action = `<button class="claim-btn" disabled>${isClaimed?(isSale?'Sold Out':'Claimed ✓'):'Expired'}</button>`;
    } else if (isSale) {
      action = `<div class="action-row">
        <button class="claim-btn buy-btn" onclick="openBuyModal('${f.id}')">💳 Buy ${fmtP(f.final_price)}</button>
        ${f.contact?`<button class="wa-btn" onclick="waContact('${f.contact}','${f.title.replace(/'/g,"\\'")}',${f.final_price})" title="WhatsApp">💬</button>`:''}
      </div>`;
    } else {
      action = `<div class="action-row">
        <button class="claim-btn" onclick="claimFood('${f.id}',this)">🙌 Claim Free</button>
        ${f.contact?`<button class="wa-btn" onclick="waContact('${f.contact}','${f.title.replace(/'/g,"\\'")}',0)" title="WhatsApp">💬</button>`:''}
      </div>`;
    }

    g.innerHTML += `
    <div class="food-card ${cardCls}" data-id="${f.id}" data-type="${f.listing_type||'free'}" data-status="${f.status}" data-cat="${f.category||'other'}">
      ${isSale?'<div class="sale-ribbon">DEAL</div>':''}
      <div class="card-header">
        <div class="card-title">${icon} ${f.title}</div>
        <span class="badge ${bdgCls}">${bdgTxt}</span>
      </div>
      <div class="card-meta">
        <div class="meta-row"><span class="meta-icon">📦</span><span>${f.quantity}</span></div>
        <div class="meta-row"><span class="meta-icon">📍</span><span class="meta-val">${f.location}</span></div>
        ${f.contact?`<div class="meta-row"><span class="meta-icon">📞</span><span>${f.contact}</span></div>`:''}
        ${f.description?`<div class="meta-row"><span class="meta-icon">📝</span><span style="color:var(--muted);font-size:.79rem">${f.description}</span></div>`:''}
      </div>
      ${priceHTML}
      <div class="expiry-cd ${cdCls}">${cdLbl}</div>
      <div style="font-size:.72rem;color:var(--muted);margin-bottom:11px;">🕐 Exp: ${expFmt}</div>
      ${action}
    </div>`;
  });
}

// ── FILTER ──
function filterCards() {
  const q = document.getElementById('search-box').value.toLowerCase();
  const s = document.getElementById('filter-status').value;
  const t = document.getElementById('filter-type').value;
  const out = allFoods.filter(f =>
    (!q||(f.title+f.location).toLowerCase().includes(q)) &&
    (s==='all'||f.status===s) &&
    (t==='all'||(f.listing_type||'free')===t)
  );
  renderGrid(out,'food-grid','empty-state');
}

// ── ADD FOOD ──
async function addFood() {
  const v = id => document.getElementById(id).value.trim();
  const title=v('f-title'), qty=v('f-qty'), loc=v('f-loc'), expiry=v('f-expiry');
  if (!title||!qty||!loc||!expiry){toast('Fill all required (*) fields','error');return;}
  if (new Date(expiry)<=new Date()){toast('Expiry must be in the future!','error');return;}

  let orig=null,disc=null,final=null,upi='';
  if (listingType==='sale'){
    orig=parseFloat(document.getElementById('f-orig').value)||0;
    disc=parseInt(document.getElementById('f-disc').value)||0;
    upi=v('f-upi');
    if (!orig||!disc){toast('Enter price and discount %','error');return;}
    final=+(orig*(1-disc/100)).toFixed(2);
  }

  const btn=document.getElementById('submit-btn');
  btn.disabled=true; btn.textContent='⏳ Posting…';

  const payload = {
    title, quantity:qty, category:document.getElementById('f-cat').value,
    location:loc, contact:v('f-contact'), description:v('f-desc'),
    listing_type:listingType, original_price:orig, discount_pct:disc, final_price:final, upi_id:upi,
    expiry_time:new Date(expiry).toISOString(), status:'available'
  };

  try {
    if (!isConfig()) {
      payload.id='loc-'+Date.now(); payload.created_at=new Date().toISOString();
      DEMO.unshift(payload); allFoods.unshift(payload);
      toast(listingType==='sale'?'🏷️ Deal posted! (Demo)':'✅ Listed! (Demo)', listingType==='sale'?'sale':'success');
    } else {
      await sbPost('foods',payload);
      toast(listingType==='sale'?'🏷️ Discount Deal posted!':'✅ Food listed!', listingType==='sale'?'sale':'success');
    }
    ['f-title','f-qty','f-loc','f-expiry','f-contact','f-desc','f-orig','f-disc','f-upi'].forEach(id=>{
      const el=document.getElementById(id); if(el)el.value='';
    });
    document.getElementById('price-preview').innerHTML='Enter price<br/>&amp; discount %';
  } catch(e){ toast('Error: '+e.message,'error'); }
  finally {
    btn.disabled=false;
    btn.textContent=listingType==='sale'?'🏷️ Post Discount Deal':'🚀 Post Listing';
  }
}

// ── CLAIM ──
async function claimFood(id,btn){
  if(!confirm('Confirm you will pick up this food?'))return;
  btn.disabled=true; btn.textContent='⏳…';
  try{
    const demo=!isConfig()||id.startsWith('d')||id.startsWith('loc-');
    if(demo){const f=[...DEMO,...allFoods].find(x=>x.id===id);if(f)f.status='claimed';}
    else await sbPatch('foods',id,{status:'claimed'});
    toast('🎉 Claimed! Go pick it up!');
    updateCardToClaimed(id,false);
    updateStats(allFoods);
  }catch(e){toast('Error: '+e.message,'error');btn.disabled=false;btn.textContent='🙌 Claim Free';}
}

// ── BUY MODAL ──
function openBuyModal(id){
  const f=[...DEMO,...allFoods].find(x=>x.id===id);
  if(!f)return;
  pendingBuyId=id;
  document.getElementById('modal-price').textContent=fmtP(f.final_price);
  document.getElementById('modal-item').textContent=f.title+' × '+f.quantity;
  document.getElementById('modal-seller').textContent='Seller: '+(f.contact||'—');
  document.getElementById('modal-upi').textContent=f.upi_id?'UPI ID: '+f.upi_id:'';
  document.getElementById('buy-modal').classList.add('show');
}
function closeModal(){ document.getElementById('buy-modal').classList.remove('show'); pendingBuyId=null; }
async function confirmBuy(){
  if(!pendingBuyId)return;
  const id=pendingBuyId; closeModal();
  try{
    const demo=!isConfig()||id.startsWith('d')||id.startsWith('loc-');
    if(demo){const f=[...DEMO,...allFoods].find(x=>x.id===id);if(f)f.status='sold';}
    else await sbPatch('foods',id,{status:'sold'});
    toast('🎉 Purchased! Pay via UPI & collect.','sale');
    updateCardToClaimed(id,true);
    updateStats(allFoods);
  }catch(e){toast('Error: '+e.message,'error');}
}

// ── WHATSAPP ──
function waContact(contact,title,price){
  const ph=contact.replace(/\D/g,'');
  const msg=price>0
    ?`Hi! I want to buy "${title}" for ₹${price} (FoodBridge). Still available?`
    :`Hi! I want to claim the free food "${title}" from FoodBridge. Still available?`;
  window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`,'_blank');
}

// ── UPDATE CARD UI ──
function updateCardToClaimed(id, isSale){
  document.querySelectorAll(`[data-id="${id}"]`).forEach(card=>{
    card.className=`food-card ${isSale?'sold':'claimed'}`;
    const bdg=card.querySelector('.badge');
    if(bdg){bdg.className='badge '+(isSale?'sold':'claimed');bdg.textContent=isSale?'🏷️ Sold':'📦 Claimed';}
    const cd=card.querySelector('.expiry-cd');
    if(cd){cd.className='expiry-cd '+(isSale?'sold':'claimed');cd.textContent=isSale?'🎉 Sold out!':'🎉 You claimed this!';}
    const ar=card.querySelector('.action-row');
    if(ar)ar.outerHTML=`<button class="claim-btn" disabled>${isSale?'Sold Out':'Claimed ✓'}</button>`;
  });
}

// ── INIT ──
window.addEventListener('load',()=>{
  const d=new Date(Date.now()+4*36e5);
  document.getElementById('f-expiry').value=new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,16);
  loadFoods();
});
document.getElementById('buy-modal').addEventListener('click',function(e){if(e.target===this)closeModal();});
