# UX Architecture, User Flows, & Screen Specifications

## 1. Organization Scheme
Pulse utilizes a **Hybrid Organization Scheme** combining **Audience-Oriented** and **Task-Oriented** structures:
- **Audience-Oriented Separation:** Isolates the authenticated **Asset Owner** workspace (`/vault`, `/vault/create`) from the unauthenticated, read-only **Public / Beneficiary Verifier** (`/verify`), ensuring zero clutter and strict access boundaries.
- **Task-Oriented Workspace:** Within the owner's view, the application functions as a focused financial utility structured around sequential actions: *Sign In & Bind Wallet -> Set Token & Cap -> Set Timer & Beneficiaries -> Approve & Activate Guard -> Heartbeat Ping*.

---

## 2. Sitemap

- **Pulse Web App**
  - `/` (Landing & Auth Gate: Google Sign-In + Connect Wallet)
  - `/vault` (Authenticated Owner Workspace)
    - Active Dashboard (Countdown Timer, "I'm Alive" Ping, Revoke Guard)
    - `/vault/create` (Setup Guard Wizard)
      - Step 1: Select Token & Spending Cap
      - Step 2: Set Inactivity Timer ($\ge 60$ Days)
      - Step 3: Add Beneficiaries & Allocations (Auto-Remainder to Last Heir)
      - Step 4: Approve ERC-20 & Initialize Guard
  - `/verify` (Public Read-Only Vault Verifier)
    - `/verify/[ownerAddress]` (Public Timer Status & Chainlink Upkeep Health)

---

## 3. Core Task Flow: Setup Inheritance Guard (`setupGuard`)

1. **User Action:** Sign in via Google Auth and connect Web3 wallet.
2. **Process:** System verifies network (Base Sepolia) and checks on-chain contract for an existing active guard.
3. **Decision:** *Does an active guard already exist?*
   - **Yes:** Redirect to Active Owner Dashboard (`/vault`).
   - **No:** Proceed to Setup Guard Wizard (`/vault/create`).
4. **User Action:** Select ERC-20 token (USDC) and input Spending Cap.
5. **User Action:** Set Inactivity Timer (in days) and input Beneficiary wallet addresses (`0x...`) + percentage shares.
6. **Decision:** *Is Timer $\ge 60$ days AND each beneficiary share $\ge 1\%$ AND total shares $\le 100\%$?*
   - **No:** Display actionable form validation error; user fixes input.
   - **Yes:** If total shares $< 100\%$ (e.g., $33\% \times 3 = 99\%$), system automatically assigns the remaining $1\%$ to the last beneficiary so total $= 100\%$ ($10,000$ BPS).
7. **User Action:** Click "1. Approve USDC" and sign ERC-20 `approve()` in wallet.
8. **Decision:** *Approval transaction confirmed on-chain?*
   - **No:** Show error banner with `[Try Again]`; remain on step.
   - **Yes:** Unlock Step 2 button.
9. **User Action:** Review summary and click "2. Initialize Guard" (`setupGuard`).
10. **Decision:** *Setup transaction confirmed on-chain?*
    - **No:** Show transaction reverted/rejected alert with `[Try Again]`.
    - **Yes:** Transition to Active Owner Dashboard (`/vault`) with live countdown running.

---

## 4. Screen Inventory

| Screen ID | Screen Name | Route | Purpose | Main Action |
| :--- | :--- | :--- | :--- | :--- |
| **S-01** | Landing & Auth Gate | `/` | Authenticate via Google Auth and bind Web3 wallet | Sign In & Connect Wallet |
| **S-02** | Setup Guard Wizard | `/vault/create` | Configure cap, timer ($\ge 60$d), and heir shares | Approve Token & Initialize Guard |
| **S-03** | Transaction Modal | Overlay | Display wallet signature prompts and block confirmation status | Confirm / Retry Transaction |
| **S-04** | Active Owner Dashboard | `/vault` | Monitor countdown timer, reset heartbeat, or revoke guard | Click "I'M ALIVE (Reset Timer)" |
| **S-05** | Public Vault Verifier | `/verify` | Allow public/heirs to verify timer status without a wallet | Search Owner `0x` Address |

---

## 5. Screen Specifications & System States

### S-02: Setup Guard Wizard (`/vault/create`)
- **Goal:** Configure inheritance rules accurately and authorize non-custodial token allowance.
- **Inputs:** Token selection (USDC), Spending Cap (numeric), Inactivity Timeout (days, min 60), Beneficiary rows (`0x` address + `%` share).
- **Components:** Input/Form, Dropdown, Dynamic Beneficiary List, Auto-Remainder Badge, Primary Action Buttons.
- **System States:**
  - `Default`: Clean form with expected format hints (`0x...`, `Min 60 days`).
  - `Loading`: Checking wallet token balance and existing ERC-20 allowance via RPC.
  - `Success`: Valid inputs; remainder automatically added to final beneficiary (`Total: 100%`).
  - `Error`: Red input border with actionable message (`"Timer must be at least 60 days"` or `"Invalid 0x wallet format"`).
  - `Empty`: No beneficiary rows added yet.

### S-03: Transaction Confirmation Modal (Overlay)
- **Goal:** Guide the user through the two-step Web3 signature flow (`approve` and `setupGuard`).
- **Components:** Modal Dialog, Spinner, Status Badge, Block Explorer Link, Retry Button.
- **System States:**
  - `Default`: Summary of gas estimate and parameters awaiting wallet signature.
  - `Loading`: `"Waiting for block confirmation on Base Network..."`
  - `Success`: `"✓ Transaction confirmed. Guard is now active."`
  - `Error`: `"Signature rejected or transaction reverted. [Try Again]"`

### S-04: Active Owner Dashboard (`/vault`)
- **Goal:** Provide one-click heartbeat reset and transparent status monitoring.
- **Components:** Status Pill (`🟢 Guard Active`), Live Monospace Countdown Timer, Primary CTA Button (`I'M ALIVE`), Beneficiary Summary Card, Destructive Modal Trigger (`Revoke Guard`).
- **System States:**
  - `Default`: Countdown ticking down normally; wallet balance $\ge$ spending cap.
  - `Loading`: Submitting `ping()` transaction or syncing latest `lastPingTimestamp`.
  - `Success`: `"✓ Heartbeat recorded. Timer reset to 60 days."`
  - `Error`: Warning banner if owner's wallet USDC balance drops below the approved spending cap.

### S-05: Public Vault Verifier (`/verify`)
- **Goal:** Read-only status lookup by owner wallet address.
- **Components:** Search Input (`0x...`), Verification Result Card, Chainlink Status Badge.
- **System States:**
  - `Default`: Empty search bar prompting for an owner `0x` address.
  - `Loading`: Querying smart contract view function.
  - `Success`: Displays active status and remaining time (hides token balances for privacy).
  - `Empty / Not Found`: `"No active inheritance guard found for this address."`