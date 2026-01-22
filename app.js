/* ===============================
   TPG Card Membership – FINAL
   Public: daftar, login (lookup member code), redeem request
   Admin (#admin): Google login (admin-only), approve member, approve redeem, manage points & vouchers
   =============================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
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
  member: null, // membersPublic doc data
  memberTab: "vouchers" // vouchers | redeem
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

/** =========================
 * PUBLIC UI
 * ========================= */
function renderPublicLanding() {
  $app.innerHTML = `
    <div class="card">
      <h1>TPG Card</h1>
      <p class="muted">Membership • Poin • Voucher</p>

      <div class="row">
        <button class="btn" id="goRegister">Daftar</button>
        <button class="btn secondary" id="goLookup">Login</button>
      </div>

      <hr class="sep" />

      <div class="note">
        <b>Catatan:</b> Login di sini adalah <i>mencari data membership</i> memakai kode member.
      </div>

      <div class="mini">
        <div>${badge("Redeem")}&nbsp; Minimal <b>100 poin</b></div>
        <div>${badge("Diskon")}&nbsp; 100 poin = <b>Rp1.000</b></div>
        <div>${badge("Voucher")}&nbsp; <span class="mono">TPGVOUCHMEMBER(1-99999)</span></div>
        <div>${badge("Masa berlaku")}&nbsp; 1 minggu setelah ACC admin</div>
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
      <input class="input" id="name" placeholder="Contoh: Dini" />

      <label>Username Telegram</label>
      <input class="input" id="tg" placeholder="Contoh: @dinijanuari23" />

      <div class="row">
        <button class="btn" id="submit">Kirim Permintaan</button>
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

    await addDoc(collection(db, "requests"), {
      name,
      telegramUsername,
      status: "pending",
      createdAt: serverTimestamp()
    });

    $msg.textContent = "✅ Permintaan terkirim. Tunggu persetujuan admin.";
    document.getElementById("submit").disabled = true;
  };
}

function renderPublicLookup() {
  $app.innerHTML = `
    <div class="card">
      <div class="row space">
        <div>
          <h2>Login</h2>
          <p class="muted">Masukkan kode membership untuk melihat kartu member.</p>
        </div>
        <button class="btn secondary" id="back">Kembali</button>
      </div>

      <label>Kode Membership</label>
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
    if (!snap.exists()) { $msg.textContent = "❌ Kode tidak ditemukan / belum aktif."; return; }

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
            <span class="badge ${membershipExpired ? "bad" : "ok"}">${membershipExpired ? "Membership Kadaluarsa" : "Membership Aktif"}</span>
            <span class="badge">Poin: <b>${escapeHtml(m.points ?? 0)}</b></span>
          </div>
        </div>
        <button class="btn secondary" id="logout">Ganti Kode</button>
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

  document.getElementById("tabV").onclick = () => { state.memberTab="vouchers"; renderMemberTab(); };
  document.getElementById("tabR").onclick = () => { state.memberTab="redeem"; renderMemberTab(); };

  renderMemberTab();
}

function renderMemberTab() {
  const wrap = document.getElementById("memberTabContent");
  const m = state.member;
  if (!wrap) return;

  if (state.memberTab === "redeem") {
    const membershipExpired = nowMs() > tsMs(m.expiresAt);
    const points = m.points ?? 0;
    const canRedeem = !membershipExpired && points >= 100;

    wrap.innerHTML = `
      <div class="subcard">
        <h3>Redeem Voucher</h3>
        <p class="muted">Minimal 100 poin → diskon Rp1.000. Permintaan akan diproses admin.</p>

        <div class="row">
          <button class="btn" id="sendRedeem" ${canRedeem ? "" : "disabled"}>
            Kirim Permintaan Redeem (100 poin)
          </button>
        </div>

        <p class="muted" id="redeemMsg">
          ${membershipExpired ? "❌ Membership sudah kadaluarsa." : (points < 100 ? "❌ Poin belum cukup (minimal 100)." : "")}
        </p>
      </div>
    `;

    document.getElementById("sendRedeem")?.addEventListener("click", async () => {
      const $msg = document.getElementById("redeemMsg");
      await addDoc(collection(db, "redeemRequests"), {
        memberCode: state.memberCode,
        pointsToSpend: 100,
        status: "pending",
        createdAt: serverTimestamp()
      });
      $msg.textContent = "✅ Permintaan redeem terkirim. Tunggu admin ACC.";
      document.getElementById("sendRedeem").disabled = true;
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

      return `
        <div class="subcard" style="margin-top:10px">
          <div class="row space">
            <div>
              <div class="code mono">${escapeHtml(v.code)}</div>
              <div class="muted">Diskon: <b>Rp${(v.discountRp ?? 1000).toLocaleString("id-ID")}</b></div>
            </div>
            <span class="badge ${cls}">${status}</span>
          </div>

          <div class="kv">
            <div class="k">ACC</div><div class="v">${fmtDate(v.approvedAt)}</div>
            <div class="k">Berlaku sampai</div><div class="v">${fmtDate(v.expiresAt)}</div>
          </div>

          <div class="row">
            <button class="btn secondary" data-copy="${escapeHtml(v.code)}" ${disabled?"disabled":""}>Salin</button>
            <button class="btn secondary" data-save="${idx}" ${disabled?"disabled":""}>Save as Photo</button>
          </div>

          <p class="muted" id="vmsg-${idx}"></p>

          <!-- capture target -->
          <div class="captureWrap">
            <div class="card capture" id="cap-${idx}">
              <div class="row space">
                <div>
                  <div class="capTitle">TPG Voucher</div>
                  <div class="muted">Diskon Rp${(v.discountRp ?? 1000).toLocaleString("id-ID")}</div>
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
      <p class="muted">Login Google. Hanya <b>${escapeHtml(ADMIN_EMAIL)}</b> yang bisa akses.</p>
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
    } catch {
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
      <p class="muted">Di sini kamu bisa set Used/Undo, atau hapus manual. Voucher kadaluarsa tetap tampil di user, tapi tombol copy/save user akan disable.</p>

      <div id="voucherAdminList"></div>
    `;

    document.getElementById("pMinus").onclick = async () => { await updatePoints(code, -10); document.getElementById("loadMember").click(); };
    document.getElementById("pPlus").onclick  = async () => { await updatePoints(code, +10); document.getElementById("loadMember").click(); };

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

        return `
          <div class="subcard" style="margin-top:10px">
            <div class="row space">
              <div>
                <div class="code mono">${escapeHtml(v.code)}</div>
                <div class="muted">${status} • Berlaku sampai ${fmtDate(v.expiresAt)}</div>
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

async function loadPendingRegistrations() {
  const el = document.getElementById("regList");
  const qy = query(
    collection(db, "requests"),
    where("status","==","pending"),
    orderBy("createdAt","desc"),
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
          return `
            <tr>
              <td>${escapeHtml(r.name ?? "-")}</td>
              <td class="mono">${escapeHtml(r.telegramUsername ?? "-")}</td>
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
}

async function approveRegistration(requestId) {
  const reqRef = doc(db, "requests", requestId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) return;

  const r = reqSnap.data();
  const telegramId = prompt("Isi Telegram ID (angka) untuk ACC:");
  if (!telegramId) return;

  const memberCode = `TPGCARD${String(telegramId).trim()}`;
  const approvedAt = new Date();
  const expiresAt = new Date(approvedAt.getTime());
  expiresAt.setMonth(expiresAt.getMonth() + 6);

  await setDoc(doc(db, "members", memberCode), {
    memberCode,
    name: r.name ?? "",
    telegramUsername: r.telegramUsername ?? "",
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

async function loadPendingRedeems() {
  const el = document.getElementById("redeemList");
  const qy = query(
    collection(db, "redeemRequests"),
    where("status","==","pending"),
    orderBy("createdAt","desc"),
    limit(40)
  );
  const snap = await getDocs(qy);

  if (snap.empty) { el.textContent = "Tidak ada pending redeem."; return; }

  el.innerHTML = `
    <table class="table">
      <thead><tr><th>MemberCode</th><th>Poin</th><th>Aksi</th></tr></thead>
      <tbody>
        ${snap.docs.map(d => {
          const rr = d.data();
          return `
            <tr>
              <td class="mono">${escapeHtml(rr.memberCode)}</td>
              <td>${escapeHtml(rr.pointsToSpend ?? 100)}</td>
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
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function generateUniqueVoucherCode() {
  // Unik berdasarkan dokumen tracking /vouchers (admin-only)
  for (let i = 0; i < 30; i++) {
    const n = randInt(1, 99999);
    const code = `TPGVOUCHMEMBER${n}`;
    const snap = await getDoc(doc(db, "vouchers", code));
    if (!snap.exists()) return code;
  }
  return `TPGVOUCHMEMBER${Date.now() % 100000}`;
}

async function approveRedeem(redeemRequestId) {
  const reqRef = doc(db, "redeemRequests", redeemRequestId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) return;

  const rr = reqSnap.data();
  const memberCode = rr.memberCode;
  const pointsToSpend = rr.pointsToSpend ?? 100;

  const voucherCode = await generateUniqueVoucherCode();
  const approvedAt = new Date();
  const expiresAt = new Date(approvedAt.getTime() + 7*24*60*60*1000); // 7 hari

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

    const curPoints = priv.points ?? 0;
    if (curPoints < pointsToSpend) throw new Error("Poin tidak cukup.");

    const newPoints = curPoints - pointsToSpend;

    const newVoucher = {
      code: voucherCode,
      discountRp: 1000,
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
      discountRp: 1000,
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

  // after approve, optional: nothing
}

async function rejectDoc(colName, id) {
  const ref = doc(db, colName, id);
  const reason = prompt("Alasan penolakan? (opsional)") ?? "";
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

    const cur = privSnap.data().points ?? 0;
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

    vouchers[idx].used = nextUsed;
    vouchers[idx].usedAt = nextUsed ? new Date() : null;

    tx.update(pubRef, { vouchers });

    const vSnap = await tx.get(vRef);
    if (vSnap.exists()) {
      tx.update(vRef, { used: nextUsed, usedAt: nextUsed ? new Date() : null });
    }
  });
}

async function adminDeleteVoucher(memberCode, voucherCode) {
  const ok = confirm(`Hapus voucher ${voucherCode}?`);
  if (!ok) return;

  await runTransaction(db, async (tx) => {
    const pubRef = doc(db, "membersPublic", memberCode);
    const vRef   = doc(db, "vouchers", voucherCode);

    const pubSnap = await tx.get(pubRef);
    if (!pubSnap.exists()) throw new Error("MemberPublic not found.");

    const pub = pubSnap.data();
    const vouchers = Array.isArray(pub.vouchers) ? pub.vouchers : [];
    const filtered = vouchers.filter(v => v.code !== voucherCode);

    tx.update(pubRef, { vouchers });

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
