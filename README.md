# 🌟 VaaniArc

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/Node.js-18+-green.svg)
![React](https://img.shields.io/badge/React-18-61dafb.svg)
![Socket.io](https://img.shields.io/badge/Socket.IO-Realtime-black.svg)
![MongoDB](https://img.shields.io/badge/MongoDB-E3E3E3.svg?logo=mongodb)

VaaniArc is a web-first real-time chat and collaboration application built with React, Vite, Node.js, Express, Socket.IO, and MongoDB infrastructure. It represents a fully secure, scalable, and instant communication hub serving real-time encrypted messaging to concurrent devices.

## 🏗️ System Architecture Flowchart

Our monolithic-modular design separates boundaries across identity, real-time messaging, and storage, while maintaining high cohesion.

```mermaid
graph LR
    %% Styles
    classDef client fill:#e0f2fe,stroke:#3b82f6,stroke-width:2px,color:#000
    classDef gateway fill:#fef08a,stroke:#ca8a04,stroke-width:2px,color:#000
    classDef logic fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#000
    classDef storage fill:#ffedd5,stroke:#eab308,stroke-width:2px,color:#000

    %% Client Tier
    subgraph ClientLayer ["1. Client / Edge"]
        direction TB
        WebApp["Web App (React/Vite)"]:::client
        Crypto["E2EE Engine (WebCrypto)"]:::client
    end

    %% Gateway Tier
    subgraph NetworkGateway ["2. Network Gateway"]
        direction TB
        API["REST API (Express)"]:::gateway
        WSS["WebSocket (Socket.IO)"]:::gateway
    end

    %% Logic Tier
    subgraph CoreServices ["3. Microservice Logic Hub"]
        direction TB
        AuthSvc["Auth & Passkeys"]:::logic
        RealtimeSvc["Real-Time Pub/Sub"]:::logic
        MsgSvc["Messaging & Media"]:::logic
    end

    %% Persistence
    subgraph StorageLayer ["4. Data & Cache Layer"]
        direction TB
        Mongo[("MongoDB")]:::storage
        MemCache[("In-Memory Cache")]:::storage
    end

    %% Connections
    Crypto <--> WebApp
    
    WebApp -->|HTTPS| API
    WebApp <-->|Persistent WSS| WSS
    
    API --> AuthSvc
    API --> MsgSvc
    WSS <--> RealtimeSvc
    
    AuthSvc --> Mongo
    MsgSvc --> Mongo
    RealtimeSvc <--> MemCache
```

*Note: The system employs an event-driven architecture bridging Express controllers and Socket.IO event handlers back to a centralized MongoDB (with Mongoose ODM).*

## 🚀 Core & Advanced Features

VaaniArc is packed with foundations designed for seamless, scalable, and highly secure communication:

| Feature Category | Highlights |
| :--- | :--- |
| ⚡ **Real-Time Engine** | Instant message delivery, typing indicators, active presence via Socket.IO. |
| 🛡️ **Military-Grade E2EE** | Post-quantum ready device-aware payloads; Key Transparency verification (no blind TOFU). |
| 🔑 **Modern Auth Identity** | Passwordless WebAuthn (Passkeys), TOTP 2FA, secure encrypted cookie sessions. |
| 🏢 **Spaces & Channels** | Community building, direct private messaging, logical user organization grids. |
| 🎥 **Media & Collaboration** | Built-in meeting interfaces (WebRTC), secure E2EE file transmissions & limits. |
| 🔒 **Social Key Recovery** | Passwordless encryption rescue leveraging Shamir's Secret Sharing (offline shards). |
| 📈 **Data Reliability** | Operation caching via Idempotency keys & DB Optimistic Locking to dodge networking drops/glitches. |
| 📱 **Omni-platform Sync** | Independent multi-device session tracking & encrypted Web-Push notifications. |

## ✨ What Sets VaaniArc Apart

While many chat applications offer basic messaging, VaaniArc natively integrates several advanced architectural choices often skipped by standard chat tools:

- **Integrated Key Transparency System:** Unlike standard chat apps, VaaniArc verifies E2EE keys transparently without relying strictly on trust-on-first-use (TOFU), giving users cryptographically verifiable security.
- **Native Idempotency & Optimistic Locking:** Ensures no multi-device sync collisions or duplicated deliveries during high latency or intermittent offline scenarios.
- **Decoupled Identity System:** Full identity verification and account management without reliance on external verifiers like SMS gateways or third-party mailing networks.
- **Device-Level Granular Security:** The system tracks not just 'User' encryption, but 'Device-Aware' keys, allowing exact revocation and secure rotations perfectly tailored per device.

## 🔮 Future Roadmap (What We Are Building Next)

To establish VaaniArc as a massive enterprise and production-ready system better than current market leaders, our roadmap includes advanced features that we are pioneering:

- **Massive Group Calls (SFU Integration):** Standard WebRTC limits calls to 5-6 users. We are transitioning our backend to use `mediasoup` (SFU proxy) to support huge 100+ participant rooms similar to Zoom or Discord.
- **True Offline Sync (CRDTs):** Current standard messaging can suffer overlap when reconnecting to the internet. We will use React front-end CRDTs (`Yjs` or `Automerge`) for flawless, conflict-free merging of offline edits.
- **On-Device Translation (WASM):** Using cloud APIs compromises E2EE. Our plan includes local WebAssembly (WASM) models directly in the browser to translate chats in real-time securely on the user's device.
- **Offline Mesh Network:** Adding Bluetooth and Wi-Fi Direct support so messages can hop through a localized offline mesh network of nearby devices when centralized internet is unavailable!

## Tech Stack

### Frontend

- React
- Vite
- Tailwind CSS
- Socket.IO Client
- Radix UI

### Backend

- Node.js
- Express
- Socket.IO
- MongoDB with Mongoose
- JWT and session security middleware
- Web Push

## Quick Start

### Prerequisites

- Node.js 18+
- npm 8+
- MongoDB local instance or MongoDB Atlas

### Install

```bash
git clone https://github.com/ViktorRez99/Vaaniarc_chatApp.git
cd Vaaniarc_chatApp
npm run setup
```

### Environment

Create a root `.env` file:

```env
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
MONGODB_URI=mongodb://127.0.0.1:27017/chatapp
JWT_SECRET=replace_this_with_a_strong_secret
JWT_EXPIRES_IN=7d
MAX_FILE_SIZE=5242880
```

### Run in Development

```bash
npm run dev:full
```

`dev:full` starts backend and frontend together. If port `3000` is already busy, the launcher will select the next available backend port automatically.

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`

### Local Parity Stack

For local MongoDB parity with the production topology:

```bash
docker compose up -d
```

Then use:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/chatapp
FRONTEND_URL=http://localhost:5173
```

## Project Structure

```text
vaaniArc/
|- client/
|  |- src/
|  |  |- components/
|  |  |- context/
|  |  |- services/
|  |  |- utils/
|  |  |- App.jsx
|  |  `- main.jsx
|  `- package.json
|- server/
|  |- middleware/
|  |- models/
|  |- routes/
|  |- services/
|  |- utils/
|  |- entry.js
|  `- server.js
|- tests/
|- package.json
`- README.md
```

## Key Runtime Flow

1. Users authenticate from the React frontend.
2. The frontend can authenticate with password or passkey, then bootstraps device-bound encryption in the background.
3. The frontend sends REST requests for auth, profile, recovery kits, chat, room, upload, and device actions.
4. The backend validates requests, stores only encrypted recovery shards for social recovery, and persists state in MongoDB.
5. Socket.IO carries realtime chat, presence, and event updates back to connected clients.
6. Push notifications are delivered through the service worker and Web Push when supported.

## 📚 Technical Documentation

Explore these detailed architecture design and algorithm documents created alongside the VaaniArc codebase:

- [Post-Quantum End-to-End Encryption](./docs/end-to-end-encryption.md) - Deep dive into ML-KEM/Kyber hybrid encryption matching our `DeviceKeyMaterial.js` and `e2eePayloads.js` mechanisms.
- [Account Social Recovery (Shamir)](./docs/account-recovery.md) - Detailed breakdown of how the backend routes zero-knowledge envelopes via `RecoveryKit.js`.
- [Core Algorithms & Data Reliability](./docs/core-algorithms.md) - Idempotency, caching, and optimistic locking logic.
- [Real-Time WebSocket Architecture](./docs/realtime-architecture.md) - Socket connection, payloads, in-memory scaling, and presence systems.

---

## 👥 Project Team & Contributions

### Lead Members & Roles

| Role | Details | Team Members |
| :--- | :--- | :--- |
| **Backend Architect** | System design, E2EE engines, Realtime WebSockets, DB schemas | Abhrajyoti Nath ([@abhrajyoti-01](https://github.com/abhrajyoti-01)) |
| **Backend QA Ops** | System testing, Bug fixing, Edge-case debugging, CI checks | Bikram Debnath |
| **Frontend Engineering** | UI/UX implementation, React & Vite Optimizations | Rudrashis Das, Jaya Mondal |
| **Frontend Ops** | CSS styling, Documentation help | Ankur Barik, Sayan Ghosh |

### Contribution Overview

This project automatically tracks who contributed and how much work they submitted based on GitHub history. Below you can see the dynamic contributors metrics shown by `contrib.rocks` and Shields.io:

[![GitHub Contributors](https://img.shields.io/github/contributors/ViktorRez99/Vaaniarc_chatApp?style=for-the-badge&color=8CC84B)](https://github.com/ViktorRez99/Vaaniarc_chatApp/graphs/contributors)

[![Contributors list](https://contrib.rocks/image?repo=ViktorRez99/Vaaniarc_chatApp)](https://github.com/ViktorRez99/Vaaniarc_chatApp/graphs/contributors)

*(Information auto-updates based on commits pushed to the repository).*

## Important Notes

- Support and issue tracking should go through GitHub Issues.
- If contributor identities change or more commits are pushed under different names, update the contribution table accordingly.

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

## Support

Open an issue in this repository for bugs, fixes, or feature requests.
