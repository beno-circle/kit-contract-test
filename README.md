# kit-contract-testing

## Overview

This repository provides a Node.js test script for interacting with Circle's CCTP V2 protocol, specifically for bridging USDC tokens across supported test networks using a custom BridgingKit smart contract. The script demonstrates both the **permit** and **preapproval** flows for bridging, and includes utilities for balance checks, approvals, bridging, attestation retrieval, and minting on the destination chain.

## Features
- Bridge USDC between testnets (Sepolia, Base Sepolia, Avalanche Fuji)
- Supports both **permit** (EIP-2612 signature) and **preapproval** (ERC20 approve) flows
- Automated balance and allowance checks
- Dynamic gas estimation and error handling
- Attestation retrieval from Circle's Iris API
- Optional minting of USDC on the destination chain
- Modular utility functions for wallet, provider, and contract interactions

## Directory Structure
```
kit-contract-testing/
  abis/
    BridgingKitContract.json   # ABI for the custom bridging contract
    IERC20.json                # ABI for ERC20 token (USDC)
  config.js                    # Network and contract configuration
  index.js                     # Main test script
  package.json                 # Project metadata and dependencies
  utils.js                     # Utility functions for bridging flows
```

## Setup

### Prerequisites
- Node.js v14+
- NPM

### Installation
1. Clone the repository:
   ```sh
   git clone <repo-url>
   cd kit-contract-testing
   ```
2. Install dependencies:
   ```sh
   npm install
   ```

### Environment Variables
Create a `.env` file in the project root with the following variables:

```
PRIVATE_KEY=<>
SEPOLIA_RPC_URL=<>
BASE_SEPOLIA_RPC_URL=<>
AVALANCHE_RPC_URL=<>
```
- `PRIVATE_KEY`: Private key of the test wallet (ensure it has testnet ETH/AVAX and USDC)
- `SEPOLIA_RPC_URL`, `BASE_SEPOLIA_RPC_URL`, `AVALANCHE_RPC_URL`: RPC endpoints for each network

You can use `.env.sample` as a template if available.

## Usage

To run the bridge test script:
```sh
npm start
```
This will execute `index.js`, which:
- Initializes the wallet and network config
- Fetches initial balances
- Executes the selected bridge flow (permit or preapproval)
- Waits for attestation from Circle's Iris API
- (Optionally) Mints USDC on the destination chain
- Prints final balances

### Switching Flows
In `index.js`, set the `flow` variable to either `'permit'` or `'preapproval'`:
```js
const flow = 'permit'; // 'permit' || 'preapproval'
```
- **permit**: Uses EIP-2612 signature for gasless approval
- **preapproval**: Uses standard ERC20 `approve` before bridging

## Bridging Flows Explained

### Permit Flow
1. Generates an EIP-2612 permit signature for USDC approval
2. Calls the `bridgeWithPermit` function on the BridgingKit contract
3. Waits for transaction confirmation

### Preapproval Flow
1. Checks and, if needed, sends an ERC20 `approve` for USDC
2. Calls the `bridgeWithPreapproval` function on the BridgingKit contract
3. Waits for transaction confirmation

### Attestation & Minting
- After bridging, the script polls Circle's Iris API for an attestation
- (Optional) The attestation can be used to mint USDC on the destination chain by uncommenting the relevant lines in `index.js`

## ABIs
- `abis/BridgingKitContract.json`: ABI for the custom bridging contract, supporting `bridgeWithPermit`, `bridgeWithPreapproval`, and related methods
- `abis/IERC20.json`: Standard ERC20 ABI for USDC interactions

## Extending/Contributing
- Utility functions are in `utils.js` and can be extended for additional flows or networks
- Network and contract addresses are managed in `config.js`
- PRs and issues are welcome for improvements or bug fixes

## License

This project is provided for testing and demonstration purposes. See the source files for license details. 