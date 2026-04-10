// ══════════════════════════════════════
//  GLOBALS
// ══════════════════════════════════════
let SUPABASE_URL = localStorage.getItem('sb_url') || '';
let SUPABASE_KEY = localStorage.getItem('sb_key') || '';
let currentUser = null;   // Supabase auth user
let userProfile = null;   // user_profiles row
let selectedRole = 'buyer';
let listingType = 'free';
let allFoods = [];
let pendingOrderFoodId = null;
const DEMO_ORDERS = [];

// ══════════════════════════════════════
//  DEMO DATA (when Supabase not set)
// ══════════════════════════════════════
const DEMO = [
    {
        id: 'd1', title: 'Fresh Paneer Sabzi', quantity: '4 servings', category: 'cooked', listing_type: 'free',
        location: 'Annapurna Dhaba, Station Road', contact: 'Ramesh – 9812345678', description: 'No onion/garlic.',
        expiry_time: new Date(Date.now() + 3 * 36e5).toISOString(), status: 'available', created_at: new Date().toISOString()
    },
    {
        id: 'd2', title: 'Surplus Bread Loaves', quantity: '8 loaves', category: 'baked', listing_type: 'sale',
        original_price: 160, discount_pct: 50, final_price: 80, upi_id: 'bakery@upi',
        location: 'Modern Bakery, MG Road', contact: 'Baker – 9823456789', description: 'Day-old, great for toast.',
        expiry_time: new Date(Date.now() + 80 * 6e4).toISOString(), status: 'available', created_at: new Date().toISOString()
    },
    {
        id: 'd3', title: 'Mixed Vegetables 1kg', quantity: '1 kg', category: 'fruits', listing_type: 'free',
        location: 'Green Mart, Civil Lines', contact: 'Sunita – 9834567890', description: 'Tomato, potato, onion.',
        expiry_time: new Date(Date.now() + 48 * 36e5).toISOString(), status: 'available', created_at: new Date().toISOString()
    },
    {
        id: 'd4', title: 'Chicken Biryani Boxes', quantity: '12 boxes', category: 'cooked', listing_type: 'sale',
        original_price: 280, discount_pct: 60, final_price: 112, upi_id: 'hotel@upi',
        location: 'Hotel Radiant, NH-31', contact: 'Manager – 9845678901', description: 'Sealed event surplus.',
        expiry_time: new Date(Date.now() + 105 * 6e4).toISOString(), status: 'available', created_at: new Date().toISOString()
    },
    {
        id: 'd5', title: 'Cakes & Pastries', quantity: '15 pieces', category: 'baked', listing_type: 'sale',
        original_price: 400, discount_pct: 70, final_price: 120, upi_id: 'sweets@phonepe',
        location: 'Sweet Dreams Bakery', contact: 'Arjun – 9878901234', description: 'End-of-day stock.',
        expiry_time: new Date(Date.now() + 3 * 36e5).toISOString(), status: 'available', created_at: new Date().toISOString()
    },
    {
        id: 'd6', title: 'Dal Makhani + Roti', quantity: '6 portions', category: 'cooked', listing_type: 'free',
        location: 'Home Kitchen, Sector 4', contact: 'Priya – 9867890123', description: 'Made too much!',
        expiry_time: new Date(Date.now() - 20 * 6e4).toISOString(), status: 'available', created_at: new Date().toISOString()
    }
];

// ══════════════════════════════════════
//  UTILS
// ══════════════════════════════════════
const isConfig = () => SUPABASE_URL.length > 10 && SUPABASE_KEY.length > 10;
const fmtP = n => '₹' + Number(n).toFixed(0);
const CAT = { cooked: '🍲', raw: '🥦', baked: '🍞', fruits: '🍎', packaged: '📦', other: '🥡' };
const genCode = () => 'FB' + Date.now().toString(36).toUpperCase().slice(-6);
const fmtDate = iso => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function toast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.innerHTML = msg; el.className = 'show ' + type;
    setTimeout(() => el.className = '', 4200);
}

function expInfo(iso) {
    const d = new Date(iso) - Date.now(), m = Math.floor(d / 6e4), h = Math.floor(d / 36e5);
    if (d < 0) return { lbl: `Expired ${Math.abs(m) < 60 ? Math.abs(m) + 'm' : Math.abs(h) + 'h'} ago`, cls: 'expired' };
    if (m < 120) return { lbl: `⚡ ${m}m left — URGENT`, cls: 'near' };
    if (h < 6) return { lbl: `⏰ ${h}h ${m % 60}m left`, cls: 'near' };
    return { lbl: `✅ ${h}h left`, cls: 'fresh' };
}

// ══════════════════════════════════════
//  SUPABASE FETCH HELPERS
// ══════════════════════════════════════
const H = () => ({ 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' });

async function sbGet(t, q = '') {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}?order=created_at.desc${q}`, { headers: H() });
    if (!r.ok) throw new Error(r.status);
    return r.json();
}
async function sbPost(t, d, upsert = false) {
    const prefer = upsert ? 'resolution=merge-duplicates,return=representation' : 'return=representation';
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}`, { method: 'POST', headers: { ...H(), 'Prefer': prefer }, body: JSON.stringify(d) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || r.status); }
    return r.json();
}
async function sbPatch(t, id, d) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}?id=eq.${id}`, { method: 'PATCH', headers: { ...H(), 'Prefer': 'return=representation' }, body: JSON.stringify(d) });
    if (!r.ok) throw new Error(r.status);
    return r.json();
}

// ══════════════════════════════════════
//  SUPABASE AUTH
// ══════════════════════════════════════
async function authApiPost(endpoint, body) {
    if (!isConfig()) throw new Error('not_configured');
    const r = await fetch(`${SUPABASE_URL}/auth/v1/${endpoint}`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error_description || data.msg || 'Auth failed');
    return data;
}

// ══════════════════════════════════════
//  AUTH WALL
// ══════════════════════════════════════
function authTab(tab, el) {
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    document.getElementById('form-login').classList.toggle('show', tab === 'login');
    document.getElementById('form-signup').classList.toggle('show', tab === 'signup');
    document.getElementById('login-error').classList.remove('show');
    document.getElementById('signup-error').classList.remove('show');
    document.getElementById('signup-success').classList.remove('show');
}

function selectRole(r) {
    selectedRole = r;
    document.getElementById('role-buyer').classList.toggle('selected', r === 'buyer');
    document.getElementById('role-seller').classList.toggle('selected', r === 'seller');
    document.getElementById('su-upi-wrap').style.display = r === 'seller' ? 'block' : 'none';
}

async function doLogin() {
    const email = document.getElementById('li-email').value.trim();
    const pass = document.getElementById('li-pass').value;
    const errEl = document.getElementById('login-error');
    errEl.classList.remove('show');

    if (!email || !pass) { errEl.textContent = 'Please enter email and password.'; errEl.classList.add('show'); return; }

    // Demo mode — no Supabase configured
    if (!isConfig()) { demoLogin(); return; }

    const btn = document.getElementById('login-btn');
    btn.disabled = true; btn.textContent = '⏳ Logging in…';

    try {
        const data = await authApiPost('token?grant_type=password', { email, password: pass });
        currentUser = data.user;
        currentUser._token = data.access_token;
        localStorage.setItem('fb_session', JSON.stringify({ user: data.user, token: data.access_token }));
        await loadUserProfile();
        launchApp();
    } catch (e) {
        errEl.textContent = e.message.includes('Invalid') ? 'Wrong email or password.' : e.message;
        errEl.classList.add('show');
    } finally { btn.disabled = false; btn.textContent = '🔑 Login to FoodBridge'; }
}

async function doSignup() {
    const name = document.getElementById('su-name').value.trim();
    const email = document.getElementById('su-email').value.trim();
    const phone = document.getElementById('su-phone').value.trim();
    const pass = document.getElementById('su-pass').value;
    const address = document.getElementById('su-address').value.trim();
    const upi = document.getElementById('su-upi').value.trim();
    const errEl = document.getElementById('signup-error');
    const okEl = document.getElementById('signup-success');
    errEl.classList.remove('show'); okEl.classList.remove('show');

    if (!name || !email || !phone || !pass) { errEl.textContent = 'Please fill Name, Email, Phone and Password.'; errEl.classList.add('show'); return; }
    if (pass.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.classList.add('show'); return; }

    if (!isConfig()) {
        // Demo signup — just fake it
        currentUser = { id: 'demo-' + Date.now(), email, _demo: true };
        userProfile = { name, phone, email, address, upi_id: upi, role: selectedRole };
        localStorage.setItem('fb_user_profile', JSON.stringify(userProfile));
        launchApp();
        return;
    }

    const btn = document.getElementById('signup-btn');
    btn.disabled = true; btn.textContent = '⏳ Creating account…';

    try {
        // 1. Create auth user
        const data = await authApiPost('signup', { email, password: pass });
        currentUser = data.user;
        currentUser._token = data.access_token;

        // 2. Save profile to user_profiles table
        const profile = { id: currentUser.id, name, phone, email, address, upi_id: upi, role: selectedRole };
        try { await sbPost('user_profiles', profile, true); }  // upsert=true prevents duplicate error
        catch (e) { console.warn('Profile save error:', e.message); }

        userProfile = profile;
        localStorage.setItem('fb_session', JSON.stringify({ user: currentUser, token: data.access_token }));
        localStorage.setItem('fb_user_profile', JSON.stringify(userProfile));
        launchApp();
    } catch (e) {
        errEl.textContent = e.message.includes('already') ? 'Email already registered. Please login.' : e.message;
        errEl.classList.add('show');
    } finally { btn.disabled = false; btn.textContent = '✨ Create My Account'; }
}

function demoLogin() {
    // Guest mode when Supabase not set up
    currentUser = { id: 'guest-' + Date.now(), email: 'guest@demo.com', _demo: true };
    userProfile = { name: 'Guest User', phone: '0000000000', email: 'guest@demo.com', address: '', upi_id: '', role: 'buyer' };
    document.getElementById('demo-notice').style.display = 'none';
    launchApp();
}

async function doLogout() {
    if (isConfig() && currentUser && !currentUser._demo) {
        try {
            await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + (currentUser._token || '') } });
        } catch (e) { }
    }
    currentUser = null; userProfile = null;
    localStorage.removeItem('fb_session');
    document.getElementById('auth-wall').classList.remove('hidden');
    document.getElementById('app').style.display = 'none';
    document.getElementById('li-email').value = '';
    document.getElementById('li-pass').value = '';
}

async function loadUserProfile() {
    // Try to fetch profile from Supabase
    const cached = localStorage.getItem('fb_user_profile');
    if (cached) userProfile = JSON.parse(cached);
    if (isConfig() && currentUser?.id && !currentUser._demo) {
        try {
            const rows = await sbGet('user_profiles', `&id=eq.${currentUser.id}&limit=1`);
            if (rows.length) {
                userProfile = rows[0];
                localStorage.setItem('fb_user_profile', JSON.stringify(userProfile));
            }
        } catch (e) { }
    }
}

function launchApp() {
    document.getElementById('auth-wall').classList.add('hidden');
    document.getElementById('app').style.display = 'block';
    prefillListingContact();
    loadFoods();
    // Pre-fill profile form
    if (userProfile) {
        document.getElementById('p-name').value = userProfile.name || '';
        document.getElementById('p-phone').value = userProfile.phone || '';
        document.getElementById('p-email').value = userProfile.email || currentUser?.email || '';
        document.getElementById('p-address').value = userProfile.address || '';
        document.getElementById('p-upi').value = userProfile.upi_id || '';
        document.getElementById('p-role').value = userProfile.role || 'buyer';
    }
    updateHeaderChip(); // called AFTER userProfile is set
    // Show demo notice on login form if not configured
    document.getElementById('demo-notice').style.display = isConfig() ? 'none' : 'block';
}

function updateHeaderChip() {
    const name = userProfile?.name || currentUser?.email || 'User';
    document.getElementById('hdr-avatar').textContent = name[0].toUpperCase();
    document.getElementById('hdr-name').textContent = name.split(' ')[0];
}

function prefillListingContact() {
    if (userProfile) {
        const val = (userProfile.name || '') + (userProfile.phone ? ' – ' + userProfile.phone : '');
        document.getElementById('f-contact').value = val;
        document.getElementById('f-upi').value = userProfile.upi_id || '';
    }
}

// ══════════════════════════════════════
//  RESTORE SESSION
// ══════════════════════════════════════
async function restoreSession() {
    const session = localStorage.getItem('fb_session');
    if (session) {
        try {
            const { user, token } = JSON.parse(session);
            currentUser = user;
            currentUser._token = token;
            await loadUserProfile();
            launchApp();
            return;
        } catch (e) { }
    }
    // No session — show auth wall, but show demo notice if not configured
    if (!isConfig()) {
        document.getElementById('demo-notice').style.display = 'block';
    }
}

// ══════════════════════════════════════
//  TABS
// ══════════════════════════════════════
function switchTab(name, el) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    if (el) el.classList.add('active');
    if (name === 'browse') loadFoods();
    if (name === 'deals') loadDeals();
    if (name === 'orders') loadOrders();
    if (name === 'add') {
        document.getElementById('setup-notice').style.display = isConfig() ? 'none' : 'flex';
        prefillListingContact();
    }
    if (name === 'setup') {
        document.getElementById('cfg-url').value = SUPABASE_URL;
        document.getElementById('cfg-key').value = SUPABASE_KEY;
    }
}

function switchOrdersView(view, el) {
    document.getElementById('view-my').style.display = view === 'my' ? 'block' : 'none';
    document.getElementById('view-seller').style.display = view === 'seller' ? 'block' : 'none';
    document.querySelectorAll('.inner-tab').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    if (view === 'seller') loadSellerOrders();
}

// ══════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════
async function saveConfig() {
    const url = document.getElementById('cfg-url').value.trim();
    const key = document.getElementById('cfg-key').value.trim();
    if (!url || !key) { toast('Enter both URL and Key', 'error'); return; }
    SUPABASE_URL = url; SUPABASE_KEY = key;
    localStorage.setItem('sb_url', url); localStorage.setItem('sb_key', key);
    // Test connection
    const st = document.getElementById('connect-status');
    st.style.display = 'flex'; st.className = 'connect-status'; st.textContent = '⏳ Testing connection…';
    try {
        await sbGet('foods', '&limit=1');
        st.className = 'connect-status ok';
        st.textContent = '✅ Connected! Supabase is working perfectly.';
        toast('✅ Supabase connected!');
    } catch (e) {
        st.className = 'connect-status fail';
        st.textContent = '❌ Connection failed. Check your URL and Key, and make sure the SQL was run.';
        toast('Connection failed: ' + e.message, 'error');
    }
}

function copySql() {
    const sql = document.getElementById('sql-block').textContent;
    navigator.clipboard.writeText(sql).then(() => toast('📋 SQL copied to clipboard!')).catch(() => toast('Select the SQL manually and copy it', 'error'));
}

// ══════════════════════════════════════
//  PROFILE
// ══════════════════════════════════════
async function saveProfile() {
    const name = document.getElementById('p-name').value.trim();
    const phone = document.getElementById('p-phone').value.trim();
    const address = document.getElementById('p-address').value.trim();
    const upi = document.getElementById('p-upi').value.trim();
    const role = document.getElementById('p-role').value;
    if (!name || !phone) { toast('Name and phone are required', 'error'); return; }

    const btn = document.getElementById('save-profile-btn');
    btn.disabled = true; btn.textContent = '⏳ Saving…';

    const payload = { name, phone, address, upi_id: upi, role, email: currentUser?.email || '' };

    try {
        if (isConfig() && currentUser && !currentUser._demo) {
            // Upsert into user_profiles (works for both new and existing profiles)
            await sbPost('user_profiles', { id: currentUser.id, ...payload }, true);
        }
        userProfile = { ...userProfile, ...payload };
        localStorage.setItem('fb_user_profile', JSON.stringify(userProfile));
        updateHeaderChip();
        prefillListingContact();
        toast('✅ Profile saved!');
        // Update display
        document.getElementById('profile-big-avatar').textContent = name[0].toUpperCase();
        document.getElementById('profile-name-show').textContent = name;
        document.getElementById('profile-sub-show').textContent = phone + ' · ' + role;
        document.getElementById('profile-display-row').style.display = 'flex';
        document.getElementById('profile-hint-txt').style.display = 'none';
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = '💾 Save Profile'; }
}

// ══════════════════════════════════════
//  FOOD LISTING
// ══════════════════════════════════════
function setType(t) {
    listingType = t;
    document.getElementById('btn-free').className = 'type-btn' + (t === 'free' ? ' af' : '');
    document.getElementById('btn-sale').className = 'type-btn' + (t === 'sale' ? ' as' : '');
    document.getElementById('sale-fields').classList.toggle('show', t === 'sale');
    const btn = document.getElementById('submit-btn');
    btn.className = t === 'sale' ? 'btn ss' : 'btn';
    btn.textContent = t === 'sale' ? '🏷️ Post Discount Deal' : '🚀 Post Listing';
}

function calcPrice() {
    const o = parseFloat(document.getElementById('f-orig').value) || 0;
    const d = parseFloat(document.getElementById('f-disc').value) || 0;
    const p = document.getElementById('price-preview');
    if (!o || !d) { p.innerHTML = 'Enter price<br/>&amp; %'; return; }
    const f = o * (1 - d / 100), s = o - f;
    p.innerHTML = `<strong>${fmtP(f)}</strong>${fmtP(o)} <span style="color:var(--accent);font-weight:700">-${d}%</span><br/><small>Save ${fmtP(s)}</small>`;
}

async function addFood() {
    const v = id => document.getElementById(id).value.trim();
    const title = v('f-title'), qty = v('f-qty'), loc = v('f-loc'), expiry = v('f-expiry');
    if (!title || !qty || !loc || !expiry) { toast('Fill all required fields (*)', 'error'); return; }
    if (new Date(expiry) <= new Date()) { toast('Expiry must be in future!', 'error'); return; }
    let orig = null, disc = null, final = null, upi = '';
    if (listingType === 'sale') {
        orig = parseFloat(document.getElementById('f-orig').value) || 0;
        disc = parseInt(document.getElementById('f-disc').value) || 0;
        upi = v('f-upi');
        if (!orig || !disc) { toast('Enter price and discount %', 'error'); return; }
        final = +(orig * (1 - disc / 100)).toFixed(2);
    }
    const btn = document.getElementById('submit-btn');
    btn.disabled = true; btn.textContent = '⏳ Posting…';
    const payload = {
        title, quantity: qty, category: document.getElementById('f-cat').value,
        location: loc, contact: v('f-contact'), description: v('f-desc'),
        listing_type: listingType, original_price: orig, discount_pct: disc, final_price: final, upi_id: upi,
        expiry_time: new Date(expiry).toISOString(), status: 'available',
        user_id: currentUser?.id || null
    };
    try {
        if (!isConfig() || currentUser?._demo) {
            payload.id = 'loc-' + Date.now(); payload.created_at = new Date().toISOString();
            DEMO.unshift(payload); allFoods.unshift(payload);
        } else {
            await sbPost('foods', payload);
        }
        toast(listingType === 'sale' ? '🏷️ Deal posted!' : '✅ Listing posted!', listingType === 'sale' ? 'sale' : 'success');
        ['f-title', 'f-qty', 'f-loc', 'f-expiry', 'f-desc', 'f-orig', 'f-disc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        document.getElementById('price-preview').innerHTML = 'Enter price<br/>&amp; %';
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = listingType === 'sale' ? '🏷️ Post Discount Deal' : '🚀 Post Listing'; }
}

// ══════════════════════════════════════
//  FOOD DATA
// ══════════════════════════════════════
async function loadFoods() {
    setLoader('loader', true);
    document.getElementById('food-grid').innerHTML = '';
    document.getElementById('empty-browse').style.display = 'none';
    const nb = document.getElementById('setup-notice-browse');
    nb.style.display = 'none';
    try {
        allFoods = isConfig() && !currentUser?._demo ? await sbGet('foods') : DEMO;
        if (!isConfig() || currentUser?._demo) nb.style.display = 'flex';
    } catch (e) { allFoods = DEMO; nb.style.display = 'flex'; }
    renderGrid(allFoods, 'food-grid', 'empty-browse');
    updateStats(allFoods);
    setLoader('loader', false);
}

async function loadDeals() {
    setLoader('loader-deals', true);
    document.getElementById('deals-grid').innerHTML = '';
    document.getElementById('empty-deals').style.display = 'none';
    try {
        const d = isConfig() && !currentUser?._demo
            ? await sbGet('foods', '&listing_type=eq.sale')
            : DEMO.filter(f => f.listing_type === 'sale');
        renderGrid(d, 'deals-grid', 'empty-deals');
    } catch (e) { renderGrid(DEMO.filter(f => f.listing_type === 'sale'), 'deals-grid', 'empty-deals'); }
    setLoader('loader-deals', false);
}

function setLoader(id, on) { document.getElementById(id).classList.toggle('show', on); }

function updateStats(f) {
    const now = Date.now();
    document.getElementById('stat-total').textContent = f.length;
    document.getElementById('stat-free').textContent = f.filter(x => x.listing_type !== 'sale' && x.status === 'available' && new Date(x.expiry_time) > now).length;
    document.getElementById('stat-deals').textContent = f.filter(x => x.listing_type === 'sale' && x.status === 'available' && new Date(x.expiry_time) > now).length;
}

// ══════════════════════════════════════
//  RENDER GRID
// ══════════════════════════════════════
function renderGrid(foods, gridId, emptyId) {
    const g = document.getElementById(gridId);
    g.innerHTML = '';
    if (!foods.length) { document.getElementById(emptyId).style.display = 'block'; return; }
    foods.forEach(f => {
        const ei = expInfo(f.expiry_time);
        const isSale = f.listing_type === 'sale';
        const isClaimed = f.status === 'claimed' || f.status === 'sold';
        const isExpired = ei.cls === 'expired';
        const cardCls = isClaimed ? (isSale ? 'sold' : 'claimed') : isExpired ? 'expired' : isSale ? 'for-sale' : ei.cls === 'near' ? 'near-expiry' : 'fresh';
        const bdgCls = isClaimed ? (isSale ? 'sold' : 'claimed') : isExpired ? 'expired' : isSale ? 'sale' : ei.cls === 'near' ? 'near' : 'fresh';
        const bdgTxt = isClaimed ? (isSale ? '🏷️ Sold' : '📦 Claimed') : isExpired ? '❌ Expired' : isSale ? '🏷️ On Sale' : ei.cls === 'near' ? '⚡ Urgent' : '✅ Free';
        const cdCls = isClaimed ? (isSale ? 'sold' : 'claimed') : isExpired ? 'expired' : isSale ? 'sale' : ei.cls === 'near' ? 'near' : 'fresh';
        const cdLbl = isClaimed ? (isSale ? '🎉 Sold out!' : '🎉 Claimed') : ei.lbl;
        const icon = CAT[f.category || 'other'] || '🥡';
        let priceHTML = '';
        if (isSale && f.original_price) {
            const sav = f.original_price - f.final_price, hot = f.discount_pct >= 50;
            priceHTML = `<div class="price-block">
        <div><div class="orig-price">${fmtP(f.original_price)}</div>
        <div class="final-price">${fmtP(f.final_price)}</div>
        <div class="savings-tag">Save ${fmtP(sav)}</div></div>
        <div style="text-align:right">
          <span class="disc-badge ${hot ? 'hot' : ''}">${f.discount_pct}% OFF${hot ? ' 🔥' : ''}</span>
          ${f.upi_id ? `<div style="font-size:.65rem;color:var(--muted);margin-top:3px">UPI: ${f.upi_id}</div>` : ''}
        </div></div>`;
        }
        let action = '';
        if (isClaimed || isExpired) {
            action = `<button class="claim-btn" disabled>${isClaimed ? (isSale ? 'Sold Out' : 'Claimed ✓') : 'Expired'}</button>`;
        } else if (isSale) {
            action = `<div class="action-row">
        <button class="claim-btn sb" onclick="openOrderModal('${f.id}')">📋 Order ${fmtP(f.final_price)}</button>
        ${f.contact ? `<button class="wa-btn" onclick="waContact('${f.contact}','${f.title.replace(/'/g, "\\'")}',${f.final_price})">💬</button>` : ''}
      </div>`;
        } else {
            action = `<div class="action-row">
        <button class="claim-btn ob" onclick="openOrderModal('${f.id}')">📋 Request / Claim</button>
        ${f.contact ? `<button class="wa-btn" onclick="waContact('${f.contact}','${f.title.replace(/'/g, "\\'")}',0)">💬</button>` : ''}
      </div>`;
        }
        g.innerHTML += `
    <div class="food-card ${cardCls}" data-id="${f.id}">
      ${isSale ? '<div class="sale-ribbon">DEAL</div>' : ''}
      <div class="card-header">
        <div class="card-title">${icon} ${f.title}</div>
        <span class="badge ${bdgCls}">${bdgTxt}</span>
      </div>
      <div class="card-meta">
        <div class="meta-row"><span>📦</span><span>${f.quantity}</span></div>
        <div class="meta-row"><span>📍</span><span class="meta-val">${f.location}</span></div>
        ${f.contact ? `<div class="meta-row"><span>📞</span><span>${f.contact}</span></div>` : ''}
        ${f.description ? `<div class="meta-row"><span>📝</span><span style="color:var(--muted);font-size:.75rem">${f.description}</span></div>` : ''}
      </div>
      ${priceHTML}
      <div class="expiry-cd ${cdCls}">${cdLbl}</div>
      <div style="font-size:.69rem;color:var(--muted);margin-bottom:9px">🕐 Exp: ${fmtDate(f.expiry_time)}</div>
      ${action}
    </div>`;
    });
}

function filterCards() {
    const q = document.getElementById('search-box').value.toLowerCase();
    const s = document.getElementById('filter-status').value;
    const t = document.getElementById('filter-type').value;
    renderGrid(allFoods.filter(f =>
        (!q || (f.title + f.location).toLowerCase().includes(q)) &&
        (s === 'all' || f.status === s) &&
        (t === 'all' || (f.listing_type || 'free') === t)
    ), 'food-grid', 'empty-browse');
}

// ══════════════════════════════════════
//  ORDER MODAL
// ══════════════════════════════════════
function openOrderModal(foodId) {
    const f = [...DEMO, ...allFoods].find(x => x.id === foodId);
    if (!f) return;
    pendingOrderFoodId = foodId;
    const isSale = f.listing_type === 'sale';
    document.getElementById('om-heading').textContent = isSale ? '💳 Place Order' : '📋 Request Food';
    document.getElementById('om-food-title').textContent = f.title + ' × ' + f.quantity;
    document.getElementById('om-food-loc').textContent = '📍 ' + f.location;
    const pb = document.getElementById('om-price-block');
    if (isSale && f.final_price) { pb.style.display = 'block'; document.getElementById('om-price').textContent = fmtP(f.final_price); }
    else pb.style.display = 'none';
    const un = document.getElementById('om-upi-note');
    if (isSale && f.upi_id) { un.style.display = 'block'; document.getElementById('om-upi-id').textContent = f.upi_id; }
    else un.style.display = 'none';
    const sb = document.getElementById('om-submit');
    sb.className = 'mc ' + (isSale ? 'buy' : 'ord');
    sb.textContent = isSale ? '✅ Confirm Purchase' : '✅ Submit Request';
    // Auto-fill from profile
    if (userProfile) {
        document.getElementById('om-name').value = userProfile.name || '';
        document.getElementById('om-phone').value = userProfile.phone || '';
        document.getElementById('om-email').value = userProfile.email || currentUser?.email || '';
        document.getElementById('om-address').value = userProfile.address || '';
    }
    document.getElementById('order-modal').classList.add('show');
}
function closeOrderModal() { document.getElementById('order-modal').classList.remove('show'); pendingOrderFoodId = null; }

async function submitOrder() {
    const name = document.getElementById('om-name').value.trim();
    const phone = document.getElementById('om-phone').value.trim();
    const email = document.getElementById('om-email').value.trim();
    const address = document.getElementById('om-address').value.trim();
    const qtyReq = document.getElementById('om-qty').value.trim();
    const msg = document.getElementById('om-msg').value.trim();
    if (!name || !phone) { toast('Name and phone are required', 'error'); return; }
    const food = [...DEMO, ...allFoods].find(x => x.id === pendingOrderFoodId);
    if (!food) return;
    const isSale = food.listing_type === 'sale';
    const ackCode = genCode();
    const btn = document.getElementById('om-submit');
    btn.disabled = true; btn.textContent = '⏳ Placing order…';

    // Update profile locally
    if (userProfile) {
        userProfile.name = name; userProfile.phone = phone;
        localStorage.setItem('fb_user_profile', JSON.stringify(userProfile));
    }

    const orderPayload = {
        food_id: food.id.startsWith('d') || food.id.startsWith('loc-') ? null : food.id,
        buyer_id: currentUser?._demo ? null : currentUser?.id || null,
        buyer_name: name, buyer_phone: phone, buyer_email: email, buyer_address: address,
        quantity_req: qtyReq, message: msg,
        order_type: isSale ? 'purchase' : 'claim',
        amount: isSale ? food.final_price : 0,
        status: 'pending', ack_code: ackCode
    };

    try {
        if (isConfig() && !currentUser?._demo) {
            await sbPost('orders', orderPayload);
            if (isSale) await sbPatch('foods', food.id, { status: 'sold' });
            else await sbPatch('foods', food.id, { status: 'claimed' });
        } else {
            orderPayload.id = 'ord-' + Date.now();
            orderPayload.created_at = new Date().toISOString();
            orderPayload._food_title = food.title;
            orderPayload._food_loc = food.location;
            DEMO_ORDERS.unshift(orderPayload);
            const df = [...DEMO, ...allFoods].find(x => x.id === pendingOrderFoodId);
            if (df) df.status = isSale ? 'sold' : 'claimed';
        }
        updateCardToClaimed(pendingOrderFoodId, isSale);
        updateStats(allFoods);
        closeOrderModal();
        showAck({ ackCode, name, phone, foodTitle: food.title, foodLoc: food.location, amount: isSale ? food.final_price : 0, isSale, sellerContact: food.contact || '—', upiId: food.upi_id || '' });
        // Update orders count
        const prev = parseInt(document.getElementById('stat-orders').textContent) || 0;
        document.getElementById('stat-orders').textContent = prev + 1;
    } catch (e) { toast('Order failed: ' + e.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = isSale ? '✅ Confirm Purchase' : '✅ Submit Request'; }
}

// ══════════════════════════════════════
//  ACKNOWLEDGEMENT
// ══════════════════════════════════════
function showAck({ ackCode, name, phone, foodTitle, foodLoc, amount, isSale, sellerContact, upiId }) {
    document.getElementById('ack-icon').textContent = isSale ? '🎉' : '✅';
    document.getElementById('ack-heading').textContent = isSale ? 'Purchase Confirmed!' : 'Request Placed!';
    document.getElementById('ack-order-id').textContent = ackCode;
    document.getElementById('ack-details').innerHTML = `
    <span>🍱 <b>${foodTitle}</b></span>
    <span>📍 ${foodLoc}</span>
    <span>👤 <b>${name}</b> (${phone})</span>
    ${amount > 0 ? `<span>💰 Amount: <b style="color:var(--discount)">${fmtP(amount)}</b></span>` : '<span>🆓 <b>Free claim</b></span>'}
    <span>📞 Seller: <b>${sellerContact}</b></span>
    ${upiId ? `<span>💳 Pay to: <b style="color:var(--discount)">${upiId}</b></span>` : ''}`;
    document.getElementById('ack-msg').textContent = isSale
        ? 'Pay via UPI & show screenshot to seller on pickup.'
        : 'Seller has been notified. Go to pickup location to collect.';
    document.getElementById('ack-modal').classList.add('show');
}
function closeAckModal() { document.getElementById('ack-modal').classList.remove('show'); }

// ══════════════════════════════════════
//  MY ORDERS
// ══════════════════════════════════════
async function loadOrders() {
    setLoader('loader-orders', true);
    document.getElementById('my-orders-list').innerHTML = '';
    document.getElementById('empty-my').style.display = 'none';
    try {
        let orders = [];
        if (isConfig() && !currentUser?._demo && currentUser?.id) {
            orders = await sbGet('orders', `&buyer_id=eq.${currentUser.id}`);
        } else {
            orders = DEMO_ORDERS.filter(o => userProfile && o.buyer_phone === userProfile.phone);
        }
        document.getElementById('stat-orders').textContent = orders.length;
        if (!orders.length) document.getElementById('empty-my').style.display = 'block';
        else renderMyOrders(orders);
    } catch (e) {
        toast('Error loading orders: ' + e.message, 'error');
        document.getElementById('empty-my').style.display = 'block';
    }
    setLoader('loader-orders', false);
}

function renderMyOrders(orders) {
    const el = document.getElementById('my-orders-list');
    el.innerHTML = '';
    orders.forEach(o => {
        const food = allFoods.find(f => f.id === o.food_id) || DEMO.find(f => f.id === o.food_id);
        const title = o._food_title || (food?.title) || 'Food Item';
        const loc = o._food_loc || (food?.location) || '—';
        const si = o.status === 'confirmed' ? '✅' : o.status === 'cancelled' ? '❌' : '⏳';
        el.innerHTML += `
    <div class="ack-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;gap:8px">
        <div>
          <div style="font-family:Syne,sans-serif;font-weight:700;font-size:.94rem">🍱 ${title}</div>
          <div style="font-size:.68rem;color:var(--muted);font-family:monospace;margin-top:2px">${o.ack_code || o.id?.slice(0, 8) || '—'}</div>
        </div>
        <span class="status-pill ${o.status}">${si} ${o.status.charAt(0).toUpperCase() + o.status.slice(1)}</span>
      </div>
      <div class="ack-meta">
        <span>📍 <b>${loc}</b></span>
        <span>🕐 <b>${fmtDate(o.created_at)}</b></span>
        <span>💳 <b>${o.amount > 0 ? fmtP(o.amount) : 'Free'}</b></span>
        <span>📦 ${o.quantity_req || 'As available'}</span>
      </div>
      ${o.seller_note ? `<div class="ack-note">📢 Seller: "${o.seller_note}"</div>` : ''}
      ${o.status === 'pending' ? `<div class="ack-note" style="border-left-color:var(--warn);margin-top:7px">⏳ Awaiting seller confirmation…</div>` : ''}
    </div>`;
    });
}

// ══════════════════════════════════════
//  SELLER ORDERS (incoming)
// ══════════════════════════════════════
async function loadSellerOrders() {
    setLoader('loader-seller', true);
    document.getElementById('seller-orders-list').innerHTML = '';
    document.getElementById('empty-seller').style.display = 'none';
    try {
        let orders = [];
        if (isConfig() && !currentUser?._demo && currentUser?.id) {
            // Get orders for foods listed by this user
            const myFoods = await sbGet('foods', `&user_id=eq.${currentUser.id}`);
            if (myFoods.length) {
                const ids = myFoods.map(f => `"${f.id}"`).join(',');
                orders = await sbGet('orders', `&food_id=in.(${ids})`);
                // Attach food title/loc
                orders = orders.map(o => { const f = myFoods.find(x => x.id === o.food_id); return { ...o, _food_title: f?.title, _food_loc: f?.location }; });
            }
        } else {
            orders = DEMO_ORDERS;
        }
        if (!orders.length) document.getElementById('empty-seller').style.display = 'block';
        else renderSellerOrders(orders);
    } catch (e) {
        if (DEMO_ORDERS.length) renderSellerOrders(DEMO_ORDERS);
        else document.getElementById('empty-seller').style.display = 'block';
    }
    setLoader('loader-seller', false);
}

function renderSellerOrders(orders) {
    const el = document.getElementById('seller-orders-list');
    el.innerHTML = '';
    orders.forEach(o => {
        const food = allFoods.find(f => f.id === o.food_id) || DEMO.find(f => f.id === o.food_id);
        const title = o._food_title || (food?.title) || 'Food Item';
        const si = o.status === 'confirmed' ? '✅' : o.status === 'cancelled' ? '❌' : '⏳';
        el.innerHTML += `
    <div class="order-card ${o.status}">
      <div class="order-header">
        <div>
          <div class="order-title">🍱 ${title}</div>
          <div style="font-size:.67rem;color:var(--muted);font-family:monospace">${o.ack_code || o.id?.slice(0, 8) || '—'}</div>
        </div>
        <span class="status-pill ${o.status}">${si} ${o.status.charAt(0).toUpperCase() + o.status.slice(1)}</span>
      </div>
      <div class="order-meta">
        <span>👤 <b>${o.buyer_name}</b></span>
        <span>📞 <b>${o.buyer_phone}</b></span>
        ${o.buyer_email ? `<span>📧 <b>${o.buyer_email}</b></span>` : ''}
        ${o.buyer_address ? `<span>📍 <b>${o.buyer_address}</b></span>` : ''}
        <span>📦 Needs: <b>${o.quantity_req || 'as available'}</b></span>
        <span>💳 <b>${o.amount > 0 ? fmtP(o.amount) : 'Free claim'}</b></span>
        ${o.message ? `<span>💬 "${o.message}"</span>` : ''}
        <span>🕐 <b>${fmtDate(o.created_at)}</b></span>
      </div>
      ${o.status === 'pending' ? `
      <div class="order-actions">
        <button class="confirm-btn" onclick="updateOrderStatus('${o.id}','confirmed',this)">✅ Confirm</button>
        <button class="cancel-btn"  onclick="updateOrderStatus('${o.id}','cancelled',this)">❌ Cancel</button>
      </div>`: `<div style="font-size:.76rem;color:var(--muted)">Order ${o.status}. No action needed.</div>`}
    </div>`;
    });
}

async function updateOrderStatus(orderId, newStatus, btn) {
    btn.disabled = true;
    try {
        if (isConfig() && !currentUser?._demo) {
            await sbPatch('orders', orderId, { status: newStatus });
        } else {
            const o = DEMO_ORDERS.find(x => x.id === orderId);
            if (o) o.status = newStatus;
        }
        toast(newStatus === 'confirmed' ? '✅ Order confirmed!' : '❌ Order cancelled.', newStatus === 'confirmed' ? 'success' : 'error');
        loadSellerOrders();
    } catch (e) { toast('Error: ' + e.message, 'error'); btn.disabled = false; }
}

// ══════════════════════════════════════
//  WHATSAPP
// ══════════════════════════════════════
function waContact(contact, title, price) {
    const ph = contact.replace(/\D/g, '');
    const msg = price > 0 ? `Hi! I want to order "${title}" for ₹${price} (FoodBridge). Still available?` : `Hi! I want to claim "${title}" for free (FoodBridge). Still available?`;
    window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ══════════════════════════════════════
//  UPDATE CARD UI
// ══════════════════════════════════════
function updateCardToClaimed(id, isSale) {
    document.querySelectorAll(`[data-id="${id}"]`).forEach(card => {
        card.className = `food-card ${isSale ? 'sold' : 'claimed'}`;
        const b = card.querySelector('.badge');
        if (b) { b.className = 'badge ' + (isSale ? 'sold' : 'claimed'); b.textContent = isSale ? '🏷️ Sold' : '📦 Claimed'; }
        const c = card.querySelector('.expiry-cd');
        if (c) { c.className = 'expiry-cd ' + (isSale ? 'sold' : 'claimed'); c.textContent = isSale ? '🎉 Sold!' : '🎉 Requested!'; }
        const ar = card.querySelector('.action-row');
        if (ar) ar.outerHTML = `<button class="claim-btn" disabled>${isSale ? 'Sold Out' : 'Requested ✓'}</button>`;
    });
}

// ══════════════════════════════════════
//  DEFAULT EXPIRY
// ══════════════════════════════════════
function setDefaultExpiry() {
    const d = new Date(Date.now() + 4 * 36e5);
    document.getElementById('f-expiry').value = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
}

// ══════════════════════════════════════
//  INIT
// ══════════════════════════════════════
window.addEventListener('load', () => {
    setDefaultExpiry();
    if (!isConfig()) document.getElementById('demo-notice').style.display = 'block';
    restoreSession();
});

// Close modals on overlay click
['order-modal', 'ack-modal'].forEach(id => {
    document.getElementById(id).addEventListener('click', function (e) { if (e.target === this) document.getElementById(id).classList.remove('show'); });
});

// Enter key on login form
document.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        const authWall = document.getElementById('auth-wall');
        if (!authWall.classList.contains('hidden')) {
            const activeForm = document.querySelector('.auth-form.show');
            if (activeForm?.id === 'form-login') doLogin();
            if (activeForm?.id === 'form-signup') doSignup();
        }
    }
});