/**
 * Firebase Configuration
 * 
 * Replace the values below with your own Firebase project configuration.
 * To get these values:
 * 1. Go to https://console.firebase.google.com/
 * 2. Create a new project (or select existing)
 * 3. Enable Authentication > Google sign-in provider
 * 4. Create a Firestore Database
 * 5. Go to Project Settings > General > Your apps > Web app
 * 6. Copy the firebaseConfig object values below
 * 
 * Firestore Security Rules (paste in Firebase Console > Firestore > Rules):
 * 
 *   rules_version = '2';
 *   service cloud.firestore {
 *     match /databases/{database}/documents {
 *       match /users/{userId}/{document=**} {
 *         allow read, write: if request.auth != null && request.auth.uid == userId;
 *       }
 *     }
 *   }
 */

const firebaseConfig = {
  apiKey: "AIzaSyDDVkb44wwDLO-CQzx5zqMYEIFeX-Ytj8M",
  authDomain: "chord-library-a45df.firebaseapp.com",
  projectId: "chord-library-a45df",
  storageBucket: "chord-library-a45df.firebasestorage.app",
  messagingSenderId: "645134386532",
  appId: "1:645134386532:web:e80340d257d6d01bc0a671"
};
