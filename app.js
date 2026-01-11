import { db, auth, adminLogin, adminLogout } from "./firebase.js";
import {
  doc, getDoc, setDoc, updateDoc, collection, addDoc, getDocs, query, where, limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const view = document.getElementById("view");

/* ========= CONFIG ========= */
const ALLOWED_ADMIN_EMAIL = "dinijanuari23@gmail.com";
const MEMBER_CODE_PREFIX = "TPG0420"; // format: TPG0420{ID}

/* ========= UI helpers ========= */
function card(html, accent=false){
  view.innerHTML = `<section class="card ${accent ? "accent":""}">${html}</section>`;
}

function go(hash){
  location.hash = hash;
  setTimeout(render, 0);
}

function openModal(title, message, { okText="OK", cancelText=null, onOk=null, onCancel=null } = {}){
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `
    <div class="modal">
      <div class="m-body">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message).replace(/\n/g,"<br/>")}</p>
      </div>
      <div class="m-actions">
        ${cancelText ? `<button class="btn secondary" id="m_cancel">${escapeHtml(cancelText)}</button>` : ``}
        <button class="btn" id="m_ok">${escapeHtml(okText)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  const close = ()=> wrap.remove();

  wrap.addEventListener("click",(e)=>{ if(e.target === wrap) close(); });

  wrap.querySelector("#m_ok").onclick = async ()=>{
    try{ if(onOk) await onOk(); }
    finally{ close(); }
  };

  const cancelBtn = wrap.querySelector("#m_cancel");
  if(cancelBtn){
    cancelBtn.onclick = async ()=>{
      try{ if(onCancel) await onCancel(); }
      finally{ close(); }
    };
  }
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function fmtDate(d){
  try{
    return new Date(d).toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"});
  }catch{ return "-"; }
}

function addMonths(d,m){
  const x=new Date(d);
  const day=x.getDate();
  x.setMonth(x.getMonth()+m);
  if(x.getDate()<day) x.setDate(0);
  return x;
}

function isValidTelegramId(tid){
  return /^[0-9]{5,15}$/.test(String(tid||"").trim());
}

function last4(tid){
  const s = String(tid||"").trim();
  return s.slice(-4).padStart(4,"0");
}

function makeMemberCode(telegramId){
  return `${MEMBER_CODE_PREFIX}${String(telegramId).trim()}`;
}

function makeVoucher5(){
  let out = "";
  for(let i=0;i<5;i++) out += String(Math.floor(Math.random()*10));
  return out;
}

function memberStatus(m){
  const exp = m.expires_at?.toDate ? m.expires_at.toDate() : (m.expires_at ? new Date(m.expires_at) : null);
  if(!exp) return { label:"-", expired:false, exp:null };
  const expired = (new Date() > exp);
  return { label: expired ? "KEDALUWARSA" : "AKTIF", expired, exp };
}

/* =========================
   PUBLIC: SEARCH ONLY
========================= */

function pageHome(){
  card(`
    <h2 style="margin:0 0 6px;">Cari Membership</h2>
    <div class="small">Masukkan <b>Telegram ID</b> (angka) atau <b>Kode Member</b>.</div>

    <label>Kata Kunci</label>
    <input id="key" placeholder="contoh: 123456789 atau ${MEMBER_CODE_PREFIX}123456789" />

    <div id="msg"></div>
    <button class="btn" id="btn">Cari</button>

    <div id="result" style="margin-top:12px;"></div>

    <div class="small" style="margin-top:10px;">Admin panel: buka URL dengan <b>#/admin</b></div>
  `, true);

  // Enter = search
  key.addEventListener("keydown",(e)=>{
    if(e.key === "Enter") btn.click();
  });

  btn.onclick = async ()=>{
    msg.innerHTML = "";
    result.innerHTML = "";

    const q = String(key.value||"").trim();
    if(!q){
      openModal("Info","Masukkan Telegram ID atau Kode Member.",{okText:"OK"});
      return;
    }

    try{
      let m = null;

      // Auto detect: angka = telegram id, selain itu = member code
      if(isValidTelegramId(q)){
        m = await getMemberByTelegramId(q);
      }else{
        m = await getMemberByCode(q);
      }

      if(!m) throw new Error("Data member tidak ditemukan.");

      result.innerHTML = memberCardPublic(m);
      wirePublicRedeemButtons();

    }catch(e){
      openModal("Info", String(e?.message || e), { okText:"OK" });
    }
  };
}

async function getMemberByTelegramId(telegramId){
  const snap = await getDoc(doc(db,"members", String(telegramId).trim()));
  if(!snap.exists()) return null;
  return snap.data();
}

async function getMemberByCode(code){
  // single-field index (auto) => aman
  const qy = query(collection(db,"members"), where("member_code","==", code), limit(1));
  const snap = await getDocs(qy);
  if(snap.empty) return null;
  return snap.docs[0].data();
}

function memberCardPublic(m){
  const points = Number(m.points_balance||0);
  const pot = Math.floor(points/100)*1000;
  const st = memberStatus(m);

  return `
    <div class="card accent">
      <div><b>Nama:</b> ${escapeHtml(m.name || "-")}</div>
      <div><b>Telegram ID:</b> ${escapeHtml(m.telegram_id || "-")}</div>
      <div><b>Kode Member:</b> ${escapeHtml(m.member_code || "-")}</div>
      <div><b>Status:</b> <span class="badge">${st.label}</span></div>
      <div><b>Poin:</b> ${points}</div>
      <div class="mini">Redeem: 100 poin = Rp1000 • Potongan saat ini: Rp${pot.toLocaleString("id-ID")}</div>
      <div class="mini">Expire: ${st.exp ? fmtDate(st.exp) : "-"}</div>

      <hr/>

      <div class="small"><b>Redeem (butuh PIN)</b> • PIN = 4 digit terakhir Telegram ID</div>
      <div class="row">
        <button class="btn secondary" data-redeem="100" data-tid="${escapeHtml(m.telegram_id)}">Redeem 100</button>
        <button class="btn secondary" data-redeem="200" data-tid="${escapeHtml(m.telegram_id)}">Redeem 200</button>
      </div>
      <div class="row">
        <button class="btn secondary" data-redeem="300" data-tid="${escapeHtml(m.telegram_id)}">Redeem 300</button>
        <button class="btn secondary" id="recheck">Cari Lagi</button>
      </div>
    </div>
  `;
}

function wirePublicRedeemButtons(){
  document.getElementById("recheck").onclick = ()=>{ location.hash="#/"; render(); };

  document.querySelectorAll("button[data-redeem]").forEach(btn=>{
    btn.onclick = ()=> publicRedeem(btn.getAttribute("data-tid"), Number(btn.getAttribute("data-redeem")));
  });
}

async function publicRedeem(telegramId, pointsToUse){
  telegramId = String(telegramId||"").trim();
  if(!isValidTelegramId(telegramId)) return openModal("Error","Telegram ID tidak valid.",{okText:"OK"});

  const m = await getMemberByTelegramId(telegramId);
  if(!m) return openModal("Error","Data member tidak ditemukan.",{okText:"OK"});

  const expectedPin = last4(telegramId);
  const current = Number(m.points_balance||0);
  const discount = (pointsToUse/100)*1000;

  // Step 1: confirm redeem
  openModal(
    "Konfirmasi",
    `Redeem ${pointsToUse} poin untuk Rp${discount.toLocaleString("id-ID")}?\nPoin akan berkurang.`,
    {
      okText:"Lanjut",
      cancelText:"Batal",
      onOk: async ()=>{
        // Step 2: ask PIN
        const wrap = document.createElement("div");
        wrap.className = "modal-backdrop";
        wrap.innerHTML = `
          <div class="modal">
            <div class="m-body">
              <h3>Masukkan PIN</h3>
              <p>PIN = 4 digit terakhir Telegram ID</p>
              <label>PIN</label>
              <input id="pin_in" inputmode="numeric" placeholder="contoh: ${expectedPin}" />
              <div id="pin_err" class="error"></div>
            </div>
            <div class="m-actions">
              <button class="btn secondary" id="p_cancel">Batal</button>
              <button class="btn" id="p_ok">Redeem</button>
            </div>
          </div>
        `;
        document.body.appendChild(wrap);

        const close = ()=> wrap.remove();
        wrap.addEventListener("click",(e)=>{ if(e.target===wrap) close(); });

        wrap.querySelector("#p_cancel").onclick = close;

        wrap.querySelector("#p_ok").onclick = async ()=>{
          const pin = String(wrap.querySelector("#pin_in").value||"").trim();
          const err = wrap.querySelector("#pin_err");

          if(!/^[0-9]{4}$/.test(pin)){
            err.textContent = "PIN harus 4 digit.";
            return;
          }
          if(pin !== expectedPin){
            err.textContent = "PIN salah.";
            return;
          }
          if(current < pointsToUse){
            close();
            openModal("Poin tidak cukup", `Poin kamu ${current}. Tidak cukup untuk redeem ${pointsToUse}.`, { okText:"OK" });
            return;
          }

          close();

          // Deduct points (public allowed by rules)
          const next = Math.max(0, current - pointsToUse);
          await updateDoc(doc(db,"members", telegramId), {
            points_balance: next,
            last_redeemed_at: serverTimestamp()
          });

          // Create redeem log (public allowed by rules)
          const voucher = makeVoucher5();
          await addDoc(collection(db,"redeem_logs"), {
            telegram_id: telegramId,
            voucher_code: voucher,
            points_used: pointsToUse,
            discount: discount,
            created_at: serverTimestamp()
          });

          // Show voucher + copy
          openModal("Redeem Berhasil", `Kode Voucher: ${voucher}\n\nGunakan kode ini saat order.`, {
            okText:"Salin Kode",
            onOk: async ()=>{
              try{
                await navigator.clipboard.writeText(voucher);
                openModal("Berhasil", "Kode voucher sudah disalin.", { okText:"OK" });
              }catch{
                openModal("Info", `Gagal salin otomatis. Salin manual: ${voucher}`, { okText:"OK" });
              }
            }
          });

          // refresh card
          setTimeout(()=> render(), 300);
        };
      }
    }
  );
}

/* =========================
   ADMIN
========================= */

function pageAdmin(){
  card(`
    <h2 style="margin:0 0 6px;">Admin Panel</h2>
    <div class="small">Login hanya untuk <b>Owner Topupgram</b></div>
    <div id="adminBox"></div>
  `, true);

  const box = document.getElementById("adminBox");

  function loginView(){
    box.innerHTML = `
      <button class="btn" id="a_login">Login Admin (Google)</button>
      <div class="small" style="margin-top:10px;">Jika pop-up tidak muncul, buka via Chrome dan izinkan pop-up.</div>
      <button class="btn secondary" id="a_back">Kembali</button>
    `;
    a_back.onclick = ()=> go("#/");

    a_login.onclick = async ()=>{
      try{ await adminLogin(); }
      catch(e){
        openModal("Error", String(e?.message || e), { okText:"OK" });
      }
    };
  }

  function adminView(user){
    box.innerHTML = `
      <div class="card">
        <div><b>${escapeHtml(user.email || "-")}</b></div>
        <button class="btn secondary" id="a_logout">Logout</button>
      </div>

      <div class="tabs">
        <button class="tab active" id="t_add">Tambah Member</button>
        <button class="tab" id="t_points">Poin</button>
      </div>

      <div id="tab"></div>
    `;

    a_logout.onclick = adminLogout;

    t_add.onclick = ()=>{ setAdminTab("add"); adminTabs(); };
    t_points.onclick = ()=>{ setAdminTab("points"); adminTabs(); };

    adminTabs();
  }

  function setAdminTab(name){ localStorage.setItem("tpg_admin_tab", name); }
  function getAdminTab(){ return localStorage.getItem("tpg_admin_tab") || "add"; }

  function adminTabs(){
    const tab = getAdminTab();
    t_add.classList.toggle("active", tab==="add");
    t_points.classList.toggle("active", tab==="points");

    if(tab==="add") return adminTabAdd();
    return adminTabPoints();
  }

  function adminTabAdd(){
    document.getElementById("tab").innerHTML = `
      <h3 style="margin:12px 0 6px;">Tambah Member Manual</h3>

      <label>Telegram ID</label>
      <input id="m_tid" placeholder="contoh: 123456789" inputmode="numeric" />

      <label>Nama</label>
      <input id="m_name" placeholder="contoh: Dini" />

      <label>Username Telegram (opsional)</label>
      <input id="m_user" placeholder="contoh: topupgram" />

      <div class="small" style="margin-top:8px;">
        Member Code otomatis: <b>${MEMBER_CODE_PREFIX} + TelegramID</b><br/>
        PIN otomatis: <b>4 digit terakhir TelegramID</b><br/>
        Expire: <b>5 bulan</b> dari sekarang
      </div>

      <div id="m_msg"></div>
      <button class="btn" id="m_save">Buat Member</button>
    `;

    m_save.onclick = async ()=>{
      m_msg.innerHTML = "";
      const tid = String(m_tid.value||"").trim();
      const name = String(m_name.value||"").trim();
      const usern = String(m_user.value||"").trim().replace(/^@/,"").toLowerCase() || null;

      if(!isValidTelegramId(tid)){
        m_msg.innerHTML = `<div class="error">Telegram ID tidak valid.</div>`;
        return;
      }
      if(name.length < 2){
        m_msg.innerHTML = `<div class="error">Nama minimal 2 karakter.</div>`;
        return;
      }

      m_save.disabled = true;
      m_save.textContent = "Menyimpan...";

      try{
        const code = makeMemberCode(tid);
        const exp = addMonths(new Date(), 5);

        await setDoc(doc(db,"members", tid), {
          telegram_id: tid,
          name,
          telegram_username: usern,
          member_code: code,
          pin: last4(tid),
          points_balance: 0,
          created_at: serverTimestamp(),
          expires_at: exp,
          status: "ACTIVE"
        }, { merge: true });

        openModal("Berhasil", "Member berhasil dibuat.", { okText:"OK" });
        m_tid.value = "";
        m_name.value = "";
        m_user.value = "";
      }catch(e){
        m_msg.innerHTML = `<div class="error">${escapeHtml(e?.message || e)}</div>`;
      }finally{
        m_save.disabled = false;
        m_save.textContent = "Buat Member";
      }
    };
  }

  function adminTabPoints(){
    document.getElementById("tab").innerHTML = `
      <h3 style="margin:12px 0 6px;">Kelola Poin</h3>

      <label>Telegram ID</label>
      <input id="p_tid" placeholder="contoh: 123456789" inputmode="numeric" />

      <div class="row">
        <button class="btn secondary" id="p5">+5</button>
        <button class="btn secondary" id="p10">+10</button>
      </div>
      <div class="row">
        <button class="btn secondary" id="p25">+25</button>
        <button class="btn secondary" id="reset_pin">Reset PIN</button>
      </div>

      <button class="btn" id="p_check">Cek Member</button>

      <div id="p_out" style="margin-top:12px;"></div>
    `;

    p_check.onclick = async ()=> adminShowMember();
    p5.onclick = async ()=> adminAddPoints(5);
    p10.onclick = async ()=> adminAddPoints(10);
    p25.onclick = async ()=> adminAddPoints(25);

    reset_pin.onclick = async ()=>{
      const tid = String(p_tid.value||"").trim();
      if(!isValidTelegramId(tid)) return openModal("Error","Telegram ID tidak valid.",{okText:"OK"});
      await updateDoc(doc(db,"members", tid), { pin: last4(tid) });
      openModal("Berhasil", "PIN direset ke 4 digit terakhir Telegram ID.", { okText:"OK" });
      await adminShowMember();
    };

    async function adminAddPoints(delta){
      const tid = String(p_tid.value||"").trim();
      if(!isValidTelegramId(tid)) return openModal("Error","Telegram ID tidak valid.",{okText:"OK"});

      const ref = doc(db,"members", tid);
      const snap = await getDoc(ref);
      if(!snap.exists()) return openModal("Error","Member tidak ditemukan.",{okText:"OK"});

      const cur = Number(snap.data().points_balance||0);
      const next = Math.max(0, cur + delta);
      await updateDoc(ref, { points_balance: next });

      await adminShowMember();
    }

    async function adminShowMember(){
      const tid = String(p_tid.value||"").trim();
      if(!isValidTelegramId(tid)) return openModal("Error","Telegram ID tidak valid.",{okText:"OK"});
      p_out.innerHTML = `<div class="small">Memuat...</div>`;

      const snap = await getDoc(doc(db,"members", tid));
      if(!snap.exists()){
        p_out.innerHTML = `<div class="error">Member tidak ditemukan.</div>`;
        return;
      }
      const m = snap.data();
      const points = Number(m.points_balance||0);
      const pot = Math.floor(points/100)*1000;
      const st = memberStatus(m);
      const exp = st.exp ? fmtDate(st.exp) : "-";

      p_out.innerHTML = `
        <div class="card">
          <div><b>Nama:</b> ${escapeHtml(m.name || "-")}</div>
          <div><b>Telegram ID:</b> ${escapeHtml(m.telegram_id || "-")}</div>
          <div><b>Member Code:</b> ${escapeHtml(m.member_code || "-")}</div>
          <div><b>PIN:</b> ${escapeHtml(m.pin || last4(m.telegram_id))}</div>
          <div><b>Status:</b> <span class="badge">${st.label}</span></div>
          <div><b>Poin:</b> ${points}</div>
          <div class="mini">Potongan saat ini: Rp${pot.toLocaleString("id-ID")}</div>
          <div class="mini">Expire: ${exp}</div>
        </div>
      `;
    }
  }

  onAuthStateChanged(auth, async (user)=>{
    if(!user) return loginView();

    if(String(user.email||"").toLowerCase() !== ALLOWED_ADMIN_EMAIL.toLowerCase()){
      await adminLogout();
      return openModal("Akses Ditolak", "Akun ini tidak diizinkan.", { okText:"OK", onOk: loginView });
    }

    adminView(user);
  });
}

/* =========================
   ROUTER
========================= */

function route(){
  const h = (location.hash || "#/").replace("#","");
  if(h.startsWith("/admin")) return "admin";
  return "home";
}

function render(){
  const r = route();
  if(r==="admin") return pageAdmin();
  return pageHome();
}

window.addEventListener("hashchange", render);
window.addEventListener("load", render);
render();
