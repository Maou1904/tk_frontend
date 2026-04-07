// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAZ_BnLDehUvNwQssgdko6xikqKOImftns",
  authDomain: "tingkum-6f8cc.firebaseapp.com",
  projectId: "tingkum-6f8cc",
  storageBucket: "tingkum-6f8cc.firebasestorage.app",
  messagingSenderId: "376724286805",
  appId: "1:376724286805:web:50e1ce68ba1967d1f953dc",
  measurementId: "G-RRHBNQ685W"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);