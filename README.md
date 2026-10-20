<img src="assets/icon.svg" width="64" height="64" alt="">

# Playlist Bridge

A personal web app to browse Spotify and YouTube playlists and copy them between accounts. Review music-video matches, create private playlists, and resume transfers after API quota or connection interruptions. No transfer-service subscription or app-imposed song cap.

Requires **Node.js 24+**, a Spotify Premium account, and your own Spotify/Google OAuth app registrations.

```sh
npm install
cp .env.example .env
# Fill in your OAuth app credentials, then:
npm run dev
```

Open **http://127.0.0.1:3000**. See [the setup guide](docs/setup.md) for exact callback URLs, registration steps, quotas, and recovery behavior.

React + Vite interface, Express server, and local SQLite persistence. OAuth tokens stay on the server and are encrypted at rest. The app binds only to loopback and is intended for one person on their own computer.

```sh
npm test
npm run build
npm start
```

Research: [existing services](docs/research/playlist-transfer-services.md), [current API feasibility](docs/research/api-feasibility.md).
