/* ===============================
   TPG – Combined App (ORDER + MEMBERSHIP)
   Firestore: loyaltymembertpg (single DB)
   =============================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
  serverTimestamp,
  runTransaction,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

/** =========================
 * CONFIG (loyaltymembertpg)
 * ========================= */
const firebaseConfig = {
  apiKey: "AIzaSyBPAPvzRAHLUVCVB1x7BbmgImB7IAQcrpY",
  authDomain: "loyaltymembertpg.firebaseapp.com",
  projectId: "loyaltymembertpg",
  storageBucket: "loyaltymembertpg.firebasestorage.app",
  messagingSenderId: "177443242278",
  appId: "1:177443242278:web:8aac0f53f1362abcf641e7"
};

const ADMIN_EMAIL = "dinijanuari23@gmail.com";

/** Redeem rules (membership) */
const REDEEM_MIN = 100;
const REDEEM_MAX = 400;
const DISCOUNT_PER_POINT_RP = 10; // 1 poin = Rp10 => 100 poin = Rp1000

/** Order Open/Close settings doc */
const STORE_DOC_PATH = ["settings", "store"];

/** Telegram (order) */
const TG_TOKEN = "1868293159:AAF7IWMtOEqmVqEkBAfCTexkj_siZiisC0E";
const TG_CHAT_ID = "-1003629941301";

/** Payment QR */
const ORDER_QR_URL = "https://payment.uwu.ai/assets/images/gallery03/8555ed8a_original.jpg?v=58e63277";

/** =========================
 * INIT
 * ========================= */
const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const auth = getAuth(fbApp);
const provider = new GoogleAuthProvider();

const $app = document.getElementById("app");
const $topbarRight = document.getElementById("topbarRight");

/** =========================
 * GLOBAL STATE
 * ========================= */
let storeOpen = true;

const state = {
  // route
  route: "order", // order | membership | admin
  adminUser: null,

  // membership public
  publicView: "landing", // landing | register | lookup | member
  memberCode: "",
  member: null,
  memberTab: "vouchers" // vouchers | redeem
};

/** =========================
 * Helpers (shared)
 * ========================= */
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function nowMs(){ return Date.now(); }
function tsMs(ts){ return ts?.toMillis ? ts.toMillis() : (ts ? new Date(ts).getTime() : 0); }

function rupiah(n){
  const v = Number(n ?? 0);
  return v.toLocaleString("id-ID");
}

function fmtDate(ts) {
  if (!ts) return "-";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("id-ID", { year:"numeric", month:"short", day:"2-digit" });
}

function clampRedeemPoints(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < REDEEM_MIN || i > REDEEM_MAX) return null;
  return i;
}

/** =========================
 * iOS-like Modal (membership)
 * ========================= */
function ensureIosModal() {
  if (document.getElementById("iosModal")) return;

  const wrap = document.createElement("div");
  wrap.id = "iosModal";
  wrap.innerHTML = `
    <div class="ios-backdrop hidden" id="iosBackdrop">
      <div class="ios-sheet" role="dialog" aria-modal="true">
        <div class="ios-head">
          <div class="ios-title" id="iosTitle">Notification</div>
          <div class="ios-msg" id="iosMsg"></div>
        </div>

        <div class="ios-inputWrap hidden" id="iosInputWrap">
          <input class="ios-input" id="iosInput" />
        </div>

        <div class="ios-actions" id="iosActions"></div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  document.getElementById("iosBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "iosBackdrop") {
      // no-op
    }
  });
}

function iosModal({ title="Notification", message="", input=false, placeholder="", okText="OK", cancelText="Cancel", danger=false }) {
  ensureIosModal();

  const backdrop = document.getElementById("iosBackdrop");
  const t = document.getElementById("iosTitle");
  const m = document.getElementById("iosMsg");
  const inputWrap = document.getElementById("iosInputWrap");
  const inputEl = document.getElementById("iosInput");
  const actions = document.getElementById("iosActions");

  t.textContent = title;
  m.textContent = message;

  actions.innerHTML = "";
  inputWrap.classList.toggle("hidden", !input);
  if (input) {
    inputEl.value = "";
    inputEl.placeholder = placeholder || "";
    setTimeout(() => inputEl.focus(), 50);
  }

  backdrop.classList.remove("hidden");

  return new Promise((resolve) => {
    const btnCancel = document.createElement("button");
    btnCancel.className = "ios-btn";
    btnCancel.textContent = cancelText;

    const btnOk = document.createElement("button");
    btnOk.className = "ios-btn ios-ok" + (danger ? " ios-danger" : "");
    btnOk.textContent = okText;

    if (cancelText) actions.appendChild(btnCancel);
    actions.appendChild(btnOk);

    const cleanup = () => {
      backdrop.classList.add("hidden");
      btnCancel.onclick = null;
      btnOk.onclick = null;
      document.onkeydown = null;
    };

    btnCancel.onclick = () => { cleanup(); resolve({ ok:false, value:null }); };
    btnOk.onclick = () => {
      const val = input ? (inputEl.value ?? "").trim() : null;
      cleanup();
      resolve({ ok:true, value: val });
    };

    document.onkeydown = (ev) => {
      if (ev.key === "Escape" && cancelText) { cleanup(); resolve({ ok:false, value:null }); }
      if (ev.key === "Enter") { btnOk.click(); }
    };
  });
}

async function iosAlert(title, message, okText="OK") {
  await iosModal({ title, message, input:false, okText, cancelText:"" });
}
async function iosConfirm(title, message, okText="OK", cancelText="Cancel", danger=false) {
  const res = await iosModal({ title, message, input:false, okText, cancelText, danger });
  return res.ok;
}
async function iosPrompt(title, message, placeholder="", okText="OK", cancelText="Cancel") {
  const res = await iosModal({ title, message, input:true, placeholder, okText, cancelText });
  if (!res.ok) return null;
  return res.value;
}

/** =========================
 * Order popup (existing style)
 * ========================= */
function showValidationPopupCenter(title, message, submessage){
  const existing = document.getElementById('validationCenterPopup');
  if(existing) existing.remove();

  const container = document.getElementById('validationContainer') || document.body;

  const popup = document.createElement('div');
  popup.id = 'validationCenterPopup';
  popup.className = 'validation-center';
  popup.tabIndex = -1;

  const safeTitle = title || 'Notification';
  const safeMsg = message || '';
  const safeSub = submessage || '';

  popup.innerHTML = `
    <div class="hdr">${safeTitle}</div>
    <div class="divider"></div>
    <div class="txt">${safeMsg}</div>
    ${safeSub ? `<div class="subtxt">${safeSub}</div>` : ``}
    <div class="btnRow">
      <button type="button" class="okbtn">OK</button>
    </div>
  `;

  container.appendChild(popup);

  const okBtn = popup.querySelector('.okbtn');

  function removePopup(){
    popup.style.transition = 'opacity 160ms ease, transform 160ms ease';
    popup.style.opacity = '0';
    popup.style.transform = 'translate(-50%,-50%) scale(.98)';
    setTimeout(()=> popup.remove(), 170);
  }

  okBtn.addEventListener('click', removePopup);
  popup.focus({preventScroll:true});

  const t = setTimeout(removePopup, 7000);
  window.addEventListener('pagehide', ()=>{ clearTimeout(t); if(popup) popup.remove(); }, { once:true });
}

/** =========================
 * Store Open/Close listener
 * ========================= */
function startStoreListener(){
  const ref = doc(db, STORE_DOC_PATH[0], STORE_DOC_PATH[1]);
  onSnapshot(ref, (snap) => {
    if(snap.exists()){
      const data = snap.data();
      storeOpen = (data.open !== false);
    } else storeOpen = true;
    updateAdminStoreBadge();
  }, () => {
    storeOpen = true;
    updateAdminStoreBadge();
  });
}

/** =========================
 * Router helpers
 * ========================= */
function parseRouteFromHash(){
  const h = (location.hash || "").toLowerCase();
  if(h.startsWith("#admin")) return "admin";
  if(h.startsWith("#membership")) return "membership";
  if(h.startsWith("#order") || h === "" || h === "#") return "order";
  return "order";
}

function setTopbar(){
  const isAdmin = !!(state.adminUser && (state.adminUser.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase());

  const leftBtns = `
    <a class="badge link" href="#order">Order</a>
    <a class="badge link" href="#membership">Membership</a>
    <a class="badge link" href="#admin">Admin</a>
  `;

  if(state.route !== "admin"){
    $topbarRight.innerHTML = leftBtns;
    return;
  }

  if(!state.adminUser){
    $topbarRight.innerHTML = leftBtns + `<span class="badge">Admin mode</span>`;
    return;
  }

  $topbarRight.innerHTML = leftBtns + `
    <span class="badge ok">Admin: ${escapeHtml(state.adminUser.email)}</span>
    <button class="btn secondary" id="btnLogout">Logout</button>
  `;
  document.getElementById("btnLogout")?.addEventListener("click", () => signOut(auth));
}

/** =========================
 * ORDER VIEW (Pricelist + Form)
 * ========================= */
function renderOrderPage(){
  // UI utama order (render di #app). Kamu bisa edit daftar harga di sini kapanpun.
  $app.innerHTML = `
    <div class="page">

      <div class="category">
        <h3>⚡️Best Offers</h3>
        <div class="prcContainer">
          <div class="bc" data-nm="580 Robux" data-hg="90000" data-kt="fs">580 Robux<span>Rp90.000</span></div>
          <div class="bc" data-nm="660 Robux" data-hg="106000" data-kt="fs">660 Robux<span>Rp106.000</span></div>
          <div class="bc" data-nm="740 Robux" data-hg="122000" data-kt="fs">740 Robux<span>Rp122.000</span></div>
          <div class="bc" data-nm="820 Robux" data-hg="136000" data-kt="fs">820 Robux<span>Rp136.000</span></div>
          <div class="bc" data-nm="1240 Robux" data-hg="196000" data-kt="fs">1240 Robux<span>Rp196.000</span></div>
        </div>
      </div>

      <div class="category">
        <h3>Robux Reguler</h3>
        <div class="prcContainer">
          <div class="bc" data-nm="80 Robux" data-hg="16000" data-kt="reg">80 Robux<span>Rp16.000</span></div>
          <div class="bc" data-nm="160 Robux" data-hg="32000" data-kt="reg">160 Robux<span>Rp32.000</span></div>
          <div class="bc" data-nm="240 Robux" data-hg="48000" data-kt="reg">240 Robux<span>Rp48.000</span></div>
          <div class="bc" data-nm="320 Robux" data-hg="62000" data-kt="reg">320 Robux<span>Rp62.000</span></div>
          <div class="bc" data-nm="400 Robux" data-hg="000" data-kt="reg">400 Robux<span>No Stock</span></div>
          <div class="bc" data-nm="480 Robux" data-hg="000" data-kt="reg">480 Robux<span>No Stock</span></div>
          <div class="bc" data-nm="560 Robux" data-hg="000" data-kt="reg">560 Robux<span>No Stock</span></div>
          <div class="bc" data-nm="640 Robux" data-hg="000" data-kt="reg">640 Robux<span>No Stock</span></div>
          <div class="bc" data-nm="720 Robux" data-hg="000" data-kt="reg">720 Robux<span>No Stock</span></div>
          <div class="bc" data-nm="800 Robux" data-hg="000" data-kt="reg">800 Robux<span>No Stock</span></div>
          <div class="bc" data-nm="1740 Robux" data-hg="270000" data-kt="reg">1.740 Robux<span>Rp270.000</span></div>
        </div>
      </div>

      <div class="category">
        <h3>Robux Basic</h3>
        <div class="prcContainer">
          <div class="bc" data-nm="500 Robux" data-hg="74000" data-kt="spc">500 Robux<span>Rp74.000</span></div>
          <div class="bc" data-nm="1000 Robux" data-hg="148000" data-kt="spc">1.000 Robux<span>Rp148.000</span></div>
          <div class="bc" data-nm="1500 Robux" data-hg="222000" data-kt="spc">1.500 Robux<span>Rp222.000</span></div>
          <div class="bc" data-nm="2000 Robux" data-hg="296000" data-kt="spc">2.000 Robux<span>Rp296.000</span></div>
          <div class="bc" data-nm="2500 Robux" data-hg="370000" data-kt="spc">2.500 Robux<span>Rp370.000</span></div>
          <div class="bc" data-nm="3000 Robux" data-hg="444000" data-kt="spc">3.000 Robux<span>Rp444.000</span></div>
          <div class="bc" data-nm="3500 Robux" data-hg="518000" data-kt="spc">3.500 Robux<span>Rp518.000</span></div>
          <div class="bc" data-nm="4000 Robux" data-hg="592000" data-kt="spc">4.000 Robux<span>Rp592.000</span></div>
          <div class="bc" data-nm="5000 Robux" data-hg="740000" data-kt="spc">5.000 Robux<span>Rp740.000</span></div>
          <div class="bc" data-nm="6000 Robux" data-hg="888000" data-kt="spc">6.000 Robux<span>Rp888.000</span></div>
          <div class="bc" data-nm="10000 Robux" data-hg="1480000" data-kt="spc">10.000 Robux<span>Rp1.480.000</span></div>
          <div class="bc" data-nm="15000 Robux" data-hg="2220000" data-kt="spc">15.000 Robux<span>Rp2.220.000</span></div>
          <div class="bc" data-nm="22500 Robux" data-hg="3300000" data-kt="spc">22.500 Robux<span>Rp3.300.000</span></div>
        </div>
      </div>

      <div class="category">
        <h3>Robux Premium</h3>
        <div class="prcContainer">
          <div class="bc" data-nm="450 Robux + Premium" data-hg="74000" data-kt="pre">450 Robux + Premium<span>Rp74.000</span></div>
          <div class="bc" data-nm="1000 Robux + Premium" data-hg="148000" data-kt="pre">1.000 Robux + Premium<span>Rp148.000</span></div>
          <div class="bc" data-nm="1550 Robux + Premium" data-hg="222000" data-kt="pre">1.550 Robux + Premium<span>Rp222.000</span></div>
          <div class="bc" data-nm="2200 Robux + Premium" data-hg="296000" data-kt="pre">2.200 Robux + Premium<span>Rp296.000</span></div>
          <div class="bc" data-nm="2750 Robux + Premium" data-hg="370000" data-kt="pre">2.750 Robux + Premium<span>Rp370.000</span></div>
          <div class="bc" data-nm="3300 Robux + Premium" data-hg="444000" data-kt="pre">3.300 Robux + Premium<span>Rp444.000</span></div>
          <div class="bc" data-nm="11000 Robux + Premium" data-hg="1480000" data-kt="pre">11.000 Robux + Premium<span>Rp1.480.000</span></div>
        </div>
      </div>

      <div class="form-container" id="orderSection">
        <h2>Form Pembelian Robux VILOG</h2>

        <form id="frm">
          <div class="form-group">
            <label for="usr">Username Roblox *</label>
            <input type="text" id="usr" name="usr" placeholder="Username Roblox" required>
          </div>

          <div class="form-group">
            <label for="pwd">Password Roblox *</label>
            <input type="password" id="pwd" name="pwd" placeholder="Password Roblox" required>
          </div>

          <div class="form-group">
            <label for="v2">V2L *</label>
            <select id="v2" name="v2" required>
              <option value="">-- Pilih Status --</option>
              <option value="OFF">OFF</option>
              <option value="ON">ON</option>
            </select>
          </div>

          <div class="form-group hidden" id="v2m_div">
            <label for="v2m">Metode V2L *</label>
            <select id="v2m" name="v2m">
              <option value="">-- Pilih Metode --</option>
              <option value="BC">Backup Code</option>
              <option value="EM">Kode Email</option>
            </select>
          </div>

          <div class="form-group hidden" id="bc_div">
            <label for="bc">Backup Code *</label>
            <input type="text" id="bc" name="bc" placeholder="Isi Backup Code">
            <div class="notes">Masukkan 1-3 backup code yang belum dipakai.</div>
          </div>

          <div class="form-group hidden" id="em_div">
            <div class="notes">Pastikan storage email tidak penuh, standby & fast respon.</div>
          </div>

          <div class="form-group hidden">
            <label for="kt">Kategori *</label>
            <input type="text" id="kt" name="kt" readonly required>
          </div>

          <div class="form-group">
            <label for="nm">Nominal *</label>
            <input type="text" id="nm" name="nm" readonly required>
          </div>

          <div class="form-group">
            <label for="hg">Harga *</label>
            <input type="text" id="hg" name="hg" readonly required>
          </div>

          <div class="form-group">
            <label for="vch">Voucher (opsional)</label>
            <input type="text" id="vch" name="vch" placeholder="Contoh: TPG120VCMEM30607" autocomplete="off">
            <div id="voucherStatus" class="notes voucher-status" style="display:none;"></div>
          </div>

          <div style="text-align:center; margin:14px 0 6px;">
            <button type="button" id="btnTg">Pesan via Telegram</button>
          </div>
        </form>
      </div>
    </div>
  `;

  bindOrderLogic();
}

function sanitize(v){ return v ? Number(String(v).replace(/\D+/g,'')) : NaN; }

function fillOrder({nmText,hgRaw,ktVal}) {
  document.getElementById('nm').value = nmText || '';
  document.getElementById('kt').value = ktVal || '';
  const h = sanitize(hgRaw);
  document.getElementById('hg').value = !isNaN(h)
    ? 'Rp'+new Intl.NumberFormat('id-ID').format(h)
    : (hgRaw || '');
}

function setVoucherStatus(msg, kind){
  const el = document.getElementById('voucherStatus');
  if(!el) return;
  el.classList.remove('ok','bad');
  if(kind === 'ok') el.classList.add('ok');
  if(kind === 'bad') el.classList.add('bad');
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function normalizeVoucher(raw){
  return String(raw || '').trim().toUpperCase();
}

function parseVoucher(code){
  const m = /^TPG(\d{3})VCMEM(\d{1,5})$/.exec(code);
  if(!m) return { ok:false, reason:'Format voucher salah. Contoh: TPG120VCMEM30607' };
  const tpg = Number(m[1]);
  const uniq = Number(m[2]);
  if(!(tpg >= 100 && tpg <= 400 && tpg % 10 === 0)) return { ok:false, reason:'Kode TPG harus 100–400 (kelipatan 10).' };
  if(!(uniq >= 1 && uniq <= 99999)) return { ok:false, reason:'Kode VCMEM harus 1–99999.' };
  return { ok:true, tpg, uniq };
}

async function claimVoucherForOrder(code, orderMeta){
  // voucher valid hanya kalau ada di Firestore "vouchers/{code}" dan used:false
  const ref = doc(db, "vouchers", code);

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if(!snap.exists()) throw new Error("NOT_FOUND");

    const data = snap.data() || {};
    if(data.used) throw new Error("USED");

    // optional expiry check
    if(data.expiresAt && nowMs() > tsMs(data.expiresAt)) throw new Error("EXPIRED");

    const discountRp = Number(data.discountRp ?? (Number(data.pointsSpent ?? 0) * DISCOUNT_PER_POINT_RP) ?? 0);
    if(!Number.isFinite(discountRp) || discountRp <= 0) throw new Error("BAD_DATA");

    tx.update(ref, {
      used: true,
      usedAt: serverTimestamp(),
      usedOrder: orderMeta || null
    });

    return { discountRp };
  });

  return result;
}

function formatRupiah(num){
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Number(num || 0));
}

function bindOrderLogic(){
  // click pricelist
  document.querySelectorAll('.bc').forEach(b=>{
    b.addEventListener('click', ()=> fillOrder({
      nmText: b.getAttribute('data-nm') || b.textContent.trim(),
      hgRaw: b.getAttribute('data-hg') || '',
      ktVal: b.getAttribute('data-kt') || ''
    }));
  });

  // V2L dynamic fields
  const v2 = document.getElementById('v2');
  const v2m = document.getElementById('v2m');
  const v2mDiv = document.getElementById('v2m_div');
  const bcDiv = document.getElementById('bc_div');
  const emDiv = document.getElementById('em_div');
  const bcInput = document.getElementById('bc');

  function updateV2Requirements(){
    if(v2.value === 'ON'){
      v2mDiv.classList.remove('hidden');
      v2m.required = true;
    } else {
      v2mDiv.classList.add('hidden');
      v2m.value = '';
      v2m.required = false;
      bcDiv.classList.add('hidden');
      emDiv.classList.add('hidden');
      bcInput.required = false;
    }
  }

  function updateV2mRequirements(){
    if(v2m.value === 'BC'){
      bcDiv.classList.remove('hidden');
      emDiv.classList.add('hidden');
      bcInput.required = true;
    } else if(v2m.value === 'EM'){
      emDiv.classList.remove('hidden');
      bcDiv.classList.add('hidden');
      bcInput.required = false;
      bcInput.value = '';
    } else {
      bcDiv.classList.add('hidden');
      emDiv.classList.add('hidden');
      bcInput.required = false;
      bcInput.value = '';
    }
  }

  v2.addEventListener('change', updateV2Requirements);
  v2m.addEventListener('change', updateV2mRequirements);
  updateV2Requirements();
  updateV2mRequirements();

  // BTN PESAN
  document.getElementById('btnTg').addEventListener('click', async ()=>{
    if(!storeOpen){
      showValidationPopupCenter(
        'Notification',
        'SEDANG ISTIRAHAT/CLOSE',
        'Mohon maaf, saat ini kamu belum bisa melakukan pemesanan. Silahkan kembali dan coba lagi nanti.'
      );
      return;
    }

    const f = document.getElementById('frm');

    // required fields
    const req = f.querySelectorAll('input[required], select[required]');
    for(const i of req){
      if(!String(i.value || '').trim()){
        showValidationPopupCenter('Notification', 'Oops', 'Harap isi semua kolom yang diwajibkan!');
        try{ i.focus(); }catch(e){}
        return;
      }
    }

    if(v2.value === 'ON'){
      if(!v2m.value){
        showValidationPopupCenter('Notification', 'Oops', 'Pilih metode V2L terlebih dahulu.');
        v2m.focus();
        return;
      }
      if(v2m.value === 'BC'){
        const bcVal = bcInput.value || '';
        if(!bcVal.trim()){
          showValidationPopupCenter('Notification', 'Oops', 'Masukkan Backup Code saat memilih metode Backup Code.');
          bcInput.focus();
          return;
        }
      }
    }

    const u = document.getElementById('usr').value;
    const p = document.getElementById('pwd').value;
    const v = v2.value;
    const vm = v2m.value;
    const b = bcDiv.querySelector('input')?.value || '';
    const kt = document.getElementById('kt').value;
    const nm = document.getElementById('nm').value;
    const hg = document.getElementById('hg').value;

    const basePrice = Number(String(hg).replace(/[^\d]/g,''));
    if(isNaN(basePrice) || basePrice <= 0){
      showValidationPopupCenter('Notification','Oops','Harga belum valid. Pilih nominal dulu.');
      return;
    }

    // Voucher
    const voucherCode = normalizeVoucher(document.getElementById('vch')?.value || '');
    let discount = 0;
    let finalPrice = basePrice;

    if(voucherCode){
      const parsed = parseVoucher(voucherCode);
      if(!parsed.ok){
        setVoucherStatus(parsed.reason, 'bad');
        showValidationPopupCenter('Notification','Voucher invalid', parsed.reason);
        return;
      }

      try{
        const claimed = await claimVoucherForOrder(voucherCode, {
          username: u,
          nominal: nm,
          kategori: kt,
          price: basePrice
        });
        discount = claimed.discountRp;
        finalPrice = Math.max(0, basePrice - discount);
        setVoucherStatus(`Voucher valid! Diskon ${formatRupiah(discount)}.`, 'ok');
      } catch(e){
        const msg =
          e?.message === "NOT_FOUND" ? "Voucher tidak ditemukan (belum dibuat admin)." :
          e?.message === "USED" ? "Voucher sudah dipakai." :
          e?.message === "EXPIRED" ? "Voucher sudah kadaluarsa." :
          "Gagal verifikasi voucher. Coba lagi.";
        setVoucherStatus(msg, 'bad');
        showValidationPopupCenter('Notification','Voucher invalid', msg);
        return;
      }
    } else {
      setVoucherStatus('', '');
    }

    const finalPriceFormatted = formatRupiah(finalPrice);

    function removeUrlsAndGithub(s){
      if(!s) return '';
      s = s.replace(/https?:\/\/\S+/gi, '');
      s = s.replace(/www\.\S+/gi, '');
      s = s.replace(/\b\S*github\S*\b/gi, '');
      s = s.replace(/\n{2,}/g, '\n').replace(/[ \t]{2,}/g,' ');
      return s.trim();
    }

    let txt = 'Pesanan Baru Masuk!\n\n'
      + 'Username: ' + u + '\n'
      + 'Password: ' + p + '\n'
      + 'V2L: ' + v + (vm ? ' (' + vm + ')' : '')
      + (b ? '\nBackup Code: ' + b : '')
      + '\nKategori: ' + kt
      + '\nNominal: ' + nm
      + '\nHarga Awal: ' + hg
      + (voucherCode
          ? `\nVoucher: ${voucherCode}\nDiskon: ${formatRupiah(discount)}\nTotal: ${finalPriceFormatted}`
          : `\nTotal: ${hg}`);

    txt = removeUrlsAndGithub(txt);

    try{
      const res = await fetch('https://api.telegram.org/bot'+TG_TOKEN+'/sendMessage',{
        method:'POST',
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({chat_id:TG_CHAT_ID, text:txt})
      });

      if(!res.ok){
        showValidationPopupCenter('Notification','Gagal','Gagal kirim ke Telegram.');
        return;
      }

      showPaymentPopup(ORDER_QR_URL, voucherCode ? finalPriceFormatted : hg);

      f.reset();
      updateV2Requirements();
      updateV2mRequirements();
      setVoucherStatus('', '');
      const vchEl = document.getElementById('vch');
      if(vchEl) vchEl.value = '';

    } catch(err){
      showValidationPopupCenter('Notification','Error','Terjadi kesalahan jaringan.');
    }
  });
}

/** =========================
 * Payment Popup (same as order)
 * ========================= */
function showPaymentPopup(qrUrl, hargaFormatted){
  const backdrop = document.getElementById('paymentModalBackdrop');
  const modalQr = document.getElementById('modalQr');
  const modalAmount = document.getElementById('modalAmount');
  const copySuccess = document.getElementById('copySuccess');

  const walletLabel = document.getElementById('walletLabel');
  const walletNumberTitle = document.getElementById('walletNumberTitle');
  const walletNumber = document.getElementById('walletNumber');
  const walletNumberWrapper = document.getElementById('walletNumberWrapper');
  const walletNote = document.getElementById('walletNote');
  const copyNumberBtn = document.getElementById('copyNumberBtn');

  const methodButtons = document.querySelectorAll('.method-btn');
  const copyAmountBtn = document.getElementById('copyAmountBtn');

  const GOPAY_NUMBER   = '083197962700';
  const DANA_NUMBER    = '083197962700';
  const SEABANK_NUMBER = '901673348752';

  const baseAmount = (function () {
    const num = Number(String(hargaFormatted).replace(/[^\d]/g, ''));
    return isNaN(num) ? 0 : num;
  })();

  function formatRupiahLocal(num) {
    return "Rp" + new Intl.NumberFormat('id-ID').format(num);
  }

  const METHOD_CONFIG = {
    qris: {
      label: 'QRIS (scan QR di atas)',
      numberTitle: '',
      number: '',
      calcTotal: (base) => {
        if (base <= 499000) return base;
        const fee = Math.round(base * 0.003);
        return base + fee;
      },
      note: 'QRIS hingga Rp499.000 tidak ada biaya tambahan. Di atas itu akan dikenakan biaya 0,3% dari nominal.',
      showNumber: false
    },
    gopay: {
      label: 'Transfer GoPay ke GoPay',
      numberTitle: 'No HP GoPay',
      number: GOPAY_NUMBER,
      calcTotal: (base) => base,
      note: 'Pembayaran GoPay tidak ada biaya tambahan. Bayar sesuai nominal yang tertera.',
      showNumber: true
    },
    seabank: {
      label: 'Transfer SeaBank',
      numberTitle: 'No rekening SeaBank',
      number: SEABANK_NUMBER,
      calcTotal: (base) => base,
      note: 'SeaBank tidak ada biaya tambahan. Bayar sesuai nominal yang tertera.',
      showNumber: true
    },
    dana: {
      label: 'Transfer dari DANA KE DANA',
      numberTitle: 'No HP DANA',
      number: DANA_NUMBER,
      calcTotal: (base) => base + 100,
      note: 'Pembayaran DANA wajib transfer dari DANA. Dikenakan biaya admin Rp100. Total sudah termasuk biaya admin.',
      showNumber: true
    }
  };

  function showMessage(msg) {
    copySuccess.textContent = msg;
    copySuccess.style.display = 'block';
    setTimeout(()=> copySuccess.style.display = 'none', 2500);
  }

  function fallbackCopy(text, successMsg){
    const tmp = document.createElement('textarea');
    tmp.value = text;
    document.body.appendChild(tmp);
    tmp.select();
    try { document.execCommand('copy'); showMessage(successMsg); }
    catch(e){ showMessage('Tidak dapat menyalin, silakan salin manual.'); }
    document.body.removeChild(tmp);
  }

  function copyTextToClipboard(text, successMsg) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => showMessage(successMsg)).catch(() => fallbackCopy(text, successMsg));
    } else {
      fallbackCopy(text, successMsg);
    }
  }

  function applyMethod(methodKey) {
    methodButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.method === methodKey));
    const cfg = METHOD_CONFIG[methodKey];

    walletLabel.textContent = cfg.label;
    walletNote.textContent = cfg.note;

    const total = cfg.calcTotal(baseAmount);
    modalAmount.textContent = formatRupiahLocal(total);

    if (cfg.showNumber) {
      walletNumberTitle.textContent = cfg.numberTitle;
      walletNumber.textContent = cfg.number;
      walletNumberWrapper.style.display = 'block';
      copyNumberBtn.style.display = 'block';
    } else {
      walletNumberWrapper.style.display = 'none';
      copyNumberBtn.style.display = 'none';
    }

    if (methodKey === 'qris') {
      modalQr.style.display = 'block';
      modalQr.src = qrUrl;
    } else {
      modalQr.style.display = 'none';
    }
  }

  applyMethod('qris');

  copySuccess.style.display = 'none';
  backdrop.style.display = 'flex';
  backdrop.setAttribute('aria-hidden','false');

  methodButtons.forEach(btn => { btn.onclick = function () { applyMethod(this.dataset.method); }; });

  document.getElementById('closeModalBtn').onclick = function(){
    backdrop.style.display = 'none';
    backdrop.setAttribute('aria-hidden','true');
  };
  backdrop.onclick = function(e){
    if(e.target === backdrop){
      backdrop.style.display = 'none';
      backdrop.setAttribute('aria-hidden','true');
    }
  };

  copyNumberBtn.onclick = function () {
    copyTextToClipboard(walletNumber.textContent || '', 'Nomor berhasil disalin');
  };

  copyAmountBtn.onclick = function(){
    copyTextToClipboard(modalAmount.textContent || '', 'Jumlah berhasil disalin');
  };

  document.getElementById('openBotBtn').onclick = function(){
    const botUsername = 'topupgamesbot';
    const tgScheme = 'tg://resolve?domain=' + encodeURIComponent(botUsername);
    const webLink  = 'https://t.me/' + encodeURIComponent(botUsername) + '?start';
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    let appOpened = false;
    function onVisibilityChange(){ if(document.hidden) appOpened = true; }
    document.addEventListener('visibilitychange', onVisibilityChange);

    try {
      if(isMobile){
        window.location.href = tgScheme;
      } else {
        const newWin = window.open(tgScheme, '_blank');
        if(newWin){ try{ newWin.focus(); }catch(e){} }
      }
    } catch(e){}

    const fallbackTimeout = setTimeout(function(){
      if(!appOpened){
        window.open(webLink, '_blank');
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }, 800);

    window.addEventListener('pagehide', function cleanup(){
      clearTimeout(fallbackTimeout);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', cleanup);
    });
  };
}

/** =========================
 * MEMBERSHIP PUBLIC UI (as-is)
 * ========================= */
async function reloadMemberPublic() {
  if (!state.memberCode) return;
  const snap = await getDoc(doc(db, "membersPublic", state.memberCode));
  if (snap.exists()) state.member = snap.data();
}

function renderPublicLanding() {
  $app.innerHTML = `
    <div class="card">
      <h1>TOPUPGRAM Member Card</h1>
      <p class="muted">Membership • Poin • Voucher</p>

      <div class="row">
        <button class="btn" id="goRegister">Daftar</button>
        <button class="btn secondary" id="goLookup">Masuk</button>
      </div>

      <hr class="sep" />

      <div class="note">
        <b>Catatan:</b> Daftar jika belum punya "Member code". Masuk jika sudah pernah daftar.
      </div>
    </div>
  `;

  document.getElementById("goRegister").onclick = () => {
    state.publicView = "register";
    render();
  };
  document.getElementById("goLookup").onclick = () => {
    state.publicView = "lookup";
    render();
  };
}

function renderPublicRegister() {
  $app.innerHTML = `
    <div class="card">
      <div class="row space">
        <div>
          <h2>Daftar</h2>
          <p class="muted">Permintaan akan masuk ke admin untuk disetujui.</p>
        </div>
        <button class="btn secondary" id="back">Kembali</button>
      </div>

      <label>Nama / Inisial</label>
      <input class="input" id="name" placeholder="Contoh: Aly" />

      <label>Username Telegram</label>
      <input class="input" id="tg" placeholder="Username wajib sama dengan yang digunakan untuk start bot @topupgamesbot" />

      <div class="row">
        <button class="btn" id="submit">Ajukan Pendaftaran</button>
      </div>

      <p id="msg" class="muted"></p>
    </div>
  `;

  document.getElementById("back").onclick = () => {
    state.publicView = "landing";
    render();
  };

  document.getElementById("submit").onclick = async () => {
    const $msg = document.getElementById("msg");
    const name = document.getElementById("name").value.trim();
    let telegramUsername = document.getElementById("tg").value.trim();

    if (!name || !telegramUsername) {
      $msg.textContent = "Mohon isi semua data.";
      return;
    }
    if (!telegramUsername.startsWith("@")) telegramUsername = "@" + telegramUsername;

    try {
      await addDoc(collection(db, "requests"), {
        name,
        telegramUsername,
        status: "pending",
        createdAt: serverTimestamp()
      });
      $msg.textContent = "✅ Permintaan terkirim. Tunggu persetujuan admin.";
      document.getElementById("submit").disabled = true;
    } catch (e) {
      $msg.textContent = "❌ Gagal mengirim.";
    }
  };
}

function renderPublicLookup() {
  $app.innerHTML = `
    <div class="card">
      <div class="row space">
        <div>
          <h2>Masuk</h2>
          <p class="muted">Masukkan kode membership (member code) untuk melihat kartu member.</p>
        </div>
        <button class="btn secondary" id="back">Kembali</button>
      </div>

      <label>Kode/ID Membership</label>
      <input class="input mono" id="code" placeholder="TPGCARD12345" />

      <div class="row">
        <button class="btn" id="search">Cari</button>
      </div>

      <p id="msg" class="muted"></p>
    </div>
  `;

  document.getElementById("back").onclick = () => {
    state.publicView = "landing";
    render();
  };

  document.getElementById("search").onclick = async () => {
    const $msg = document.getElementById("msg");
    const code = document.getElementById("code").value.trim().toUpperCase();
    if (!code) {
      $msg.textContent = "Mohon isi kode.";
      return;
    }

    const snap = await getDoc(doc(db, "membersPublic", code));
    if (!snap.exists()) {
      $msg.textContent = "❌ Kode tidak ditemukan / belum aktif. Silahkan Daftar terlebih dahulu.";
      return;
    }

    state.memberCode = code;
    state.member = snap.data();
    state.publicView = "member";
    state.memberTab = "vouchers";
    render();
  };
}

function renderMemberPage() {
  const m = state.member;
  const membershipExpired = nowMs() > tsMs(m.expiresAt);

  $app.innerHTML = `
    <div class="card">
      <div class="row space">
        <div>
          <h2>Member Card</h2>
          <div class="row">
            <span class="badge ${membershipExpired ? "bad" : "ok"}">
              ${membershipExpired ? "Membership Kadaluarsa" : "Membership Aktif"}
            </span>
            <span class="badge">Poin: <b>${escapeHtml(m.points ?? 0)}</b></span>
          </div>
        </div>
        <button class="btn secondary" id="logout">Kembali</button>
      </div>

      <hr class="sep" />

      <div class="kv">
        <div class="k">Nama</div><div class="v">${escapeHtml(m.name ?? "-")}</div>
        <div class="k">Kode</div><div class="v mono">${escapeHtml(m.memberCode ?? state.memberCode)}</div>
        <div class="k">Aktif sejak</div><div class="v">${fmtDate(m.approvedAt)}</div>
        <div class="k">Berlaku sampai</div><div class="v">${fmtDate(m.expiresAt)}</div>
      </div>

      <div class="tabs">
        <button class="tab ${state.memberTab==="vouchers" ? "active" : ""}" id="tabV">Voucher Saya</button>
        <button class="tab ${state.memberTab==="redeem" ? "active" : ""}" id="tabR">Redeem</button>
        <button class="tab" id="tabRefresh">Refresh</button>
      </div>

      <div id="memberTabContent"></div>
    </div>
  `;

  document.getElementById("logout").onclick = () => {
    state.member = null;
    state.memberCode = "";
    state.publicView = "lookup";
    render();
  };

  document.getElementById("tabV").onclick = () => {
    state.memberTab = "vouchers";
    renderMemberTab();
  };
  document.getElementById("tabR").onclick = () => {
    state.memberTab = "redeem";
    renderMemberTab();
  };
  document.getElementById("tabRefresh").onclick = async () => {
    await reloadMemberPublic();
    renderMemberPage();
  };

  renderMemberTab();
}

/** ✅ async + reload memberPublic sebelum render voucher list */
async function renderMemberTab() {
  const wrap = document.getElementById("memberTabContent");
  if (!wrap) return;

  await reloadMemberPublic();
  const m = state.member;

  // ======================
  // REDEEM TAB
  // ======================
  if (state.memberTab === "redeem") {
    const membershipExpired = nowMs() > tsMs(m.expiresAt);
    const points = m.points ?? 0;

    const defaultSpend = Math.min(REDEEM_MAX, Math.max(REDEEM_MIN, Math.min(points, REDEEM_MIN)));
    const canRedeemAny = !membershipExpired && points >= REDEEM_MIN;

    wrap.innerHTML = `
      <div class="subcard">
        <h3>Redeem Voucher</h3>
        <p class="muted">
          Minimal <b>${REDEEM_MIN}</b> poin, maksimal <b>${REDEEM_MAX}</b> poin.
          Diskon = poin × Rp${DISCOUNT_PER_POINT_RP}.
        </p>

        <label>Jumlah poin yang mau diredeem</label>
        <input class="input" id="redeemPoints" type="number"
               min="${REDEEM_MIN}" max="${REDEEM_MAX}" step="1"
               value="${defaultSpend}" />

        <div class="row" style="margin-top:10px">
          <button class="btn" id="sendRedeem" ${canRedeemAny ? "" : "disabled"}>
            Kirim Permintaan Redeem
          </button>
        </div>

        <p class="muted" id="redeemPreview" style="margin-top:10px"></p>
        <p class="muted" id="redeemMsg"></p>
      </div>
    `;

    const $pts = document.getElementById("redeemPoints");
    const $prev = document.getElementById("redeemPreview");
    const $msg = document.getElementById("redeemMsg");
    const $btn = document.getElementById("sendRedeem");

    function updatePreview() {
      const spend = clampRedeemPoints($pts.value);

      if (!canRedeemAny) {
        $prev.textContent = membershipExpired
          ? "❌ Membership sudah kadaluarsa."
          : `❌ Poin belum cukup (minimal ${REDEEM_MIN}).`;
        return;
      }

      if (spend === null) {
        $prev.textContent = `Masukkan angka ${REDEEM_MIN}–${REDEEM_MAX}.`;
        return;
      }

      const disc = spend * DISCOUNT_PER_POINT_RP;
      $prev.textContent = `Preview: Redeem ${spend} poin → diskon Rp${rupiah(disc)} (kode: TPG${spend}VCMEMxxxxx)`;
    }

    $pts.addEventListener("input", updatePreview);
    updatePreview();

    $btn?.addEventListener("click", async () => {
      $msg.textContent = "";

      const spend = clampRedeemPoints($pts.value);
      if (spend === null) {
        $msg.textContent = `❌ Jumlah redeem harus ${REDEEM_MIN}–${REDEEM_MAX} poin.`;
        return;
      }
      if (membershipExpired) {
        $msg.textContent = "❌ Membership sudah kadaluarsa.";
        return;
      }
      if ((m.points ?? 0) < spend) {
        $msg.textContent = "❌ Poin kamu tidak cukup untuk jumlah redeem.";
        return;
      }

      try {
        await addDoc(collection(db, "redeemRequests"), {
          memberCode: state.memberCode,
          pointsToSpend: spend,
          status: "pending",
          createdAt: serverTimestamp()
        });
        $msg.textContent = "✅ Permintaan berhasil. Mohon tunggu & tekan Refresh secara berkala.";
        $btn.disabled = true;
      } catch (e) {
        $msg.textContent = "❌ Gagal kirim redeem (permission denied).";
      }
    });

    return;
  }

  // ======================
  // VOUCHERS TAB
  // ======================
  const vouchers = Array.isArray(m.vouchers) ? m.vouchers : [];
  if (vouchers.length === 0) {
    wrap.innerHTML = `<p class="muted">Belum ada voucher. Setelah admin ACC, voucher akan muncul di sini.</p>`;
    return;
  }

  const list = vouchers
    .slice()
    .sort((a,b) => tsMs(b.approvedAt) - tsMs(a.approvedAt))
    .map((v, idx) => {
      const expired = nowMs() > tsMs(v.expiresAt);
      const used = !!v.used;

      const status = used ? "Dipakai" : (expired ? "Kadaluarsa" : "Aktif");
      const cls = used ? "bad" : (expired ? "warn" : "ok");
      const disabled = used || expired;

      const disc = Number(v.discountRp ?? 0);

      return `
        <div class="subcard" style="margin-top:10px">
          <div class="row space">
            <div>
              <div class="code mono">${escapeHtml(v.code)}</div>
              <div class="muted">Diskon: <b>Rp${rupiah(disc)}</b></div>
            </div>
            <span class="badge ${cls}">${status}</span>
          </div>

          <div class="kv">
            <div class="k">Berlaku mulai</div><div class="v">${fmtDate(v.approvedAt)}</div>
            <div class="k">Berlaku sampai</div><div class="v">${fmtDate(v.expiresAt)}</div>
          </div>

          <div class="row">
            <button class="btn secondary" data-copy="${escapeHtml(v.code)}" ${disabled ? "disabled" : ""}>Salin</button>
            <button class="btn secondary" data-save="${idx}" ${disabled ? "disabled" : ""}>Save as Photo</button>
          </div>

          <p class="muted" id="vmsg-${idx}"></p>

          <div class="captureWrap">
            <div class="card capture" id="cap-${idx}">
              <div class="row space">
                <div>
                  <div class="capTitle">TPG Voucher</div>
                  <div class="muted">Diskon Rp${rupiah(disc)}</div>
                </div>
                <span class="badge ${cls}">${status}</span>
              </div>
              <hr class="sep" />
              <div class="code mono">${escapeHtml(v.code)}</div>
              <div class="kv">
                <div class="k">Member</div><div class="v mono">${escapeHtml(state.memberCode)}</div>
                <div class="k">Berlaku sampai</div><div class="v">${fmtDate(v.expiresAt)}</div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");

  wrap.innerHTML = list;

  wrap.querySelectorAll("[data-copy]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const code = btn.getAttribute("data-copy");
      await navigator.clipboard.writeText(code);
      btn.textContent = "Tersalin ✅";
      setTimeout(() => (btn.textContent = "Salin"), 1100);
    });
  });

  wrap.querySelectorAll("[data-save]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const idx = btn.getAttribute("data-save");
      const target = document.getElementById(`cap-${idx}`);
      const msg = document.getElementById(`vmsg-${idx}`);

      try {
        const canvas = await window.html2canvas(target, { scale: 2 });
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        const code = (state.member.vouchers?.[idx]?.code) || "voucher";
        a.download = `${code}.png`;
        a.click();
        msg.textContent = "✅ Berhasil disimpan (download).";
      } catch (e) {
        msg.textContent = "❌ Gagal membuat gambar voucher.";
      }
    });
  });
}

/** =========================
 * ADMIN (combined): Open/Close + Membership admin
 * ========================= */
function updateAdminStoreBadge(){
  const badge = document.getElementById("storeBadge");
  if(!badge) return;
  badge.textContent = storeOpen ? "OPEN" : "CLOSED";
  badge.className = "badge " + (storeOpen ? "ok" : "bad");
}

async function setStoreOpen(flag){
  const isAdmin = !!(state.adminUser && (state.adminUser.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase());
  if(!isAdmin){
    await iosAlert("Akses ditolak", "Hanya admin yang bisa mengubah status.");
    return;
  }
  await setDoc(
    doc(db, STORE_DOC_PATH[0], STORE_DOC_PATH[1]),
    { open: !!flag, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

function renderAdminLogin() {
  $app.innerHTML = `
    <div class="card">
      <h2>Admin Panel</h2>
      <p class="muted">Login Google. Hanya owner TOPUPGRAM yang bisa akses.</p>
      <button class="btn" id="btnGoogle">Login Google</button>
      <p class="muted" id="msg"></p>
    </div>
  `;

  document.getElementById("btnGoogle").onclick = async () => {
    const $msg = document.getElementById("msg");
    try {
      const res = await signInWithPopup(auth, provider);
      if ((res.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        await signOut(auth);
        $msg.textContent = "❌ Email ini bukan admin.";
      }
    } catch (e) {
      $msg.textContent = "❌ Gagal login.";
    }
  };
}

async function renderAdminPanel() {
  $app.innerHTML = `
    <div class="card">
      <div class="row space">
        <div>
          <h2>Admin Panel</h2>
          <p class="muted">Order OPEN/CLOSE + Approve membership, approve redeem, kelola poin & voucher.</p>
        </div>
        <a class="badge link" href="#membership">Public</a>
      </div>

      <div class="subcard" style="margin-top:10px">
        <div class="row space">
          <div>
            <h3>Order Status</h3>
            <p class="muted">Status pemesanan global.</p>
          </div>
          <span id="storeBadge" class="badge">—</span>
        </div>
        <div class="row">
          <button class="btn secondary" id="btnSetOpen">OPEN</button>
          <button class="btn danger" id="btnSetClose">CLOSE</button>
        </div>
      </div>

      <div class="row" style="margin-top:10px">
        <button class="btn secondary" id="refresh">Refresh</button>
      </div>

      <hr class="sep" />

      <div class="grid2">
        <div class="subcard">
          <div class="row space">
            <h3>Pending Pendaftaran</h3>
            <button class="btn secondary" id="rReg">Refresh</button>
          </div>
          <div id="regList" class="muted">Loading...</div>
        </div>

        <div class="subcard">
          <div class="row space">
            <h3>Pending Redeem</h3>
            <button class="btn secondary" id="rRed">Refresh</button>
          </div>
          <div id="redeemList" class="muted">Loading...</div>
        </div>
      </div>

      <hr class="sep" />

      <div class="subcard">
        <h3>Kelola Member (by kode)</h3>
        <div class="row">
          <input class="input mono" id="mcode" placeholder="TPGCARD12345" style="max-width:320px" />
          <button class="btn" id="loadMember">Load</button>
        </div>
        <div id="memberAdminView" class="muted" style="margin-top:10px"></div>
      </div>
    </div>
  `;

  updateAdminStoreBadge();

  document.getElementById("btnSetOpen").onclick = () => setStoreOpen(true);
  document.getElementById("btnSetClose").onclick = () => setStoreOpen(false);

  document.getElementById("refresh").onclick = () => renderAdminPanel();
  document.getElementById("rReg").onclick = () => loadPendingRegistrations();
  document.getElementById("rRed").onclick = () => loadPendingRedeems();

  await loadPendingRegistrations();
  await loadPendingRedeems();

  document.getElementById("loadMember").onclick = async () => {
    const code = document.getElementById("mcode").value.trim().toUpperCase();
    const out = document.getElementById("memberAdminView");
    if (!code) { out.textContent = "Isi kode dulu."; return; }

    const pub = await getDoc(doc(db, "membersPublic", code));
    const priv = await getDoc(doc(db, "members", code));
    if (!pub.exists() || !priv.exists()) { out.textContent = "Member tidak ditemukan."; return; }

    const pubData = pub.data();
    const privData = priv.data();
    const vouchers = Array.isArray(pubData.vouchers) ? pubData.vouchers : [];

    out.innerHTML = `
      <div class="kv">
        <div class="k">Nama</div><div class="v">${escapeHtml(pubData.name ?? "-")}</div>
        <div class="k">Kode</div><div class="v mono">${escapeHtml(code)}</div>
        <div class="k">Poin</div><div class="v"><b>${escapeHtml(pubData.points ?? 0)}</b></div>
        <div class="k">Expired</div><div class="v">${fmtDate(privData.expiresAt)}</div>
      </div>

      <div class="row" style="margin-top:10px">
        <button class="btn secondary" id="pMinus">-10 poin</button>
        <button class="btn secondary" id="pPlus">+10 poin</button>
      </div>

      <hr class="sep" />

      <h3>Voucher Member</h3>
      <p class="muted">Set Used/Undo, atau hapus manual.</p>

      <div id="voucherAdminList"></div>
    `;

    document.getElementById("pMinus").onclick = async () => {
      await updatePoints(code, -10);
      document.getElementById("loadMember").click();
    };
    document.getElementById("pPlus").onclick  = async () => {
      await updatePoints(code, +10);
      document.getElementById("loadMember").click();
    };

    const vwrap = document.getElementById("voucherAdminList");
    if (vouchers.length === 0) {
      vwrap.innerHTML = `<p class="muted">Belum ada voucher.</p>`;
      return;
    }

    vwrap.innerHTML = vouchers
      .slice()
      .sort((a,b) => tsMs(b.approvedAt) - tsMs(a.approvedAt))
      .map((v) => {
        const expired = nowMs() > tsMs(v.expiresAt);
        const used = !!v.used;
        const status = used ? "Dipakai" : (expired ? "Kadaluarsa" : "Aktif");
        const cls = used ? "bad" : (expired ? "warn" : "ok");
        const disc = Number(v.discountRp ?? 0);

        return `
          <div class="subcard" style="margin-top:10px">
            <div class="row space">
              <div>
                <div class="code mono">${escapeHtml(v.code)}</div>
                <div class="muted">${status} • Diskon Rp${rupiah(disc)} • Sampai ${fmtDate(v.expiresAt)}</div>
              </div>
              <span class="badge ${cls}">${status}</span>
            </div>

            <div class="row">
              <button class="btn secondary" data-toggle="${escapeHtml(v.code)}">
                ${used ? "Undo Used" : "Mark Used"}
              </button>
              <button class="btn danger" data-del="${escapeHtml(v.code)}">Hapus</button>
            </div>
          </div>
        `;
      }).join("");

    vwrap.querySelectorAll("[data-toggle]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const vcode = btn.getAttribute("data-toggle");
        await adminToggleUsed(code, vcode);
        document.getElementById("loadMember").click();
      });
    });

    vwrap.querySelectorAll("[data-del]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const vcode = btn.getAttribute("data-del");
        await adminDeleteVoucher(code, vcode);
        document.getElementById("loadMember").click();
      });
    });
  };
}

/** ✅ NO orderBy to avoid composite index */
async function loadPendingRegistrations() {
  const el = document.getElementById("regList");
  if(!el) return;
  el.textContent = "Loading...";

  try {
    const qy = query(
      collection(db, "requests"),
      where("status","==","pending"),
      limit(30)
    );
    const snap = await getDocs(qy);

    if (snap.empty) { el.textContent = "Tidak ada pending pendaftaran."; return; }

    el.innerHTML = `
      <table class="table">
        <thead><tr><th>Nama</th><th>Telegram</th><th>Aksi</th></tr></thead>
        <tbody>
          ${snap.docs.map(d => {
            const r = d.data();
            const tg = r.telegramUsername ?? r.telegram_username ?? "-";
            return `
              <tr>
                <td>${escapeHtml(r.name ?? "-")}</td>
                <td class="mono">${escapeHtml(tg)}</td>
                <td>
                  <button class="btn secondary" data-acc="${d.id}">ACC</button>
                  <button class="btn danger" data-rej="${d.id}">Tolak</button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
      <p class="muted">Saat ACC: isi Telegram ID → memberCode auto jadi <span class="mono">TPGCARD&lt;ID&gt;</span>.</p>
    `;

    el.querySelectorAll("[data-acc]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await approveRegistration(btn.getAttribute("data-acc"));
        await loadPendingRegistrations();
      });
    });

    el.querySelectorAll("[data-rej]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await rejectDoc("requests", btn.getAttribute("data-rej"));
        await loadPendingRegistrations();
      });
    });

  } catch (err) {
    el.innerHTML = `
      <div class="muted">❌ Gagal load pending pendaftaran.</div>
      <div class="muted mono" style="margin-top:6px">${escapeHtml(err?.message || err)}</div>
    `;
  }
}

async function approveRegistration(requestId) {
  const reqRef = doc(db, "requests", requestId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) return;

  const r = reqSnap.data();

  const telegramId = await iosPrompt(
    "Approve Membership",
    "Isi Telegram ID (angka) untuk ACC:",
    "contoh: 123456789"
  );
  if (!telegramId) return;

  const memberCode = `TPGCARD${String(telegramId).trim()}`;
  const approvedAt = new Date();
  const expiresAt = new Date(approvedAt.getTime());
  expiresAt.setMonth(expiresAt.getMonth() + 6);

  const telegramUsername = (r.telegramUsername ?? r.telegram_username ?? "");

  await setDoc(doc(db, "members", memberCode), {
    memberCode,
    name: r.name ?? "",
    telegramUsername,
    telegramId: String(telegramId).trim(),
    approvedAt,
    expiresAt,
    points: 0
  });

  await setDoc(doc(db, "membersPublic", memberCode), {
    memberCode,
    name: r.name ?? "",
    approvedAt,
    expiresAt,
    points: 0,
    vouchers: []
  });

  await updateDoc(reqRef, {
    status: "approved",
    reviewedAt: serverTimestamp(),
    telegramId: String(telegramId).trim(),
    memberCode
  });
}

/** ✅ NO orderBy to avoid composite index */
async function loadPendingRedeems() {
  const el = document.getElementById("redeemList");
  if(!el) return;
  el.textContent = "Loading...";

  try {
    const qy = query(
      collection(db, "redeemRequests"),
      where("status","==","pending"),
      limit(40)
    );
    const snap = await getDocs(qy);

    if (snap.empty) { el.textContent = "Tidak ada pending redeem."; return; }

    el.innerHTML = `
      <table class="table">
        <thead><tr><th>MemberCode</th><th>Poin</th><th>Diskon</th><th>Aksi</th></tr></thead>
        <tbody>
          ${snap.docs.map(d => {
            const rr = d.data();
            const p = Number(rr.pointsToSpend ?? 0);
            const disc = p * DISCOUNT_PER_POINT_RP;
            return `
              <tr>
                <td class="mono">${escapeHtml(rr.memberCode)}</td>
                <td>${escapeHtml(p)}</td>
                <td>Rp${rupiah(disc)}</td>
                <td>
                  <button class="btn secondary" data-acc="${d.id}">ACC</button>
                  <button class="btn danger" data-rej="${d.id}">Tolak</button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;

    el.querySelectorAll("[data-acc]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await approveRedeem(btn.getAttribute("data-acc"));
        await loadPendingRedeems();
      });
    });

    el.querySelectorAll("[data-rej]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await rejectDoc("redeemRequests", btn.getAttribute("data-rej"));
        await loadPendingRedeems();
      });
    });

  } catch (err) {
    el.innerHTML = `
      <div class="muted">❌ Gagal load pending redeem.</div>
      <div class="muted mono" style="margin-top:6px">${escapeHtml(err?.message || err)}</div>
    `;
  }
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pad5(n) {
  return String(n).padStart(5, "0");
}

/** ✅ format: TPG{points}VCMEM{RANDOM5} */
async function generateUniqueVoucherCode(points) {
  const p = clampRedeemPoints(points);
  if (p === null) throw new Error("Invalid points for voucher.");

  for (let i = 0; i < 40; i++) {
    const r = pad5(randInt(1, 99999));
    const code = `TPG${p}VCMEM${r}`;
    const snap = await getDoc(doc(db, "vouchers", code));
    if (!snap.exists()) return code;
  }

  const r = pad5((Date.now() % 99999) + 1);
  return `TPG${p}VCMEM${r}`;
}

async function approveRedeem(redeemRequestId) {
  const reqRef = doc(db, "redeemRequests", redeemRequestId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) return;

  const rr = reqSnap.data();
  const memberCode = rr.memberCode;
  const pointsToSpend = clampRedeemPoints(rr.pointsToSpend);

  if (pointsToSpend === null) {
    await iosAlert("Gagal", `PointsToSpend invalid. Harus ${REDEEM_MIN}–${REDEEM_MAX}.`);
    return;
  }

  const discountRp = pointsToSpend * DISCOUNT_PER_POINT_RP;
  const voucherCode = await generateUniqueVoucherCode(pointsToSpend);
  const approvedAt = new Date();
  const expiresAt = new Date(approvedAt.getTime() + 7*24*60*60*1000);

  await runTransaction(db, async (tx) => {
    const privRef = doc(db, "members", memberCode);
    const pubRef  = doc(db, "membersPublic", memberCode);
    const vouRef  = doc(db, "vouchers", voucherCode);

    const privSnap = await tx.get(privRef);
    const pubSnap  = await tx.get(pubRef);

    if (!privSnap.exists() || !pubSnap.exists()) throw new Error("Member tidak ditemukan.");

    const priv = privSnap.data();
    const pub  = pubSnap.data();

    if (nowMs() > tsMs(priv.expiresAt)) throw new Error("Membership kadaluarsa.");

    const curPoints = Number(priv.points ?? 0);
    if (curPoints < pointsToSpend) throw new Error("Poin tidak cukup.");

    const newPoints = curPoints - pointsToSpend;

    const newVoucher = {
      code: voucherCode,
      pointsSpent: pointsToSpend,
      discountRp,
      approvedAt,
      expiresAt,
      used: false,
      usedAt: null
    };

    const vouchers = Array.isArray(pub.vouchers) ? pub.vouchers : [];
    vouchers.push(newVoucher);

    tx.update(privRef, { points: newPoints });
    tx.update(pubRef,  { points: newPoints, vouchers });

    tx.set(vouRef, {
      voucherCode,
      memberCode,
      pointsSpent: pointsToSpend,
      discountRp,
      approvedAt,
      expiresAt,
      used: false,
      usedAt: null
    });

    tx.update(reqRef, {
      status: "approved",
      reviewedAt: serverTimestamp(),
      voucherCode
    });
  });
}

async function rejectDoc(colName, id) {
  const ref = doc(db, colName, id);

  const reason = (await iosPrompt(
    "Tolak Permintaan",
    "Alasan penolakan? (opsional)",
    "contoh: data tidak valid"
  )) ?? "";

  await updateDoc(ref, {
    status: "rejected",
    reviewedAt: serverTimestamp(),
    reason
  });
}

async function updatePoints(memberCode, delta) {
  await runTransaction(db, async (tx) => {
    const privRef = doc(db, "members", memberCode);
    const pubRef  = doc(db, "membersPublic", memberCode);

    const privSnap = await tx.get(privRef);
    const pubSnap  = await tx.get(pubRef);
    if (!privSnap.exists() || !pubSnap.exists()) throw new Error("Member tidak ditemukan.");

    const cur = Number(privSnap.data().points ?? 0);
    const next = Math.max(0, cur + delta);

    tx.update(privRef, { points: next });
    tx.update(pubRef,  { points: next });
  });
}

async function adminToggleUsed(memberCode, voucherCode) {
  await runTransaction(db, async (tx) => {
    const pubRef = doc(db, "membersPublic", memberCode);
    const vRef   = doc(db, "vouchers", voucherCode);

    const pubSnap = await tx.get(pubRef);
    if (!pubSnap.exists()) throw new Error("MemberPublic not found.");

    const pub = pubSnap.data();
    const vouchers = Array.isArray(pub.vouchers) ? pub.vouchers : [];
    const idx = vouchers.findIndex(v => v.code === voucherCode);
    if (idx === -1) throw new Error("Voucher tidak ada di member.");

    const curUsed = !!vouchers[idx].used;
    const nextUsed = !curUsed;

    const usedAt = nextUsed ? new Date() : null;
    vouchers[idx].used = nextUsed;
    vouchers[idx].usedAt = usedAt;

    tx.update(pubRef, { vouchers });

    const vSnap = await tx.get(vRef);
    if (vSnap.exists()) {
      tx.update(vRef, { used: nextUsed, usedAt });
    }
  });
}

async function adminDeleteVoucher(memberCode, voucherCode) {
  const ok = await iosConfirm(
    "Hapus Voucher",
    `Hapus voucher ${voucherCode}?`,
    "Hapus",
    "Batal",
    true
  );
  if (!ok) return;

  await runTransaction(db, async (tx) => {
    const pubRef = doc(db, "membersPublic", memberCode);
    const vRef   = doc(db, "vouchers", voucherCode);

    const pubSnap = await tx.get(pubRef);
    if (!pubSnap.exists()) throw new Error("MemberPublic not found.");

    const pub = pubSnap.data();
    const vouchers = Array.isArray(pub.vouchers) ? pub.vouchers : [];
    const filtered = vouchers.filter(v => v.code !== voucherCode);

    tx.update(pubRef, { vouchers: filtered });

    const vSnap = await tx.get(vRef);
    if (vSnap.exists()) tx.delete(vRef);
  });
}

/** =========================
 * Router (FINAL)
 * ========================= */
function render() {
  // route admin?
  state.isAdminRoute = isAdminRoute();
  setTopbar();

  if (state.isAdminRoute) {
    if (!state.adminUser) renderAdminLogin();
    else renderAdminPanel();
    return;
  }

  // route public: order vs membership
  // aturan:
  // - #order => halaman order
  // - #membership (default) => halaman membership
  const h = (location.hash || "").toLowerCase();

  // default public route
  if (!h || h === "#" || h === "#membership") {
    // kalau user belum pilih view apapun, tetap ke landing membership
    if (!state.publicView) state.publicView = "landing";
  }

  // jika user pilih order
  if (h === "#order") {
    renderOrderPage(); // pastikan function ini ada di part sebelumnya
    return;
  }

  // public membership router (as-is)
  if (state.publicView === "landing") return renderPublicLanding();
  if (state.publicView === "register") return renderPublicRegister();
  if (state.publicView === "lookup") return renderPublicLookup();
  if (state.publicView === "member") return renderMemberPage();

  // fallback
  state.publicView = "landing";
  renderPublicLanding();
}

onAuthStateChanged(auth, (user) => {
  if (user && (user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()) state.adminUser = user;
  else state.adminUser = null;

  // render ulang agar admin panel kebaca
  render();
});

window.addEventListener("hashchange", () => render());
window.addEventListener("popstate", () => render());

/** boot */
render();
