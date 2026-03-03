# Basket Motion MVP per Netlify

Questo progetto crea un mini gioco a 2 dispositivi:

- **Schermo principale**: `index.html`
- **Controller da telefono**: `controller.html`
- **Pairing**: QR code generato sullo schermo
- **Backend**: Netlify Functions + Netlify Blobs

## Cosa fa
- crea automaticamente una **stanza**
- mostra un **QR code** iniziale sullo schermo
- il telefono apre il link del controller già associato alla stanza
- il controller invia il tiro tramite:
  - **sensori di movimento**
  - oppure **swipe** sulla palla (fallback affidabile)
- lo schermo anima la traiettoria, conta **punti**, **tentativi** e **canestri**

## Come pubblicarlo su Netlify
Per questa versione, il metodo giusto è:

### Opzione consigliata
1. carica il contenuto di questa cartella su **GitHub**
2. in Netlify scegli **Import from Git**
3. seleziona la repository
4. deploy

Il progetto è già configurato con `netlify.toml`.

## Perché non basta il semplice drag & drop della sola cartella pubblica
Questa versione usa **Netlify Functions** e **Netlify Blobs**, quindi non è un sito statico puro.
Serve che Netlify elabori anche le funzioni serverless durante il deploy.

## File principali
- `index.html` → schermata grande
- `controller.html` → controller telefono
- `screen.js` → logica schermo, QR, polling, animazione tiro
- `controller.js` → logica controller, sensori e swipe
- `netlify/functions/game.mjs` → API stanza, heartbeat, tiro, punteggio
- `styles.css` → grafica

## Note utili
- su iPhone bisogna premere **Abilita sensori**
- se i sensori non vanno bene, lo **swipe** funziona da fallback
- la logica del tiro è volutamente semplice per un MVP

## Miglioramenti possibili
- fisica più realistica
- audio
- timer / modalità arcade
- leaderboard
- multiplayer
- smoothing avanzato dei sensori
