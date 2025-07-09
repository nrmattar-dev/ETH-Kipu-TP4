# SimpleSwap
Practical Work No. 4 (ETH Kipu) by Nahuel Ruiz Mattar

SimpleSwap is a decentralized application (DApp) that allows users to exchange two ERC-20 tokens, Thurisaz and Uruz, on a blockchain network. The application provides a simple user interface to connect wallets, perform swaps, and check prices, in addition to maintaining a transaction history.

## Features

- **Wallet Connection**: Connect your Ethereum-compatible wallet (e.g., MetaMask) to interact with the DApp.
- **Token Swaps**:
  - Swap Thurisaz for Uruz.
  - Swap Uruz for Thurisaz.
  - Define a minimum amount to receive to protect against price volatility.
- **Price Inquiry**: Get the current price of 1 Thurisaz in Uruz and vice versa.
- **Swap History**: View a detailed record of your exchange transactions, including balances before and after the swap.
- **Intuitive User Interface**: A clean and easy-to-use design for a smooth user experience.

## Project Structure

The repository is organized as follows:
.
├── contracts/
│ ├── SimpleSwap.sol # Main exchange contract
│ ├── Thurisaz.sol # Thurisaz token contract (example)
│ └── Uruz.sol # Uruz token contract (example)
├── frontend/
│ ├── public/
│ │ └── index.html # Main HTML file for the user interface
│ ├── src/
│ │ ├── css/
│ │ │ └── style.css # Application CSS styles
│ │ └── js/
│ │ └── main.js # Frontend JavaScript logic
│ └── package.json # Node.js dependencies for the frontend (if applicable)
├── ignition/ # Hardhat Ignition deployment scripts
├── node_modules/ # Node.js dependencies
├── test/ # Smart contract tests
├── .env # Environment variables
├── .gitignore # Files and folders to be ignored by Git
├── hardhat.config.js # Hardhat configuration
├── package.json # Node.js dependencies for the overall project (Hardhat, etc.)
├── package-lock.json # Dependency version lock
└── README.md # This file

## Technologies Used

**Frontend:**
- HTML5
- CSS3
- JavaScript
- Ethers.js (for blockchain interaction)

**Smart Contracts:**
- Solidity

**Blockchain Development:**
- Hardhat (Ethereum development environment)
- Hardhat Ignition (for contract deployment)
