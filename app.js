import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, collection, serverTimestamp,
  query, where, orderBy, limit, getDocs, updateDoc, deleteDoc, runTransaction
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

/** =========================
 *  CONFIG (EDIT THIS)
 *  ========================= */
const firebaseConfig = {
  const firebaseConfig = {
  apiKey: "AIzaSyBPAPvzRAHLUVCVB1x7BbmgImB7IAQcrpY",
  authDomain: "loyaltymembertpg.firebaseapp.com",
  projectId: "loyaltymembertpg",
  storageBucket: "loyaltymembertpg.firebasestorage.app",
  messagingSenderId: "177443242278",
  appId: "1:177443242278:web:8aac0f53f1362abcf641e7",
  measurementId: "G-Y03QP3MP6H"
};

const ADMIN_EMAIL = "dinijanuari23@gmail.com";

/** =========================
 *  INIT
 *  ========================= */
const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase);
const auth = getAuth(appFirebase);
const provider = new GoogleAuthProvider();

const $app = document.getElementById("app");
const $topbarRight = document.getElementById("topbarRight");

const state = {
  isAdminRoute: false,
  adminUser: null,
  publicView: "landing", // landing | register | lookup | member
  member: null,          // membersPublic doc data
  memberCode: "",
  memberTab: "vouchers", // vouchers | redeem
};

function isAdminRoute() {
  const h = (location.hash || "").toLowerCase();
  const q = new URLSearchParams(location.search);
  const path = (location.pathname || "").toLowerCase();
  return h.includes("admin") || q.has("admin") || path.endsWith("/admin");
}

function fmtDate(ts) {
  if (!ts) return "-";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("id-ID", { year:"numeric", month:"short", day:"2-digit" });
}

function nowMs(){ return Date.now(); }
function tsMs(ts){ return ts?.toMillis ? ts.toMillis() : (ts ? new Date(ts).getTime() : 0); }

function setTopbar() {
  if (!state.isAdminRoute) {
    $topbarRight.innerHTML = `<a class="badge" href="#admin">Admin</a>`;
    return;
  }

  if (!state.adminUser) {
    $topbarRight.innerHTML = `<span class="badge warn">Admin mode</span>`;
  } else {
    $topbarRight.innerHTML = `
      <span class="badge ok">Admin: ${state.adminUser.email}</span>
      <button class="btn secondary" id="btnLogout">Logout</button>
    `;
    document.getElementById("btnLogout")?.addEventListener("click", async () => {
      await signOut(auth);
    });
  }
}

/** =========================
 *  PUBLIC UI
 *  ========================= */
function renderPublicLanding() {
  $app.innerHTML = `
    <div class="grid">
      <div class="card">
        <div class="h1">Membership baru, mulai di sini.</div>
        <p class="p">Daftar dulu kalau belum punya, atau cari data member menggunakan <b>kode membership</b>.</p>
        <div class="row">
          <button class="btn" id="goRegister">Daftar</button>
          <button class="btn secondary" id="goLookup">Login</button>
        </div>
        <div class="spacer"></div>
        <div class="badge">Tip: Login di sini adalah “cari kode membership”.</div>
      </div>

      <div class="card">
        <div class="h1">Aturan singkat</div>
        <div class="kv">
          <div class="k">Redeem</div><div class="v">Minimal 100 poin</div>
          <div class="k">Nilai</div><div class="v">100 poin = Rp1.000</div>
          <div class="k">Voucher</div><div class="v">TPGVOUCHMEMBER(1-99999)</div>
          <div class="k">Masa berlaku</div><div class="v">1 minggu setelah ACC admin</div>
        </div>
        <hr class="sep" />
        <div class="small">Mode admin hanya untuk akun Google admin.</div>
      </div>
    </div>
  `;

  document.getElementById("goRegister").onclick = () => { state.publicView = "register"; render(); };
  document.getElementById("goLookup").onclick = () => { state.publicView = "lookup"; render(); };
}

function renderPublicRegister() {
  $app.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <div>
          <div class="h1">Daftar membership</div>
          <p class="p">Masukkan nama/inisial dan username Telegram. Permintaan masuk ke admin untuk disetujui.</p>
        </div>
        <button class="btn secondary" id="back">Kembali</button>
      </div>

      <label>Nama / Inisial</label>
      <input class="input" id="name" placeholder="Contoh: Dini" />

      <label>Username Telegram</label>
      <input class="input" id="tg" placeholder="Contoh: @dinijanuari23" />

      <div class="spacer"></div>
      <button class="btn" id="submit">Kirim Permintaan</button>
      <div class="spacer"></div>
      <div id="msg" class="small"></div>
    </div>
  `;

  document.getElementById("back").onclick = () => { state.publicView = "landing"; render(); };
  document.getElementById("submit").onclick = async () => {
    const name = document.getElementById("name").value.trim();
    let telegramUsername = document.getElementById("tg").value.trim();
    const $msg = document.getElementById("msg");

    if (!name || !telegramUsername) {
      $msg.textContent = "Mohon isi semua data.";
      return;
    }
    if (!telegramUsername.startsWith("@")) telegramUsername = "@" + telegramUsername;

    await addDoc(collection(db, "requests"), {
      name,
      telegramUsername,
      status: "pending",
      createdAt: serverTimestamp(),
    });

    $msg.textContent = "✅ Permintaan terkirim. Tunggu persetujuan admin.";
    document.getElementById("submit").disabled = true;
  };
}

function renderPublicLookup() {
  $app.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <div>
          <div class="h1">Login</div>
          <p class="p">Masukkan <b>kode membership</b> (contoh: <span class="mono">TPGCARD12345</span>) untuk melihat kartu member.</p>
        </div>
        <button class="btn secondary" id="back">Kembali</button>
      </div>

      <label>Kode Membership</label>
      <input class="input mono" id="code" placeholder="TPGCARD...." />

      <div class="spacer"></div>
      <button class="btn" id="search">Cari</button>
      <div class="spacer"></div>
      <div id="msg" class="small"></div>
    </div>
  `;

  document.getElementById("back").onclick = () => { state.publicView = "landing"; render(); };
  document.getElementById("search").onclick = async () => {
    const code = document.getElementById("code").value.trim().toUpperCase();
    const $msg = document.getElementById("msg");

    if (!code) { $msg.textContent = "Mohon isi kode."; return; }

    const snap = await getDoc(doc(db, "membersPublic", code));
    if (!snap.exists()) {
      $msg.textContent = "❌ Kode tidak ditemukan / belum aktif.";
      return;
    }

    state.member = snap.data();
    state.memberCode = code;
    state.publicView = "member";
    state.memberTab = "vouchers";
    render();
  };
}

function renderMemberPage() {
  const m = state.member;
  const memberExpired = nowMs() > tsMs(m.expiresAt);
  const memberStatusBadge = memberExpired
    ? `<span class="badge danger">Membership Kadaluarsa</span>`
    : `<span class="badge ok">Membership Aktif</span>`;

  $app.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <div>
          <div class="h1">Member Card</div>
          <div class="row">
            ${memberStatusBadge}
            <span class="badge">Poin: <b>${m.points ?? 0}</b></span>
          </div>
        </div>
        <div class="row">
          <button class="btn secondary" id="logout">Ganti Kode</button>
        </div>
      </div>

      <hr class="sep" />

      <div class="kv">
        <div class="k">Nama</div><div class="v">${m.name ?? "-"}</div>
        <div class="k">Kode Member</div><div class="v mono">${m.memberCode ?? state.memberCode}</div>
        <div class="k">Aktif sejak</div><div class="v">${fmtDate(m.approvedAt)}</div>
        <div class="k">Berlaku sampai</div><div class="v">${fmtDate(m.expiresAt)}</div>
      </div>

      <div class="spacer"></div>

      <div class="tabs">
        <div class="tab ${state.memberTab === "vouchers" ? "active" : ""}" id="tabV">Voucher Saya</div>
        <div class="tab ${state.memberTab === "redeem" ? "active" : ""}" id="tabR">Redeem</div>
      </div>

      <div class="spacer"></div>
      <div id="memberTabContent"></div>
    </div>
  `;

  document.getElementById("logout").onclick = () => {
    state.member = null; state.memberCode = ""; state.publicView = "lookup";
    render();
  };

  document.getElementById("tabV").onclick = () => { state.memberTab = "vouchers"; renderMemberTab(); };
  document.getElementById("tabR").onclick = () => { state.memberTab = "redeem"; renderMemberTab(); };

  renderMemberTab();
}

function renderMemberTab() {
  const wrap = document.getElementById("memberTabContent");
  if (!wrap) return;

  if (state.memberTab === "redeem") {
    wrap.innerHTML = `
      <div class="voucher-card">
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-weight:900;font-size:16px">Redeem voucher</div>
            <div class="small">Minimal 100 poin untuk voucher diskon Rp1.000. Permintaan akan diproses admin.</div>
          </div>
          <span class="badge">100 poin → Rp1.000</span>
        </div>

        <div class="spacer"></div>
        <button class="btn" id="sendRedeem">Kirim Permintaan Redeem (100 poin)</button>
        <div class="spacer"></div>
        <div id="redeemMsg" class="small"></div>
      </div>
    `;

    document.getElementById("sendRedeem").onclick = async () => {
      const $msg = document.getElementById("redeemMsg");

      // Optional: block jika poin kurang dari 100 (client-side)
      if ((state.member.points ?? 0) < 100) {
        $msg.textContent = "❌ Poin kamu belum cukup (minimal 100).";
        return;
      }

      await addDoc(collection(db, "redeemRequests"), {
        memberCode: state.memberCode,
        pointsToSpend: 100,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      $msg.textContent = "✅ Permintaan redeem terkirim. Tunggu admin ACC.";
      document.getElementById("sendRedeem").disabled = true;
    };

    return;
  }

  // vouchers tab
  const vouchers = Array.isArray(state.member.vouchers) ? state.member.vouchers : [];
  if (vouchers.length === 0) {
    wrap.innerHTML = `<div class="small">Belum ada voucher. Kalau sudah ACC admin, voucher akan muncul di sini.</div>`;
    return;
  }

  const listHtml = vouchers
    .slice()
    .sort((a,b) => tsMs(b.approvedAt) - tsMs(a.approvedAt))
    .map((v, idx) => {
      const expired = nowMs() > tsMs(v.expiresAt);
      const used = !!v.used;
      const status = used ? "Dipakai" : (expired ? "Kadaluarsa" : "Aktif");
      const badgeClass = used ? "danger" : (expired ? "warn" : "ok");
      const disabled = used || expired;

      return `
        <div class="voucher-card" style="margin-top:10px">
          <div class="row" style="justify-content:space-between; align-items:flex-start">
            <div>
              <div class="voucher-code mono">${v.code}</div>
              <div class="small">Diskon: <b>Rp${(v.discountRp ?? 1000).toLocaleString("id-ID")}</b></div>
            </div>
            <span class="badge ${badgeClass}">${status}</span>
          </div>

          <div class="spacer"></div>
          <div class="kv">
            <div class="k">ACC admin</div><div class="v">${fmtDate(v.approvedAt)}</div>
            <div class="k">Berlaku sampai</div><div class="v">${fmtDate(v.expiresAt)}</div>
          </div>

          <div class="spacer"></div>
          <div class="row">
            <button class="btn secondary" data-copy="${v.code}" ${disabled ? "disabled" : ""}>Salin Kode</button>
            <button class="btn secondary" data-save="${idx}" ${disabled ? "disabled" : ""}>Save as Photo</button>
          </div>

          <div class="spacer"></div>
          <div class="small" id="vmsg-${idx}"></div>

          <!-- hidden render target for save-as-photo -->
          <div style="position:relative; left:-9999px; top:-9999px; height:0; overflow:hidden;">
            <div class="card" id="voucherCapture-${idx}" style="width:520px">
              <div class="row" style="justify-content:space-between">
                <div>
                  <div style="font-weight:950;font-size:20px">TPG Voucher</div>
                  <div class="small">Khusus member</div>
                </div>
                <span class="badge">${status}</span>
              </div>
              <hr class="sep" />
              <div class="voucher-code mono">${v.code}</div>
              <div class="spacer"></div>
              <div class="kv">
                <div class="k">Diskon</div><div class="v">Rp${(v.discountRp ?? 1000).toLocaleString("id-ID")}</div>
                <div class="k">Berlaku sampai</div><div class="v">${fmtDate(v.expiresAt)}</div>
                <div class="k">Member</div><div class="v mono">${state.memberCode}</div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");

  wrap.innerHTML = listHtml;

  // wire copy
  wrap.querySelectorAll("[data-copy]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const code = btn.getAttribute("data-copy");
      await navigator.clipboard.writeText(code);
      btn.textContent = "Tersalin ✅";
      setTimeout(()=> btn.textContent = "Salin Kode", 1200);
    });
  });

  // wire save photo
  wrap.querySelectorAll("[data-save]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const idx = btn.getAttribute("data-save");
      const target = document.getElementById(`voucherCapture-${idx}`);
      const msg = document.getElementById(`vmsg-${idx}`);
      try {
        const canvas = await window.html2canvas(target, { scale: 2 });
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        const code = (state.member.vouchers?.[idx]?.code) || "voucher";
        a.download = `${code}.png`;
        a.click();
        msg.textContent = "✅ Gambar voucher tersimpan (download).";
      } catch (e) {
        msg.textContent = "❌ Gagal membuat gambar voucher.";
      }
    });
  });
}

/** =========================
 *  ADMIN UI
 *  ========================= */
function renderAdminLogin() {
  $app.innerHTML = `
    <div class="card">
      <div class="h1">Admin Panel</div>
      <p class="p">Login Google untuk mengakses admin. Hanya <b>${ADMIN_EMAIL}</b> yang bisa masuk.</p>
      <button class="btn" id="btnGoogle">Login Google</button>
      <div class="spacer"></div>
      <div id="msg" class="small"></div>
    </div>
  `;

  document.getElementById("btnGoogle").onclick = async () => {
    const $msg = document.getElementById("msg");
    try {
      const res = await signInWithPopup(auth, provider);
      if (res.user.email !== ADMIN_EMAIL) {
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
      <div class="row" style="justify-content:space-between; align-items:flex-start">
        <div>
          <div class="h1">Admin Panel</div>
          <p class="p">Kelola pendaftaran, redeem, poin, dan voucher.</p>
        </div>
        <a class="badge" href="#">Public mode</a>
      </div>

      <hr class="sep" />

      <div class="row">
        <button class="btn secondary" id="refresh">Refresh</button>
      </div>

      <div class="spacer"></div>

      <div class="grid">
        <div class="card">
          <div style="font-weight:900;font-size:16px">Pending Pendaftaran</div>
          <div class="spacer"></div>
          <div id="regList" class="small">Loading...</div>
        </div>

        <div class="card">
          <div style="font-weight:900;font-size:16px">Pending Redeem</div>
          <div class="spacer"></div>
          <div id="redeemList" class="small">Loading...</div>
        </div>
      </div>

      <div class="spacer"></div>

      <div class="card">
        <div style="font-weight:900;font-size:16px">Cari Member (kode)</div>
        <div class="spacer"></div>
        <div class="row">
          <input class="input mono" id="mcode" placeholder="TPGCARD..." style="max-width:320px" />
          <button class="btn" id="loadMember">Load</button>
        </div>
        <div class="spacer"></div>
        <div id="memberAdminView" class="small"></div>
      </div>
    </div>
  `;

  document.getElementById("refresh").onclick = () => renderAdminPanel();
  await loadPendingRegistrations();
  await loadPendingRedeems();

  document.getElementById("loadMember").onclick = async () => {
    const code = document.getElementById("mcode").value.trim().toUpperCase();
    const out = document.getElementById("memberAdminView");
    if (!code) { out.textContent = "Isi kode dulu."; return; }

    const pub = await getDoc(doc(db, "membersPublic", code));
    if (!pub.exists()) { out.textContent = "MemberPublic tidak ditemukan."; return; }

    const data = pub.data();
    const vouchers = Array.isArray(data.vouchers) ? data.vouchers : [];

    out.innerHTML = `
      <div class="voucher-card">
        <div class="row" style="justify-content:space-between">
          <div>
            <div style="font-weight:950">Member: <span class="mono">${code}</span></div>
            <div class="small">${data.name ?? "-"}</div>
          </div>
          <span class="badge">Poin: <b>${data.points ?? 0}</b></span>
        </div>

        <hr class="sep" />
        <div class="row">
          <button class="btn secondary" id="pMinus">-10 poin</button>
          <button class="btn secondary
