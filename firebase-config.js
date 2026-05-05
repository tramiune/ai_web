/**
 * Firebase Configuration for MotionAI Studio
 * Replace the placeholder values with your actual Firebase project config.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyAJ-4VLQNY2MBonRizyx8cRpqcGZhur2gI",
  authDomain: "notes-10acb.firebaseapp.com",
  projectId: "notes-10acb",
  storageBucket: "notes-10acb.appspot.com",
  messagingSenderId: "649788285348",
  appId: "1:649788285348:web:ba950a23c01b530511a131",
  measurementId: "G-CK1D1S6BSK"
};

/**
 * Admin emails authorized to access the management panel.
 */
export const ADMIN_EMAILS = ["your-email@gmail.com"];

/**
 * FIRESTORE SECURITY RULES (Example)
 * Copy and paste these into your Firebase Console -> Firestore -> Rules
 *
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     // Function to check if user is admin
 *     function isAdmin() {
 *       return request.auth != null && request.auth.token.email in ["your-email@gmail.com"];
 *     }
 *
 *     // Users can read/write their own profile (but not direct coin updates)
 *     match /users/{userId} {
 *       allow read: if request.auth != null && request.auth.uid == userId;
 *       allow create: if request.auth != null && request.auth.uid == userId;
 *       allow update: if isAdmin(); // Only admin can update coins/profile
 *     }
 *
 *     // Orders
 *     match /orders/{orderId} {
 *       allow read: if request.auth != null && (resource.data.userId == request.auth.uid || isAdmin());
 *       allow create: if request.auth != null;
 *       allow update: if isAdmin();
 *     }
 *
 *     // Topup requests
 *     match /topups/{topupId} {
 *       allow read: if request.auth != null && (resource.data.userId == request.auth.uid || isAdmin());
 *       allow create: if request.auth != null;
 *       allow update: if isAdmin();
 *     }
 *   }
 * }
 */
