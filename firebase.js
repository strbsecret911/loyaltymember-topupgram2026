import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBPAPvzRAHLUVCVB1x7BbmgImB7IAQcrpY",
  authDomain: "loyaltymembertpg.firebaseapp.com",
  projectId: "loyaltymembertpg",
  storageBucket: "loyaltymembertpg.firebasestorage.app",
  messagingSenderId: "177443242278",
  appId: "1:177443242278:web:8aac0f53f1362abcf641e7",
  measurementId: "G-Y03QP3MP6H"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export async function adminLogin(){
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export async function adminLogout(){
  return signOut(auth);
}
