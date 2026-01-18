import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  where,
  limit
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/** =========================
 *  CONFIG: isi punyamu
 *  ========================= */
const firebaseConfig = {
  apiKey: "AIzaSyBPAPvzRAHLUVCVB1x7BbmglmB71AQcrpY",
  authDomain: "loyaltymembertpg.firebaseapp.com",
  projectId: "loyaltymembertpg",
  storageBucket: "loyaltymembertpg.firebasestorage.app",
  messagingSenderId: "177443242278",
  appId: "1:177443242278:web:8aac0f53f1362abcf641e7",
  measurementId: "G-Y03QP3MP6H"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/** =========================
 *  UI helpers
 *  ========================= */
const $ = (id) => document.getElementById(id);

const viewAuth = $("viewAuth");
const viewUser = $("viewUser");
const viewAdmin = $("viewAdmin");

const whoami = $("whoami");
const btnSignOut = $("btnSignOut");

const toastEl = $("toast");
let toastTimer = null;
function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2200);
}

function rupiah(n){
  const x = Number(n || 0);
  return new Intl.NumberFormat("id-ID", { style:"currency", currency:"IDR", maximumFractionDigits:0 }).format(x);
}

function showOnly(which){
  viewAuth.classList.add("hidden");
  viewUser.classList.add("hidden");
  viewAdmin.classList.add("hidden");

  which.classList.remove("hidden");
}

$("year").textContent = new Date().getFullYear();

/** =========================
 *  AUTH actions
 *  ========================= */
$("btnLogin").addEventListener("click", async () => {
  const email = $("authEmail").value.trim();
  const pass = $("authPass").value.trim();
  if(!email || !pass) return toast("Isi email & password dulu ya.");
  try{
    await signInWithEmailAndPassword(auth, email, pass);
    toast("Login berhasil.");
  }catch(e){
    console.error(e);
    toast(e?.message || "Gagal login.");
  }
});

$("btnRegister").addEventListener("click", async () => {
  const email = $("authEmail").value.trim();
  const pass = $("authPass").value.trim();
  if(!email || !pass) return toast("Isi email & password dulu ya.");
  if(pass.length < 6) return toast("Password minimal 6 karakter.");
  try{
    const cred = await createUserWithEmailAndPassword(auth, email, pass);

    // Buat profil user default
    await setDoc(doc(db, "users", cred.user.uid), {
      email,
      role: "user",         // default
      createdAt: serverTimestamp(),
    }, { merge: true });

    toast("Daftar berhasil. Kamu sudah login.");
  }catch(e){
    console.error(e);
    toast(e?.message || "Gagal daftar.");
  }
});

btnSignOut.addEventListener("click", async () => {
  await signOut(auth);
  toast("Sampai ketemu lagi!");
});

/** =========================
 *  ROLE & ROUTING
 *  ========================= */
let currentUser = null;
let currentRole = "user";

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if(!user){
    whoami.classList.add("hidden");
    btnSignOut.classList.add("hidden");
    showOnly(viewAuth);
    return;
  }

  btnSignOut.classList.remove("hidden");

  const role = await getUserRole(user.uid, user.email);
  currentRole = role;

  whoami.textContent = `${user.email} • ${role.toUpperCase()}`;
  whoami.classList.remove("hidden");

  if(role === "admin"){
    showOnly(viewAdmin);
    await adminRefreshAll();
  }else{
    showOnly(viewUser);
    await userRefreshAll();
  }
});

async function getUserRole(uid, email){
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref, { email, role: "user", createdAt: serverTimestamp() }, { merge:true });
    return "user";
  }
  const data = snap.data();
  return data?.role === "admin" ? "admin" : "user";
}

/** =========================
 *  USER PANEL
 *  - Read plans
 *  - Create membership request
 *  - Read my membership
 *  ========================= */
$("btnRefreshPlans").addEventListener("click", userLoadPlans);
$("btnRefreshMe").addEventListener("click", userLoadMyMembership);

async function userRefreshAll(){
  await userLoadPlans();
  await userLoadMyMembership();
}

async function userLoadPlans(){
  const plansGrid = $("plansGrid");
  plansGrid.innerHTML = `<div class="muted">Memuat paket...</div>`;

  try{
    const q = query(collection(db, "plans"), orderBy("price", "asc"));
    const snap = await getDocs(q);

    if(snap.empty){
      plansGrid.innerHTML = `<div class="muted">Belum ada paket. (Admin bisa buat paket di Admin Panel)</div>`;
      return;
    }

    plansGrid.innerHTML = "";
    snap.forEach((d) => {
      const p = d.data();
      const benefits = Array.isArray(p.benefits) ? p.benefits : [];
      const el = document.createElement("div");
      el.className = "plan";
      el.innerHTML = `
        <div class="name">${escapeHtml(p.name || "Paket")}</div>
        <div class="price">${rupiah(p.price)}</div>
        <div class="muted small">Durasi: ${Number(p.days || 0)} hari</div>
        <ul>${benefits.map(b => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
        <div class="actions">
          <button class="btn primary" data-action="join" data-planid="${d.id}">Gabung</button>
        </div>
      `;
      plansGrid.appendChild(el);
    });

    plansGrid.querySelectorAll(`[data-action="join"]`).forEach(btn => {
      btn.addEventListener("click", () => userRequestMembership(btn.dataset.planid));
    });
  }catch(e){
    console.error(e);
    plansGrid.innerHTML = `<div class="muted">Gagal memuat paket.</div>`;
    toast("Gagal memuat paket.");
  }
}

async function userRequestMembership(planId){
  if(!currentUser) return;
  try{
    // Cek apakah sudah ada request "pending" terbaru
    const existing = await getDocs(query(
      collection(db, "memberships"),
      where("uid","==", currentUser.uid),
      orderBy("createdAt","desc"),
      limit(1)
    ));

    if(!existing.empty){
      const last = existing.docs[0].data();
      if(last.status === "pending"){
        toast("Request kamu masih pending.");
        return;
      }
    }

    await addDoc(collection(db, "memberships"), {
      uid: currentUser.uid,
      email: currentUser.email,
      planId,
      status: "pending",      // pending | active | rejected | expired
      createdAt: serverTimestamp(),
      activeUntil: null,      // Timestamp jika di-approve
    });

    toast("Request terkirim! Menunggu approve admin.");
    await userLoadMyMembership();
  }catch(e){
    console.error(e);
    toast("Gagal mengirim request.");
  }
}

async function userLoadMyMembership(){
  const box = $("myMembership");
  box.textContent = "Memuat...";
  if(!currentUser) return;

  try{
    const snap = await getDocs(query(
      collection(db, "memberships"),
      where("uid","==", currentUser.uid),
      orderBy("createdAt","desc"),
      limit(1)
    ));

    if(snap.empty){
      box.innerHTML = `<span class="muted">Belum ada membership. Pilih paket untuk request.</span>`;
      return;
    }

    const mDoc = snap.docs[0];
    const m = mDoc.data();

    // Ambil info plan untuk tampilan
    let planTxt = m.planId;
    const pSnap = await getDoc(doc(db, "plans", m.planId));
    if(pSnap.exists()){
      const p = pSnap.data();
      planTxt = `${p.name} (${rupiah(p.price)} / ${p.days} hari)`;
    }

    const until = m.activeUntil?.toDate ? m.activeUntil.toDate() : null;
    const untilTxt = until ? until.toLocaleString("id-ID") : "—";

    box.innerHTML = `
      <div><b>Status:</b> ${badge(m.status)}</div>
      <div><b>Paket:</b> ${escapeHtml(planTxt)}</div>
      <div><b>Aktif sampai:</b> ${escapeHtml(untilTxt)}</div>
      <div class="muted small">ID: ${mDoc.id}</div>
    `;
  }catch(e){
    console.error(e);
    box.innerHTML = `<span class="muted">Gagal memuat status membership.</span>`;
    toast("Gagal memuat membership.");
  }
}

/** =========================
 *  ADMIN PANEL
 *  - Create/update plans
 *  - List & delete plans
 *  - Approve/reject membership
 *  ========================= */
$("btnSavePlan").addEventListener("click", adminSavePlan);
$("btnSeedPlans").addEventListener("click", adminSeedPlans);
$("btnAdminRefreshPlans").addEventListener("click", adminLoadPlans);
$("btnRefreshRequests").addEventListener("click", adminLoadRequests);

async function adminRefreshAll(){
  await adminLoadPlans();
  await adminLoadRequests();
}

async function adminSavePlan(){
  const name = $("planName").value.trim();
  const price = Number($("planPrice").value || 0);
  const days = Number($("planDays").value || 0);
  const benefitsRaw = $("planBenefits").value.split("\n").map(s => s.trim()).filter(Boolean);

  if(!name) return toast("Nama paket wajib diisi.");
  if(!price || price < 0) return toast("Harga tidak valid.");
  if(!days || days < 1) return toast("Durasi minimal 1 hari.");

  try{
    // Simple: pakai name sebagai key dokumen yang "aman"
    const id = slug(name);
    await setDoc(doc(db, "plans", id), {
      name,
      price,
      days,
      benefits: benefitsRaw,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(), // merge akan menjaga kalau sudah ada
    }, { merge: true });

    toast("Paket tersimpan.");
    $("planName").value = "";
    $("planPrice").value = "";
    $("planDays").value = "";
    $("planBenefits").value = "";
    await adminLoadPlans();
  }catch(e){
    console.error(e);
    toast("Gagal simpan paket.");
  }
}

async function adminSeedPlans(){
  try{
    const samples = [
      {
        name: "Silver",
        price: 25000,
        days: 30,
        benefits: ["Diskon 5%", "Support standar", "Akses promo mingguan"],
      },
      {
        name: "Gold",
        price: 50000,
        days: 30,
        benefits: ["Diskon 10%", "Priority support", "Akses promo harian"],
      },
      {
        name: "Platinum",
        price: 120000,
        days: 90,
        benefits: ["Diskon 15%", "VIP support", "Promo eksklusif", "Prioritas layanan"],
      },
    ];

    for(const p of samples){
      await setDoc(doc(db, "plans", slug(p.name)), {
        ...p,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge:true });
    }
    toast("Paket contoh dibuat.");
    await adminLoadPlans();
  }catch(e){
    console.error(e);
    toast("Gagal membuat paket contoh.");
  }
}

async function adminLoadPlans(){
  const box = $("adminPlans");
  box.innerHTML = `<div class="muted">Memuat paket...</div>`;

  try{
    const snap = await getDocs(query(collection(db, "plans"), orderBy("price","asc")));
    if(snap.empty){
      box.innerHTML = `<div class="muted">Belum ada paket.</div>`;
      return;
    }

    box.innerHTML = "";
    snap.forEach((d) => {
      const p = d.data();
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="meta">
          <div class="title">${escapeHtml(p.name)} <span class="muted small">(${d.id})</span></div>
          <div class="sub">${rupiah(p.price)} • ${Number(p.days)} hari</div>
          <div class="sub">${Array.isArray(p.benefits) ? p.benefits.map(escapeHtml).join(" • ") : ""}</div>
        </div>
        <div class="actions">
          <button class="btn" data-action="delete-plan" data-id="${d.id}">Hapus</button>
        </div>
      `;
      box.appendChild(el);
    });

    box.querySelectorAll(`[data-action="delete-plan"]`).forEach(btn => {
      btn.addEventListener("click", () => adminDeletePlan(btn.dataset.id));
    });
  }catch(e){
    console.error(e);
    box.innerHTML = `<div class="muted">Gagal memuat paket.</div>`;
    toast("Gagal memuat paket.");
  }
}

async function adminDeletePlan(planId){
  try{
    await deleteDoc(doc(db, "plans", planId));
    toast("Paket dihapus.");
    await adminLoadPlans();
  }catch(e){
    console.error(e);
    toast("Gagal hapus paket.");
  }
}

async function adminLoadRequests(){
  const box = $("requestsList");
  box.innerHTML = `<div class="muted">Memuat request...</div>`;

  try{
    const snap = await getDocs(query(
      collection(db, "memberships"),
      orderBy("createdAt","desc"),
      limit(25)
    ));

    if(snap.empty){
      box.innerHTML = `<div class="muted">Belum ada request.</div>`;
      return;
    }

    box.innerHTML = "";
    for(const d of snap.docs){
      const m = d.data();

      let planTxt = m.planId;
      const pSnap = await getDoc(doc(db, "plans", m.planId));
      if(pSnap.exists()){
        const p = pSnap.data();
        planTxt = `${p.name} • ${rupiah(p.price)} • ${p.days} hari`;
      }

      const until = m.activeUntil?.toDate ? m.activeUntil.toDate() : null;
      const untilTxt = until ? until.toLocaleString("id-ID") : "—";

      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="meta">
          <div class="title">${escapeHtml(m.email || "—")}</div>
          <div class="sub">Paket: ${escapeHtml(planTxt)}</div>
          <div class="sub">Status: ${badge(m.status)} • Aktif sampai: ${escapeHtml(untilTxt)}</div>
          <div class="sub muted">UID: ${escapeHtml(m.uid || "—")} • ID: ${d.id}</div>
        </div>
        <div class="actions">
          ${m.status === "pending" ? `
            <button class="btn primary" data-action="approve" data-id="${d.id}" data-planid="${m.planId}">Approve</button>
            <button class="btn" data-action="reject" data-id="${d.id}">Reject</button>
          ` : `
            <button class="btn" data-action="expire" data-id="${d.id}">Set Expired</button>
          `}
        </div>
      `;
      box.appendChild(el);
    }

    box.querySelectorAll(`[data-action="approve"]`).forEach(btn => {
      btn.addEventListener("click", () => adminApprove(btn.dataset.id, btn.dataset.planid));
    });
    box.querySelectorAll(`[data-action="reject"]`).forEach(btn => {
      btn.addEventListener("click", () => adminSetStatus(btn.dataset.id, "rejected"));
    });
    box.querySelectorAll(`[data-action="expire"]`).forEach(btn => {
      btn.addEventListener("click", () => adminSetStatus(btn.dataset.id, "expired"));
    });

  }catch(e){
    console.error(e);
    box.innerHTML = `<div class="muted">Gagal memuat request.</div>`;
    toast("Gagal memuat request.");
  }
}

async function adminApprove(membershipId, planId){
  try{
    // Ambil durasi dari plan
    const pSnap = await getDoc(doc(db, "plans", planId));
    if(!pSnap.exists()){
      toast("Plan tidak ditemukan.");
      return;
    }
    const p = pSnap.data();
    const days = Number(p.days || 0);

    // Hitung activeUntil dari sekarang
    const now = new Date();
    const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    await updateDoc(doc(db, "memberships", membershipId), {
      status: "active",
      activeUntil: until,
      approvedAt: serverTimestamp(),
    });

    toast("Membership di-approve.");
    await adminLoadRequests();
  }catch(e){
    console.error(e);
    toast("Gagal approve.");
  }
}

async function adminSetStatus(membershipId, status){
  try{
    await updateDoc(doc(db, "memberships", membershipId), {
      status,
      updatedAt: serverTimestamp(),
    });
    toast("Status diperbarui.");
    await adminLoadRequests();
  }catch(e){
    console.error(e);
    toast("Gagal update status.");
  }
}

/** =========================
 *  Small utilities
 *  ========================= */
function slug(s){
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
}

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function badge(status){
  const map = {
    pending: "🟡 Pending",
    active: "🟢 Active",
    rejected: "🔴 Rejected",
    expired: "⚪ Expired",
  };
  return map[status] || escapeHtml(status);
}

 
