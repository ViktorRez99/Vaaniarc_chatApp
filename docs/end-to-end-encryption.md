# Post-Quantum End-to-End Encryption (PQ-E2EE)

VaaniArc implements a hybrid Key Encapsulation Mechanism (KEM) to protect data both now against classical computing and in the future against quantum-based attacks. 

## 🏗️ System Architecture

Our backend relies on robust Device-Aware models instead of User-Aware models. Each platform a user logs into holds completely unique `DeviceKeyMaterial`. 

### Key Components

| Component | File / Location | Description |
| :--- | :--- | :--- |
| **DeviceKeyMaterial** | `server/models/DeviceKeyMaterial.js` | Stores public keys (`encryptionPublicKey`, `signingPublicKey`) specifically bound to a `deviceId`. Includes cold path material and key hashes. |
| **KeyTransparency** | `server/utils/keyTransparency.js` | Uses stable JSON serialization and SHA-256 to hash the `keyBundle` structures. This prevents servers from maliciously injecting rogue keys without triggering an integrity alarm on clients. |
| **E2EE Payloads** | `server/utils/e2eePayloads.js` | Formats and validates that the raw ciphertext bytes being transmitted over the wire adhere strictly to the cryptographic framing requirements. |

---

## 🔒 The Hybrid KEM Flow (Classical + Post-Quantum)

To guarantee security against "Harvest Now, Decrypt Later" quantum attacks, VaaniArc blends standard Elliptic Curve Cryptography (X25519) with Post-Quantum Lattice algorithms (like ML-KEM).

```mermaid
graph TD
    %% Define Styles
    classDef classical fill:#fef08a,stroke:#ca8a04,stroke-width:2px,color:#000
    classDef quantum fill:#bfdbfe,stroke:#2563eb,stroke-width:2px,color:#000
    classDef hybrid fill:#bbf7d0,stroke:#16a34a,stroke-width:2px,color:#000
    classDef server fill:#e5e7eb,stroke:#4b5563,stroke-width:2px,color:#000
    
    %% Rudrashis Generation
    subgraph Rudrashis["Rudrashis's Device (Receiver)"]
        direction TB
        B1["1. Gen Classical Keypair (X25519)"]:::classical
        B2["2. Gen ML-KEM Keypair (Post-Quantum)"]:::quantum
        B1 --> B3["3. DeviceKeyMaterial Bundle"]
        B2 --> B3
    end
    
    %% Key Server
    subgraph KS["VaaniArc DB / Server"]
        K1[("4. Store Public Keys & Fingerprints")]:::server
    end
    
    Rudrashis -- Registers Setup/Keys --> KS
    
    %% Jaya Encapsulation
    subgraph Jaya["Jaya's Device (Sender)"]
        direction TB
        A1["5. Ask for Rudrashis's Public Keys"]:::server
        
        %% Classical path
        A2["6a. Ephemeral Classical Keypair"]:::classical
        A3["7a. ECDH Key Exchange"]:::classical
        A4["8a. Derived Classical Secret (ss1)"]:::classical
        
        %% PQC path
        A5["6b. Run PQC Encapsulation"]:::quantum
        A6["7b. ML-KEM Ciphertext & Secret (ss2)"]:::quantum
        
        A1 --> A2 & A5
        A2 --> A3 --> A4
        A5 --> A6
        
        %% KDF
        A4 --> A7["9. Key Derivation Function (HKDF)"]:::hybrid
        A6 --> A7
        A7 --> A8["10. Final Hybrid Secret Key"]:::hybrid
        
        A8 --> A9["11. AES/ChaCha20 Payload Encryption"]
    end
    
    KS -- Sends Public Keys --> Jaya
    Jaya -- "Sends Encrypted Envelope & PQC Ciphertext" --> Bob_Decap
    
    %% Rudrashis Decapsulation
    subgraph Bob_Decap["Rudrashis's Device (Receiver)"]
        direction TB
        D1["12. Receive Payload"]
        D2["13a. ECDH classical secret (ss1)"]:::classical
        D3["13b. ML-KEM Decapsulation (ss2)"]:::quantum
        
        D1 --> D2 & D3
        D2 --> D4["14. HKDF (ss1 + ss2)"]:::hybrid
        D3 --> D4 --> D5["15. Shared Hybrid Secret Key"]:::hybrid
        D5 --> D6["16. Read Data"]
    end
```

## 🔐 The "Send to Receive" User Journey

This visualizes exactly how user messages flow through the components when Jaya hits SEND.

```mermaid
sequenceDiagram
    autonumber
    
    actor Jaya as Jaya
    participant AppA as Jaya's App
    participant GW as VaaniArc Gateway (API/Sockets)
    participant DB as MongoDB
    participant AppB as Rudrashis's App
    actor Rudrashis as Rudrashis
    
    Note over AppB,DB: 1. Setup & Key Distribution
    AppB->>GW: POST /api/devices (Register Public Keys)
    GW->>DB: Save DeviceKeyMaterial

    Note over Jaya,GW: 2. Jaya Types Message
    Jaya->>AppA: Types "Hello Rudrashis!"
    
    AppA->>GW: Request Rudrashis's Device Keys
    GW->>DB: Fetch DeviceKeyMaterial
    DB-->>GW: Return public keys
    GW-->>AppA: Deliver keys + Transparency Hash
    
    Note over AppA: Performs Crypto Encapsulation
    AppA->>AppA: Generate Shared Secret & PQC Ciphertext
    AppA->>AppA: Encrypt "Hello Rudrashis!" with Shared Secret
    
    AppA->>GW: Socket.io `message:send` (Ciphertext + Encrypted Data)
    GW-->>AppA: Message ID + Idempotency Acknowledgment

    Note over GW,Rudrashis: 3. Delivery
    GW->>DB: Persist highly encrypted string (No plaintext)
    GW->>AppB: Socket.io `message:new`
    
    Note over AppB: Device unseals the data
    AppB->>AppB: Decapsulate using Private Keys
    AppB->>AppB: Decrypt Payload
    AppB->>Rudrashis: Displays "Hello Rudrashis!" on UI
```
