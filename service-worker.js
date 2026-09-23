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

const NOME_CACHE = "claudio-v7.0";

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
  "https://cdn.jsdelivr.net",
  "https://esm.sh",
  // Caratteri di lettura: memorizzati al primo uso, così la pagina
  // mantiene il suo aspetto anche senza rete.
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
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
          /* Solo risposte con esito verificato. Le risposte opache
             venivano memorizzate "comunque", ma una risposta opaca può
             nascondere un 404: una libreria inesistente sarebbe stata
             conservata come valida e servita per sempre, anche dopo aver
             corretto l'indirizzo altrove. I tag delle librerie hanno ora
             l'attributo crossorigin, quindi le loro risposte non sono
             più opache e l'esito è leggibile. */
          if (risposta && risposta.ok) {
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

  /* cache: "no-cache" impone al browser di verificare col server prima
     di usare una copia memorizzata. È la correzione del blocco su una
     versione vecchia: GitHub Pages dichiara che le pagine si possono
     riusare per 10 minuti, e una semplice fetch() rispettava quella
     dichiarazione restituendo la copia precedente senza interrogare il
     server — la strategia "rete per prima" di fatto non raggiungeva la
     rete. Con la verifica, se il file non è cambiato il server risponde
     con un breve "non modificato", quindi il costo resta minimo. */
  const richiestaVerificata = new Request(richiesta.url, {
    cache: "no-cache",
    credentials: "same-origin",
  });

  evento.respondWith(
    fetch(richiestaVerificata)
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
