import * as firebase from 'firebase/app'

import 'firebase/auth'
import 'firebase/firestore'
import 'firebase/analytics'
import 'firebase/performance'
import 'firebase/messaging'

const firebaseConfig = {
  apiKey: "AIzaSyCgIwubBz-nTd0mof6l7eklzJk1evuwzhg",
  authDomain: "bitwave-7f415.firebaseapp.com",
  databaseURL: "https://bitwave-7f415.firebaseio.com",
  projectId: "bitwave-7f415",
  storageBucket: "bitwave-7f415.appspot.com",
  messagingSenderId: "246532190856",
  appId: "1:246532190856:web:314a8853ea0f20717ee53d",
  measurementId: "G-W05DKSF957",
};

if ( !firebase.apps.length ) {
  firebase.initializeApp( firebaseConfig );
}

const auth = firebase.auth();
const db = firebase.firestore();
const FieldValue = firebase.firestore.FieldValue;
const EmailAuthProvider = firebase.auth.EmailAuthProvider;

export { auth, db, FieldValue, EmailAuthProvider }


const listenToAuthState = ( callback ) => {
  console.log( `Starting auth state listener.` );
  return auth.onAuthStateChanged( async user => {
    const runParallel = [];
    // Handle login
    if ( user ) {
      if ( process.env.APP_DEBUG ) console.log( '[Firebase] Authenticated', user );
      runParallel.push( callback( user ) );
    } else {
      if ( process.env.APP_DEBUG ) console.log( '[Firebase] Not Authenticated' );
      runParallel.push( callback( null ) );
    }
    await Promise.all( runParallel );
  }, async error => {
    console.error( 'Auth Error:', error );
    this.$sentry.captureException( error );
  });
};


export const listenToConfiguationUpdates = callbacks => {
  return db
    .collection( 'configurations' )
    .doc( 'bitwave.tv' )
    .onSnapshot( async doc => {
      if ( !doc.exists ) {
        console.error( `No configuration, are we offline?` );
        return;
      }
      const data = doc.data();
      await Promise.all( callbacks.map( async cb => await cb( data ) ) );
    }, error => {
      console.error( 'DB Configuration Query Failed:', error );
      this.$sentry.captureException( error );
    });
};


export const listenToFeatureFlags = callbacks => {
  return db
    .collection( 'configurations' )
    .doc( 'features' )
    .onSnapshot( async doc => {
      if ( !doc.exists ) {
        console.error( `No feature flags, are we offline?` );
        return;
      }
      const data = doc.data();
      await Promise.all( callbacks.map( async cb => await cb( data ) ) );
    }, error => {
      console.error( 'Feature Flags Query Failed:', error );
      this.$sentry.captureException( error );
    });
};


/**
 * Manage firebase authentication
 */
import { VStore } from '@/store';

export default async ( { app, store }, inject ) => {
  // only run client side
  if ( process.client ) {
    if ( process.env.APP_DEBUG ) console.log( '[Firebase] Plugin ran (client only)', app );

    // Listen for authentication changes
    listenToAuthState( async user => {
      if ( user ) await store.dispatch( VStore.$actions.login, user );
      // else await store.dispatch( VStore.$actions.logout );
    });

    // Listen to the configuration, and dispatch updates
    console.log( `Listening to configuration updates.` );
    listenToConfiguationUpdates([
      async ({ version }) => await store.dispatch( VStore.$actions.newVersionAvailable, version ),
      async ({ alerts }) => await store.dispatch( VStore.$actions.updateAlerts, alerts ),
    ]);

    // Listen to the feature flags, and dispatch updates
    console.log( `Listening to feature flags...` );
    listenToFeatureFlags([
      async ( featureFlags ) => await store.dispatch( VStore.$actions.updateFeatureFlags, featureFlags ),
    ]);

    // Begin performance mon
    console.log( `Starting performance module.` );
    const defaultPerformance = firebase.performance();
    inject( 'perf', defaultPerformance );

    // Inject analytics into context
    console.log( `Starting and injecting analytics module.` );
    const analytics = firebase.analytics();
    inject( 'analytics', analytics );


    // Add push notifications
    const messaging = firebase.messaging();
    messaging.usePublicVapidKey( 'BMghbCgNLfIbIqsuJaz4HV8EHYgu71MnONedQM26co3WfF2w0ahxzS6eq56JzPhaKVRamh_NtbbM-FdQsB-qXew' );
    inject( 'messaging', messaging );


    // Callback fired if Instance ID token is updated.
    messaging.onTokenRefresh(async () => {
      try {
        const refreshedToken = await messaging.getToken();

        console.log( 'Token refreshed.', refreshedToken );

        // Indicate that the new Instance ID token has not yet been sent to the app server.
        // setTokenSentToServer( false );

        // Send Instance ID token to app server.
        // sendTokenToServer( refreshedToken );
        // ...
      } catch ( err ) {
        console.log( 'Unable to retrieve refreshed token ', err );
        // showToken( 'Unable to retrieve refreshed token ', err );
      }
    });

    // Handle incoming messages. Called when:
    // - a message is received while the app has focus
    // - the user clicks on an app notification created by a service worker
    //   `messaging.setBackgroundMessageHandler` handler.
    messaging.onMessage(( payload ) => {
      console.log( 'Message received. ', payload );
    });


    // Persistence Manager
    /*try {
      await db.enablePersistence();
    } catch ( err ) {
      if ( err.code === 'failed-precondition' ) {
        console.log( `Multiple tabs open, persistence can only be enabled in one tab at a a time.` );
      } else if ( err.code === 'unimplemented' ) {
        console.log( `The current browser does not support all of the features required to enable persistence.` )
      }
    }*/
  }
}
