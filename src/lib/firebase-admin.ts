/**
 * Firebase Admin SDK singleton (server-side only).
 * Initialises once and re-uses the same app instance on hot-reloads.
 */
import * as admin from "firebase-admin";

function getFirebaseAdmin(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    // Production: full service-account JSON stored as env var
    const serviceAccount = JSON.parse(serviceAccountJson) as admin.ServiceAccount;
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }

  // Development fallback: Application Default Credentials (ADC)
  return admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID ?? "ai-provider-dev",
  });
}

export const firebaseAdmin = getFirebaseAdmin();
export const firestoreDB = firebaseAdmin.firestore();
