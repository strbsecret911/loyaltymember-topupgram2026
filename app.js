/* ===============================
   FIREBASE (CDN MODULAR) – FIX
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

/* ===============================
   FIREBASE CONFIG (PUNYAMU)
   =============================== */

const firebaseConfig = {
  apiKey: "AIzaSyBPAPvzRAHLUVCVB1x7BbmgImB7IAQcrpY",
  authDomain: "loyaltymembertpg.firebaseapp.com",
  projectId: "loyaltymembertpg",
  storageBucket: "loyaltymembertpg.firebasestorage.app",
  messagingSenderId: "177443242278",
  appId: "1:177443242278:web:8aac0f53f1362abcf641e7"
};

/* ===============================
   INIT FIREBASE
   =============================== */

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();

/* ===============================
   BASIC STATE & ELEMENT
   =============================== */

const ADMIN_EMAIL = "dinijanuari23@gmail.com";

const appRoot = document.getElementById("app");
const topbarRight = document.getElementById("topbarRight");

const state = {
  isAdminRoute: false,
  adminUser: null,
  view: "landing" // landing | register | login
};

/* ===============================
   ROUTING
   =============================== */

function isAdminRoute() {
  return (location.hash || "").toLowerCase().includes("admin");
}

/* ===============================
   RENDER – PUBLIC
   =============================== */

function renderLanding() {
  appRoot.innerHTML = `
    <div class="card">
      <h1>Membership baru, mulai di sini</h1>
      <p>Silakan daftar atau login menggunakan kode membership.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" id="btnRegister">Daftar</button>
        <button class="btn secondary" id="btnLogin">Login</button>
      </div>
    </div>
  `;

  document.getElementById("btnRegister").onclick = () => {
    state.view = "register";
    render();
  };

  document.getElementById("btnLogin").onclick = () => {
    state.view = "login";
    render();
  };
}

function renderRegister() {
  appRoot.innerHTML = `
    <div class="card">
      <h2>Daftar Membership</h2>

      <label>Nama / Inisial</label>
      <input id="name" class="input" />

      <label>Username Telegram</label>
      <input id="telegram" class="input" placeholder="@username" />

      <br/>
      <button class="btn" id="submit">Kirim</button>
      <button class="btn secondary" id="back">Kembali</button>

      <p id="msg" class="small"></p>
    </div>
  `;

  document.getElementById("back").onclick = () => {
    state.view = "landing";
    render();
  };

  document.getElementById("submit").onclick = async () => {
    const name = document.getElementById("name").value.trim();
    let telegram = document.getElementById("telegram").value.trim();

    if (!name || !telegram) {
      document.getElementById("msg").textContent = "Lengkapi semua data.";
      return;
    }

    if (!telegram.startsWith("@")) telegram = "@" + telegram;

    await addDoc(collection(db, "requests"), {
      name,
      telegramUsername: telegram,
      status: "pending",
      createdAt: serverTimestamp()
    });

    document.getElementById("msg").textContent =
      "Permintaan terkirim. Tunggu persetujuan admin.";
  };
}

function renderLogin() {
  appRoot.innerHTML = `
    <div class="card">
      <h2>Login</h2>
      <p>Masukkan kode membership</p>

      <input id="code" class="input" placeholder="TPGCARD12345" />

      <br/>
      <button class="btn" id="search">Cari</button>
      <button class="btn secondary" id="back">Kembali</button>

      <p id="msg" class="small"></p>
    </div>
  `;

  document.getElementById("back").onclick = () => {
    state.view = "landing";
    render();
  };

  document.getElementById("search").onclick = async () => {
    const code = document.getElementById("code").value.trim().toUpperCase();
    if (!code) return;

    const snap = await getDoc(doc(db, "membersPublic", code));
    if (!snap.exists()) {
      document.getElementById("msg").textContent = "Kode tidak ditemukan.";
      return;
    }

    const m = snap.data();
    appRoot.innerHTML = `
      <div class="card">
        <h2>Member Card</h2>
        <p><b>${m.name}</b></p>
        <p>Kode: ${code}</p>
        <p>Poin: ${m.points ?? 0}</p>
        <button class="btn secondary" id="back">Keluar</button>
      </div>
    `;

    document.getElementById("back").onclick = () => {
      state.view = "landing";
      render();
    };
  };
}

/* ===============================
   RENDER – ADMIN
   =============================== */

function renderAdminLogin() {
  appRoot.innerHTML = `
    <div class="card">
      <h2>Admin Panel</h2>
      <button class="btn" id="loginGoogle">Login Google</button>
    </div>
  `;

  document.getElementById("loginGoogle").onclick = async () => {
    const res = await signInWithPopup(auth, provider);
    if (res.user.email !== ADMIN_EMAIL) {
      await signOut(auth);
      alert("Bukan admin");
    }
  };
}

function renderAdminPanel() {
  appRoot.innerHTML = `
    <div class="card">
      <h2>Admin Panel</h2>
      <p>Login sebagai ${state.adminUser.email}</p>
      <button class="btn danger" id="logout">Logout</button>
    </div>
  `;

  document.getElementById("logout").onclick = () => signOut(auth);
}

/* ===============================
   MAIN RENDER
   =============================== */

function render() {
  state.isAdminRoute = isAdminRoute();

  if (state.isAdminRoute) {
    topbarRight.innerHTML = `<span class="badge">Admin</span>`;
    if (!state.adminUser) renderAdminLogin();
    else renderAdminPanel();
    return;
  }

  topbarRight.innerHTML = `<a href="#admin" class="badge">Admin</a>`;

  if (state.view === "landing") renderLanding();
  if (state.view === "register") renderRegister();
  if (state.view === "login") renderLogin();
}

/* ===============================
   AUTH LISTENER
   =============================== */

onAuthStateChanged(auth, (user) => {
  if (user && user.email === ADMIN_EMAIL) state.adminUser = user;
  else state.adminUser = null;
  render();
});

/* ===============================
   BOOT
   =============================== */

render();
