/* ===============================
   TPG Card Membership – FINAL (No Index Needed) + PIN Gate
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
  runTransaction
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

/** =========================
 * CONFIG
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

/** Redeem rules */
const REDEEM_MIN = 100;
const REDEEM_MAX = 400;
const DISCOUNT_PER_POINT_RP = 10; // 1 poin = Rp10 => 100 poin = Rp1000

/** PIN rules */
const PIN_MIN_LEN = 4;
const PIN_MAX_LEN = 8;

/** =========================
 * INIT
 * ========================= */
const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const auth = getAuth(fbApp);
const provider = new GoogleAuthProvider();

const $app = document.getElementById("app");
const $topbarRight = document.getElementById("topbarRight");

const state = {
  isAdminRoute: false,
  adminUser: null,

  // public
  publicView: "landing", // landing | register | lookup | member
  memberCode: "",
  member: null,
  memberTab: "vouchers", // vouchers | redeem

  // PIN gate
  memberUnlocked: false
};

/** =========================
 * Helpers
 * ========================= */
function isAdminRoute() {
  const h = (location.hash || "").toLowerCase();
  const q = new URLSearchParams(location.search);
  const path = (location.pathname || "").toLowerCase();
  return h.includes("admin") || q.has("admin") || path.endsWith("/admin");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function fmtDate(ts) {
  if (!ts) return "-";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("id-ID", { year:"numeric", month:"short", day:"2-digit" });
}

function nowMs(){ return Date.now(); }
function tsMs(ts){ return ts?.toMillis ? ts.toMillis() : (ts ? new Date(ts).getTime() : 0); }

function rupiah(n){
  const v = Number(n ?? 0);
  return v.toLocaleString("id-ID");
}

function badge(status) {
  return `<span class="badge">${escapeHtml(status)}</span>`;
}

function setTopbar() {
  if (!state.isAdminRoute) {
    $topbarRight.innerHTML = `<a class="badge link" href="#admin">Admin</a>`;
    return;
  }

  if (!state.adminUser) {
    $topbarRight.innerHTML = `<span class="badge">Admin mode</span>`;
    return;
  }

  $topbarRight.innerHTML = `
    <span class="badge ok">Admin: ${escapeHtml(state.adminUser.email)}</span>
    <button class="btn secondary" id="btnLogout">Logout</button>
  `;
  document.getElementById("btnLogout")?.addEventListener("click", () => signOut(auth));
}

/** ✅ reload memberPublic supaya status voucher update (used/delete) kebaca di member UI */
async function reloadMemberPublic() {
  if (!state.memberCode) return;
  const snap = await getDoc(doc(db, "membersPublic", state.memberCode));
  if (snap.exists()) state.member = snap.data();
}

/** ===== iOS-like Modal (Alert / Confirm / Prompt) ===== */
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

function clampRedeemPoints(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < REDEEM_MIN || i > REDEEM_MAX) return null;
  return i;
}

/** =========================
 * PIN Gate Helpers
 * ========================= */
function sessionKey(memberCode){ return `tpg:unlocked:${String(memberCode||"").toUpperCase()}`; }

function clampPin(pinRaw) {
  const pin = String(pinRaw ?? "").trim();
  if (!pin) return null;
  if (pin.length < PIN_MIN_LEN || pin.length > PIN_MAX_LEN) return null;
  // boleh angka saja (kamu bisa longgarkan kalau mau)
  if (!/^\d+$/.test(pin)) return null;
  return pin;
}

async function sha256Hex(str) {
  const enc = new TextEncoder().encode(String(str ?? ""));
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,"0")).join("");
}

async function ensureMemberUnlocked() {
  if (state.memberUnlocked) return true;

  // refresh memberPublic biar pinHash terbaru kebaca
  await reloadMemberPublic();
  const m = state.member || {};
  const pinHashPublic = m.pinHash || m.pin_hash || null;

  if (!pinHashPublic) {
    await iosAlert("Terkunci", "PIN belum diset untuk member ini. Hubungi admin.");
    return false;
  }

  const pinInput = await iosPrompt(
    "PIN Member",
    `Masukkan PIN (${PIN_MIN_LEN}-${PIN_MAX_LEN} digit) untuk membuka Voucher & Redeem:`,
    "contoh: 1234"
  );
  if (pinInput === null) return false;

  const pin = clampPin(pinInput);
  if (!pin) {
    await iosAlert("Gagal", `PIN harus ${PIN_MIN_LEN}-${PIN_MAX_LEN} digit angka.`);
    return false;
  }

  const hash = await sha256Hex(pin);
  if (hash !== pinHashPublic) {
    await iosAlert("Gagal", "PIN salah.");
    return false;
  }

  state.memberUnlocked = true;
  try { sessionStorage.setItem(sessionKey(state.memberCode), "1"); } catch {}
  return true;
}

function resetMemberUnlockState(clearSession=false) {
  state.memberUnlocked = false;
  if (clearSession) {
    try { sessionStorage.removeItem(sessionKey(state.memberCode)); } catch {}
  }
}

/** =========================
 * PUBLIC UI
 * ========================= */
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

  document.getElementById("goRegister").onclick = () => { state.publicView = "register"; render(); };
  document.getElementById("goLookup").onclick = () => { state.publicView = "lookup"; render(); };
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

  document.getElementById("back").onclick = () => { state.publicView = "landing"; render(); };
  document.getElementById("submit").onclick = async () => {
    const $msg = document.getElementById("msg");
    const name = document.getElementById("name").value.trim();
    let telegramUsername = document.getElementById("tg").value.trim();

    if (!name || !telegramUsername) { $msg.textContent = "Mohon isi semua data."; return; }
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

  document.getElementById("back").onclick = () => { state.publicView = "landing"; render(); };
  document.getElementById("search").onclick = async () => {
    const $msg = document.getElementById("msg");
    const code = document.getElementById("code").value.trim().toUpperCase();
    if (!code) { $msg.textContent = "Mohon isi kode."; return; }

    const snap = await getDoc(doc(db, "membersPublic", code));
    if (!snap.exists()) { $msg.textContent = "❌ Kode tidak ditemukan / belum aktif. Silahkan Daftar terlebih dahulu."; return; }

    state.memberCode = code;
    state.member = snap.data();
    state.publicView = "member";
    state.memberTab = "vouchers";

    // restore unlock state (per session)
    try { state.memberUnlocked = sessionStorage.getItem(sessionKey(code)) === "1"; } catch { state.memberUnlocked = false; }

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
            <span class="badge ${membershipExpired ? "bad" : "ok"}">${membershipExpired ? "Membership Kadaluarsa" : "Membership Aktif"}</span>
            <span class="badge">Poin: <b>${escapeHtml(m.points ?? 0)}</b></span>
            <span class="badge ${state.memberUnlocked ? "ok" : "warn"}">${state.memberUnlocked ? "Voucher Terbuka" : "Voucher Terkunci"}</span>
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
        <button class="tab ${state.memberTab==="vouchers"?"active":""}" id="tabV">Voucher Saya</button>
        <button class="tab ${state.memberTab==="redeem"?"active":""}" id="tabR">Redeem</button>
        <button class="tab" id="tabUnlock">${state.memberUnlocked ? "Kunci" : "Buka (PIN)"}</button>
        <button class="tab" id="tabRefresh">Refresh</button>
      </div>

      <div id="memberTabContent"></div>
    </div>
  `;

  document.getElementById("logout").onclick = () => {
    // reset + clear session unlock for privacy
    resetMemberUnlockState(true);
    state.member = null;
    state.memberCode = "";
    state.publicView = "lookup";
    render();
  };

  document.getElementById("tabV").onclick = async () => {
    const ok = await ensureMemberUnlocked();
    if (!ok) { state.memberTab = "vouchers"; renderMemberTab(); return; }
    state.memberTab="vouchers"; renderMemberTab();
  };
  document.getElementById("tabR").onclick = async () => {
    const ok = await ensureMemberUnlocked();
    if (!ok) { state.memberTab = "redeem"; renderMemberTab(); return; }
    state.memberTab="redeem"; renderMemberTab();
  };
  document.getElementById("tabUnlock").onclick = async () => {
    if (state.memberUnlocked) {
      resetMemberUnlockState(true);
      await iosAlert("Terkunci", "Voucher & Redeem dikunci lagi.");
      renderMemberPage();
      return;
    }
    const ok = await ensureMemberUnlocked();
    if (ok) renderMemberPage();
  };
  document.getElementById("tabRefresh").onclick = async () => { await reloadMemberPublic(); renderMemberPage(); };

  renderMemberTab();
}

/** ✅ async + reload memberPublic sebelum render voucher list */
async function renderMemberTab() {
  const wrap = document.getElementById("memberTabContent");
  if (!wrap) return;

  await reloadMemberPublic();
  const m = state.member;

  // PIN gate: voucher & redeem hanya kalau unlocked
  if (!state.memberUnlocked) {
    wrap.innerHTML = `
      <div class="subcard">
        <h3>🔒 Terkunci</h3>
        <p class="muted">Voucher & Redeem hanya bisa dibuka dengan PIN.</p>
        <div class="row">
          <button class="btn" id="btnEnterPin">Masukkan PIN</button>
        </div>
        <p class="muted" style="margin-top:10px">
          Kamu tetap bisa lihat info member (nama, poin, masa berlaku) tanpa PIN.
        </p>
      </div>
    `;
    document.getElementById("btnEnterPin")?.addEventListener("click", async () => {
      const ok = await ensureMemberUnlocked();
      if (ok) renderMemberPage();
    });
    return;
  }

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
        <input class="input" id="redeemPoints" type="number" min="${REDEEM_MIN}" max="${REDEEM_MAX}" step="1" value="${defaultSpend}" />

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
        $prev.textContent = membershipExpired ? "❌ Membership sudah kadaluarsa." : `❌ Poin belum cukup (minimal ${REDEEM_MIN}).`;
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

  // vouchers tab
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
            <button class="btn secondary" data-copy="${escapeHtml(v.code)}" ${disabled?"disabled":""}>Salin</button>
            <button class="btn secondary" data-save="${idx}" ${disabled?"disabled":""}>Save as Photo</button>
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
      setTimeout(() => btn.textContent = "Salin", 1100);
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
 * ADMIN UI
 * ========================= */
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
      <div class="row space">
        <div>
          <h2>Admin Panel</h2>
          <p class="muted">Approve pendaftaran, approve redeem, kelola poin & voucher.</p>
        </div>
        <a class="badge link" href="#">Public</a>
      </div>

      <div class="row">
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

    const hasPin = !!(privData.pinHash || pubData.pinHash);

    out.innerHTML = `
      <div class="kv">
        <div class="k">Nama</div><div class="v">${escapeHtml(pubData.name ?? "-")}</div>
        <div class="k">Kode</div><div class="v mono">${escapeHtml(code)}</div>
        <div class="k">Poin</div><div class="v"><b>${escapeHtml(pubData.points ?? 0)}</b></div>
        <div class="k">Expired</div><div class="v">${fmtDate(privData.expiresAt)}</div>
        <div class="k">PIN</div><div class="v">${hasPin ? `<span class="badge ok">SET</span>` : `<span class="badge warn">BELUM</span>`}</div>
      </div>

      <div class="row" style="margin-top:10px">
        <button class="btn secondary" id="pMinus">-10 poin</button>
        <button class="btn secondary" id="pPlus">+10 poin</button>
        <button class="btn" id="resetPin">Set/Reset PIN</button>
      </div>

      <hr class="sep" />

      <h3>Voucher Member</h3>
      <p class="muted">Set Used/Undo, atau hapus manual.</p>

      <div id="voucherAdminList"></div>
    `;

    document.getElementById("pMinus").onclick = async () => { await updatePoints(code, -10); document.getElementById("loadMember").click(); };
    document.getElementById("pPlus").onclick  = async () => { await updatePoints(code, +10); document.getElementById("loadMember").click(); };

    document.getElementById("resetPin").onclick = async () => {
      const pinInput = await iosPrompt(
        "Set/Reset PIN",
        `Masukkan PIN baru (${PIN_MIN_LEN}-${PIN_MAX_LEN} digit angka):`,
        "contoh: 1234"
      );
      if (pinInput === null) return;
      const pin = clampPin(pinInput);
      if (!pin) {
        await iosAlert("Gagal", `PIN harus ${PIN_MIN_LEN}-${PIN_MAX_LEN} digit angka.`);
        return;
      }
      const pinHash = await sha256Hex(pin);
      await updateDoc(doc(db, "members", code), { pinHash });
      await updateDoc(doc(db, "membersPublic", code), { pinHash, hasPin: true });
      await iosAlert("Berhasil", "PIN berhasil diset.");
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
              <button class="btn secondary" data-toggle="${escapeHtml(v.code)}">${used ? "Undo Used" : "Mark Used"}</button>
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

  // ✅ set PIN saat ACC
  const pinInput = await iosPrompt(
    "Set PIN Member",
    `Buat PIN (${PIN_MIN_LEN}-${PIN_MAX_LEN} digit angka). Nanti kamu kasih PIN ini ke member via chat pribadi.`,
    "contoh: 1234"
  );
  if (pinInput === null) return;
  const pin = clampPin(pinInput);
  if (!pin) {
    await iosAlert("Gagal", `PIN harus ${PIN_MIN_LEN}-${PIN_MAX_LEN} digit angka.`);
    return;
  }
  const pinHash = await sha256Hex(pin);

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
    points: 0,
    pinHash
  });

  await setDoc(doc(db, "membersPublic", memberCode), {
    memberCode,
    name: r.name ?? "",
    approvedAt,
    expiresAt,
    points: 0,
    vouchers: [],
    hasPin: true,
    // NOTE: pinHash disimpan di public untuk verifikasi PIN di UI public.
    // Kalau nanti mau lebih aman, pindahkan verifikasi ke Cloud Function.
    pinHash
  });

  await updateDoc(reqRef, {
    status: "approved",
    reviewedAt: serverTimestamp(),
    telegramId: String(telegramId).trim(),
    memberCode
  });

  await iosAlert("Berhasil", "Member di-ACC & PIN terset. Berikan PIN ke member via chat pribadi.");
}

/** ✅ NO orderBy to avoid composite index */
async function loadPendingRedeems() {
  const el = document.getElementById("redeemList");
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

  // fallback
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
 * Router
 * ========================= */
function render() {
  state.isAdminRoute = isAdminRoute();
  setTopbar();

  if (state.isAdminRoute) {
    if (!state.adminUser) renderAdminLogin();
    else renderAdminPanel();
    return;
  }

  if (state.publicView === "landing") return renderPublicLanding();
  if (state.publicView === "register") return renderPublicRegister();
  if (state.publicView === "lookup") return renderPublicLookup();
  if (state.publicView === "member") return renderMemberPage();
  renderPublicLanding();
}

onAuthStateChanged(auth, (user) => {
  if (user && user.email === ADMIN_EMAIL) state.adminUser = user;
  else state.adminUser = null;
  render();
});

window.addEventListener("hashchange", () => render());
window.addEventListener("popstate", () => render());

/** boot */
render();
