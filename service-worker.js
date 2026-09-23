/* =========================================================
   service-worker.js — funzionamento offline e installabilità

   Il service worker viene registrato solo su origine sicura: è
   precisamente ciò che la pubblicazione su GitHub Pages rende
   possibile, e che con un file aperto da file:// non lo era.

   Due strategie distinte, perché le risorse hanno natura diversa:

   - GUSCIO DELL'APPLICAZIONE (index.html, manifest, icone):
     rete-per-prima con ricaduta sulla cache. Così un aggiornamento
     pubblicato viene recepito subito quando c'è rete, invece di
     restare bloccato su una versione vecchia, ma l'applicazione si
     apre comunque senza connessione.

   - LIBRERIE ESTERNE (pdf.js, epub.js, moduli ESM): cache-per-prima.
     Sono versionate nell'indirizzo, quindi non cambiano mai a parità
     di URL: riscaricarle sarebbe spreco. Memorizzate al primo
     utilizzo, rendono l'applicazione pienamente utilizzabile offline,
     cosa che su file:// non era ottenibile.

   I modelli vocali neurali NON passano di qui: pesano decine di
   megabyte e la libreria li conserva per conto proprio nel proprio
   archivio. Metterli anche in cache significherebbe raddoppiarne
   l'ingombro senza alcun vantaggio.

   AGGIORNAMENTI: a ogni nuova versione pubblicata incrementare
   NOME_CACHE. Senza questo passaggio il browser continua a servire
   la versione precedente dalla cache.
   ========================================================= */

const NOME_CACHE = "claudio-v6.4";

const GUSCIO_APPLICAZIONE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

const ORIGINI_LIBRERIE = [
  "https://cdnjs.cloudflare.com",
  "https://esm.sh",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(NOME_CACHE)
      // addAll fallisce interamente se una sola risorsa manca: si
      // inseriscono quindi una per una, tollerando le assenze.
      .then((cache) => Promise.all(
        GUSCIO_APPLICAZIONE.map((risorsa) => cache.add(risorsa).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomi) => Promise.all(
        nomi.filter((nome) => nome !== NOME_CACHE).map((nome) => caches.delete(nome))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const richiesta = evento.request;
  if (richiesta.method !== "GET") return;

  const indirizzo = new URL(richiesta.url);
  const eLibreriaEsterna = ORIGINI_LIBRERIE.some((origine) => richiesta.url.startsWith(origine));

  if (eLibreriaEsterna) {
    evento.respondWith(
      caches.match(richiesta).then((memorizzata) => {
        if (memorizzata) return memorizzata;
        return fetch(richiesta).then((risposta) => {
          // Le risposte opache (no-cors) non sono ispezionabili ma
          // restano utilizzabili: si memorizzano comunque.
          if (risposta && (risposta.ok || risposta.type === "opaque")) {
            const copia = risposta.clone();
            caches.open(NOME_CACHE).then((cache) => cache.put(richiesta, copia));
          }
          return risposta;
        });
      })
    );
    return;
  }

  if (indirizzo.origin !== self.location.origin) return;

  evento.respondWith(
    fetch(richiesta)
      .then((risposta) => {
        if (risposta && risposta.ok) {
          const copia = risposta.clone();
          caches.open(NOME_CACHE).then((cache) => cache.put(richiesta, copia));
        }
        return risposta;
      })
      .catch(() => caches.match(richiesta).then((memorizzata) => memorizzata || caches.match("./index.html")))
  );
});
