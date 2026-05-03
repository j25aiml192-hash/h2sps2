// File: scripts/init-firestore.js
const admin = require('firebase-admin');
// Note: You must place your firebase-service-account.json in this directory or update the path
// For security, this file is not committed to git.
const serviceAccount = require('./firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function initializeCollections() {
  // Create indexes
  console.log('Creating Firestore indexes...');
  
  // Required indexes (you'll create these in Firebase Console)
  console.log(`
  Go to Firestore Console → Indexes → Create Index:
  
  Collection: election_news
  Fields: relevanceScore (Descending), processedAt (Descending)
  
  Collection: election_news  
  Fields: regions (Array), processedAt (Descending)
  
  Collection: ai_analytics
  Fields: timestamp (Descending), event (Ascending)
  `);

  // Create sample document to initialize collections
  await db.collection('election_news').doc('_init').set({
    initialized: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await db.collection('ai_analytics').doc('_init').set({
    initialized: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await db.collection('election_debates').doc('_init').set({
    initialized: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('Collections initialized!');
}

initializeCollections().catch(console.error);
