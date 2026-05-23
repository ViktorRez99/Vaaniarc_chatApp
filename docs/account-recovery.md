# Social Account Recovery (Shamir's Secret Sharing)

In zero-trust, end-to-end encrypted environments, losing a device could mean losing your private keys permanently. VaaniArc solves this without weakening security by utilizing **Shamir's Secret Sharing Scheme (SSS)** for Social Recovery.

## 🏗️ System Architecture

VaaniArc implements the `RecoveryKit` system which splits Master Private Keys into mathematical shards. These shards are sent to trusted contacts (friends/family). Since mathematically `K` shards are needed, `K-1` shards yield absolutely zero information about the Master Key.

### Key Components

| Component | File / Location | Description |
| :--- | :--- | :--- |
| **RecoveryKit Model** | `server/models/RecoveryKit.js` | Defines the central escrow structure in MongoDB. It stores the exact setup logic, tracking exactly who are the trusted contacts required for recovery. |
| **Trusted Contacts** | `trustedContactSchema` | Contains the `userId`, `usernameSnapshot`, and `shareIndex` (the "X" value of the polynomial point). |
| **Shard Envelopes** | `shardEnvelopeSchema` | The VaaniArc backend acts strictly as an escrow. The `encryptedEnvelope` holds the shard, which has been encrypted with the specific trusted contact's public key beforehand. The server cannot access the shard. |
| **Auth Routes** | `server/routes/authRecovery.js` | Handles the endpoints to assemble and request authorization from trusted contacts for shard release. |

---

## 🧩 Shard Splitting & Distribution Flow

```mermaid
graph TD
    classDef user fill:#61DAFB,stroke:#333,stroke-width:2px,color:#000
    classDef server fill:#8CC84B,stroke:#333,stroke-width:2px,color:#000
    classDef friend fill:#FF9900,stroke:#333,stroke-width:2px,color:#000
    
    Master[Jaya's Master Key]:::user
    
    Split[Shamir's Formula<br>Split into 5 Shards]:::user
    Master --> Split
    
    Split --> S1([Shard 1]):::user
    Split --> S2([Shard 2]):::user
    Split --> S3([Shard 3]):::user
    
    NoteA[Jaya's App Encrypts each Shard with the specific Friend's Public Key]:::user
    S1 -.-> NoteA
    S2 -.-> NoteA
    S3 -.-> NoteA
    
    NoteA --> E1[(Encrypted Envelope 1)]:::server
    NoteA --> E2[(Encrypted Envelope 2)]:::server
    NoteA --> E3[(Encrypted Envelope 3)]:::server
    
    E1 --> Server["VaaniArc Server (MongoDB RecoveryKit)"]:::server
    E2 --> Server
    E3 --> Server
```

## 🔄 The Recovery Procedure

When Jaya gets a new phone and needs her keys, she initiates a recovery mechanism.

1. **Initiation:** Jaya requests Account Recovery via the UI.
2. **Notification:** The `authRecovery.js` route pushes notifications to Jaya's active Trusted Contacts (Friends).
3. **Approval:** A Trusted Contact opens their VaaniArc app, which fetches an `encryptedEnvelope` from the `RecoveryKit`.
4. **Decryption:** The friend's device uses their *personal private key* to decrypt the envelope, exposing Jaya's Shard.
5. **Transport:** The friend securely passes this Shard back to Jaya (over a secure E2EE channel).
6. **Interpolation:** Once Jaya has `K` (the threshold number of) Shards, her client runs Lagrange Interpolation. The original Master Key is re-synthesized instantly.

```mermaid
sequenceDiagram
    autonumber
    
    actor New as Jaya (New Phone)
    participant GW as VaaniArc Server
    actor Rudrashis as Rudrashis (Trusted Friend)
    actor Ankur as Ankur (Trusted Friend)

    New->>GW: "I lost my phone, initiate Social Recovery"
    GW->>Rudrashis: Push Notification: "Jaya needs help!"
    GW->>Ankur: Push Notification: "Jaya needs help!"
    
    Note over Rudrashis: Rudrashis Approves
    Rudrashis->>GW: Request my encrypted shard for Jaya
    GW-->>Rudrashis: Returns Encrypted Envelope
    Rudrashis->>Rudrashis: Decrypts envelope using Rudrashis's Private Key
    Rudrashis->>GW: Sends raw Shard to Jaya over secure socket
    
    Note over Ankur: Ankur Approves
    Ankur->>GW: Request my encrypted shard for Jaya
    GW-->>Ankur: Returns Encrypted Envelope
    Ankur->>Ankur: Decrypts envelope using Ankur's Private Key
    Ankur->>GW: Sends raw Shard to Jaya over secure socket
    
    GW-->>New: Deliver Shard 1 + Shard 2
    
    Note over New: Local Mathematical Recreation
    New->>New: Shamir Lagrange Interpolation (x,y points)
    New->>New: Re-derive Master Private Key
    New-->>New: Access Restored!
```
