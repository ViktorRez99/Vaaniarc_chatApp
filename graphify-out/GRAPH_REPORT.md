# Graph Report - vaaniArc  (2026-04-26)

## Corpus Check
- 130 files · ~166,562 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 833 nodes · 1260 edges · 43 communities detected
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 133 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]

## God Nodes (most connected - your core abstractions)
1. `ApiService` - 101 edges
2. `SocketService` - 54 edges
3. `WhatsApp Killer Master Plan` - 17 edges
4. `useAuth()` - 16 edges
5. `auditLog()` - 13 edges
6. `normalizeId()` - 12 edges
7. `errorHandler()` - 10 edges
8. `VaaniArc README` - 10 edges
9. `appendTransparencyEntry()` - 9 edges
10. `VaaniArc Project Overview` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Zero-Knowledge Architecture` --semantically_similar_to--> `End-to-End Encryption`  [INFERRED] [semantically similar]
  PROJECT_OVERVIEW.md → README.md
- `VaaniArc Project Overview` --semantically_similar_to--> `VaaniArc README`  [INFERRED] [semantically similar]
  PROJECT_OVERVIEW.md → README.md
- `Mediasoup SFU Architecture` --semantically_similar_to--> `Massive Group Calls SFU`  [INFERRED] [semantically similar]
  PROJECT_OVERVIEW.md → README.md
- `Passkeys FIDO2 Authentication` --semantically_similar_to--> `Passwordless WebAuthn Login`  [INFERRED] [semantically similar]
  PROJECT_OVERVIEW.md → README.md
- `Shamir's Secret Sharing` --semantically_similar_to--> `WebAuthn and Shamir's Secret Sharing`  [INFERRED] [semantically similar]
  PROJECT_OVERVIEW.md → plans/WHATSAPP_KILLER_MASTERPLAN.md

## Hyperedges (group relationships)
- **Authentication and Identity Flow** — project_overview_passkeys_fido2, project_overview_shamir_secret_sharing, masterplan_webauthn_shamir, readme_webauthn_roadmap, ui_ux_pro_max [INFERRED 0.85]
- **Offline Messaging Stack** — project_overview_crdts, project_overview_webrtc_qr_offline, masterplan_crdts_implementation, masterplan_qr_webrtc_offline, readme_crdts_roadmap, readme_offline_mesh, plan_offline_crdts, plan_qr_offline_messaging [INFERRED 0.87]
- **Privacy and Security Features** — project_overview_zero_knowledge_architecture, project_overview_post_quantum_e2ee, project_overview_merkle_tree_transparency, project_overview_stealth_vault, masterplan_stealth_vault, masterplan_merkle_tree, readme_key_transparency, readme_e2ee [INFERRED 0.90]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (4): ApiService, createApiError(), createIdempotencyKey(), getCookieValue()

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (4): canUseStorage(), createQueueEntryId(), SocketService, configureSocketAdapter()

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (55): Blurhash Image Previews, Codex Execution Framework, Contextual Message Actions, CRDTs Implementation Plan, Dev Prod Parity, Indian Language Translation, IPFS Decentralized Attachments, Merkle Tree Key Transparency Implementation (+47 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (24): AppRoutes(), ProtectedRoute(), PublicOnlyRoute(), AppShell(), useAuth(), ChannelsPage(), ChatHub(), ChatsPage() (+16 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (23): Auth(), buildRedisKey(), cleanupMemoryMap(), deleteRedisKeysByPrefix(), ensureRedisConnection(), emitPrivateMessageEvent(), mergeHotAndColdKeyBundle(), serializeDeviceRecord() (+15 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (33): buildConversationId(), serializeChannelConversation(), serializeChannelPost(), serializeDirectConversation(), serializeGroupConversation(), serializePrivateMessage(), serializeRoomMessage(), canAccessPrivateMessageFile() (+25 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (19): buildEncryptedAttachmentMetadata(), canGenerateAttachmentPreview(), closePreviewSource(), createCanvasElement(), createLocalAttachmentPreviewUrl(), formatAttachmentSize(), getAttachmentCategory(), getScaledDimensions() (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.1
Nodes (22): serializeChannel(), serializeChannelPost(), serializeCommunity(), arrayIncludesId(), hasOwn(), idsEqual(), normalizeId(), buildDirectMessagePayload() (+14 more)

### Community 8 - "Community 8"
Cohesion: 0.17
Nodes (26): attachAuthContext(), authenticateToken(), buildCachedSession(), cacheSessionRecord(), clearSessionCookies(), createSession(), generateOpaqueToken(), getAuthFailure() (+18 more)

### Community 9 - "Community 9"
Cohesion: 0.2
Nodes (24): arrayBufferFromBase64(), base64FromArrayBuffer(), decryptPayload(), deleteDeviceKeyMaterial(), deleteDeviceSession(), deleteDeviceSessionsForDevice(), deleteRawRecord(), encryptPayload() (+16 more)

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (15): attachConnectionListeners(), connectToDatabase(), connectWithRetry(), getDatabaseStatus(), getMongoOptions(), getMongoUri(), isDatabaseReady(), sanitizeMongoUri() (+7 more)

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (17): buildColdPathMaterialHash(), buildCryptoProfileHash(), buildStableColdPathMaterial(), mergeNested(), normalizeCryptoProfile(), sha256Hex(), buildTransparencyBundleHash(), buildTransparencyCheckpoint() (+9 more)

### Community 12 - "Community 12"
Cohesion: 0.22
Nodes (11): AppError, errorHandler(), handleCastError(), handleDuplicateKeyError(), handleFileSizeError(), handleFileTypeError(), handleJWTError(), handleJWTExpiredError() (+3 more)

### Community 13 - "Community 13"
Cohesion: 0.27
Nodes (13): auditLog(), log2FADisable(), log2FAEnable(), logDeviceAdded(), logDeviceRemoved(), logLogin(), logLogout(), logMessageDelete() (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.2
Nodes (8): canPreview(), generateSafeFilename(), getFileCategory(), getFileExtension(), getFileIcon(), getPreviewableTypes(), isDocument(), sanitizeFilename()

### Community 16 - "Community 16"
Cohesion: 0.17
Nodes (6): Avatar(), Badge(), Button(), ChatBubble(), StealthVaultToggle(), cn()

### Community 17 - "Community 17"
Cohesion: 0.36
Nodes (9): canUseServiceWorker(), clearServerPushSubscription(), disablePushNotifications(), getExistingSubscription(), getPushStatus(), registerServiceWorker(), supportsPushNotifications(), syncPushSubscription() (+1 more)

### Community 18 - "Community 18"
Cohesion: 0.29
Nodes (10): cleanupAndRespond(), cleanupUploadedFile(), fileFilter(), getAllowedUploadMimeTypes(), isEncryptedUpload(), isLikelyPlainText(), isUploadMimeAllowed(), matchesSignature() (+2 more)

### Community 19 - "Community 19"
Cohesion: 0.38
Nodes (10): arrayBufferFromBase64(), base64FromArrayBuffer(), base64FromBytes(), bytesFromBase64(), decapsulatePostQuantumSharedSecret(), encapsulatePostQuantumSharedSecret(), generatePostQuantumKemKeyPair(), generatePostQuantumSignatureKeyPair() (+2 more)

### Community 20 - "Community 20"
Cohesion: 0.27
Nodes (5): AuthProvider(), buildSignedOutEncryptionState(), classifyBootstrapError(), createRuntimeIssue(), getEncryptionIssue()

### Community 21 - "Community 21"
Cohesion: 0.36
Nodes (4): emitSocketEvent(), encodeSocketPayload(), packSocketPayload(), shouldPackSocketEvent()

### Community 22 - "Community 22"
Cohesion: 0.48
Nodes (5): canUseBrowserStorage(), generateDeviceId(), getCurrentDeviceSnapshot(), getOrCreateDeviceId(), matchLabel()

### Community 24 - "Community 24"
Cohesion: 0.67
Nodes (6): getEnvelopeDeviceIds(), getPayloadMetadata(), getProtocolVersion(), getSenderDeviceId(), parseEncryptedPayload(), validateDeviceBoundPayload()

### Community 25 - "Community 25"
Cohesion: 0.33
Nodes (1): ErrorBoundary

### Community 26 - "Community 26"
Cohesion: 0.67
Nodes (5): normalizeCounter(), normalizeDirectSessionState(), normalizeReceivedCounters(), registerReceivedDirectSessionCounter(), validateIncomingDirectSessionCounter()

### Community 27 - "Community 27"
Cohesion: 0.67
Nodes (5): createClientEnv(), findAvailablePort(), isPortAvailable(), normalizePort(), run()

### Community 28 - "Community 28"
Cohesion: 0.6
Nodes (5): getWaitOptions(), parsePositiveInt(), requestOnce(), sleep(), waitForBackend()

### Community 29 - "Community 29"
Cohesion: 0.53
Nodes (3): loadUserByIdentifier(), normalizeEmail(), normalizeIdentifier()

### Community 31 - "Community 31"
Cohesion: 0.8
Nodes (4): createImage(), getCroppedImg(), getRadianAngle(), rotateSize()

### Community 32 - "Community 32"
Cohesion: 0.7
Nodes (4): emitToDeviceRooms(), normalizeDeviceIds(), normalizeUserIds(), resolveAuthorizedDeviceIds()

### Community 33 - "Community 33"
Cohesion: 0.67
Nodes (2): putInCache(), shouldCacheResponse()

### Community 37 - "Community 37"
Cohesion: 0.67
Nodes (2): enqueueBackgroundJob(), runNextJob()

### Community 38 - "Community 38"
Cohesion: 0.83
Nodes (3): findExistingPrivateMessage(), findExistingRoomMessage(), normalizeTempId()

### Community 39 - "Community 39"
Cohesion: 0.83
Nodes (3): detachPrivateReplyThread(), detachReplyThread(), detachRoomReplyThread()

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (2): idsEqual(), normalizeId()

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (2): normalizeIdentifier(), normalizeOptionalEmail()

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (2): buildPrivateParticipantHash(), normalizePrivateParticipantIds()

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (2): normalizeForwardedFrom(), normalizeString()

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (2): normalizeText(), resolveStoredTextContent()

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (2): buildUniqueSlug(), slugifyValue()

### Community 50 - "Community 50"
Cohesion: 0.67
Nodes (3): VaaniArc App Icon, Chat Bubble Icon, Gradient Background Design

### Community 89 - "Community 89"
Cohesion: 1.0
Nodes (1): Maskable App Icon

### Community 90 - "Community 90"
Cohesion: 1.0
Nodes (1): React Logo Icon

## Knowledge Gaps
- **23 isolated node(s):** `Railway Hosting Deployment`, `Socket.IO with Redis Adapter`, `React 18 and Vite Frontend`, `Post-Quantum E2EE`, `System Workflow Diagram` (+18 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 25`** (6 nodes): `ErrorBoundary.jsx`, `ErrorBoundary`, `.componentDidCatch()`, `.constructor()`, `.getDerivedStateFromError()`, `.render()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (4 nodes): `sw.js`, `putInCache()`, `shouldBypassCaching()`, `shouldCacheResponse()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (4 nodes): `enqueueBackgroundJob()`, `getBackgroundJobStatus()`, `runNextJob()`, `backgroundJobs.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (3 nodes): `identity.js`, `idsEqual()`, `normalizeId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (3 nodes): `normalizeIdentifier()`, `normalizeOptionalEmail()`, `auth.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (3 nodes): `buildPrivateParticipantHash()`, `normalizePrivateParticipantIds()`, `chatParticipants.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (3 nodes): `normalizeForwardedFrom()`, `normalizeString()`, `forwardedMessage.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (3 nodes): `normalizeText()`, `resolveStoredTextContent()`, `secureMessaging.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (3 nodes): `slug.js`, `buildUniqueSlug()`, `slugifyValue()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 89`** (1 nodes): `Maskable App Icon`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 90`** (1 nodes): `React Logo Icon`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ApiService` connect `Community 0` to `Community 17`, `Community 4`, `Community 22`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Why does `normalizeId()` connect `Community 7` to `Community 3`, `Community 5`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `hasSocketsInRoom()` connect `Community 7` to `Community 4`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Are the 15 inferred relationships involving `useAuth()` (e.g. with `ProtectedRoute()` and `PublicOnlyRoute()`) actually correct?**
  _`useAuth()` has 15 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Railway Hosting Deployment`, `Socket.IO with Redis Adapter`, `React 18 and Vite Frontend` to the rest of the system?**
  _23 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._