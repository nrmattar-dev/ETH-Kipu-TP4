
//I set the address of SimpleSwap on Sepolia
const contractAddress = "0xf454a45Fec441C3751D3bB335dCf5cC2eC9B88fa";
//I define the ABIs of the functions I’m going to use
const abi = [
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function getPrice(address tokenA, address tokenB) public view returns (uint price)"
];

//I set the addresses of the Tokens
const THURISAZ = "0x2966F7783663538a1265B44d4956E2e016Fc83c6";
const URUZ = "0x29e740c900e173EAA854818343edd9b4bE75fd41";

let provider;
let signer;
let contract;

//It will only operate once the entire page has finished loading.
document.addEventListener("DOMContentLoaded", () => {

  document.getElementById("connectButton").addEventListener("click", async () => {
    if (typeof window.ethereum !== "undefined") {
      try {
        //Since I'm using version 6.15.0 of ethers, I had to change the names of some methods.
        //What I do is simply connect to the MetaMask wallet and throw an error if it doesn't have MetaMask.
        provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = await provider.getSigner();
        const address = await signer.getAddress();
        document.getElementById("walletAddress").textContent = `Conectado: ${address}`;
        contract = new ethers.Contract(contractAddress, abi, signer);
      } catch (error) {
        console.error("Error when connecting:", error);
        alert("Error connecting the wallet.");
        document.getElementById("walletAddress").textContent = "Not connected";
      }
    } else {
      alert("Install MetaMask to continue.");
    }
  });

  //With this function, I perform the token swap.
  async function executeSwap(tokenA, tokenB) {
    if (!contract) {
      alert("Connect the wallet first.");
      return;
    }
  
    const amountInValue = document.getElementById("amountIn").value;
    const amountOutMinValue = document.getElementById("amountOutMin").value;
  
    if (!amountInValue || !amountOutMinValue) {
      alert("Complete both quantity fields.");
      return;
    }
  
    try {
      const amountIn = ethers.parseUnits(amountInValue, 18);
      const amountOutMin = ethers.parseUnits(amountOutMinValue, 18);
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const path = [tokenA, tokenB];
      const to = await signer.getAddress();
  
      //I do this mainly to fetch balances and later display how they change in a grid.
      const erc20Abi = ["function balanceOf(address) view returns (uint)"];
      const tokenAContract = new ethers.Contract(tokenA, erc20Abi, provider);
      const tokenBContract = new ethers.Contract(tokenB, erc20Abi, provider);
  
      // balances before
      const balanceA_Before = await tokenAContract.balanceOf(to);
      const balanceB_Before = await tokenBContract.balanceOf(to);
  
      // Swap execution
      const tx = await contract.swapExactTokensForTokens(amountIn, amountOutMin, path, to, deadline);
      await tx.wait();
  
      // balances after
      const balanceA_After = await tokenAContract.balanceOf(to);
      const balanceB_After = await tokenBContract.balanceOf(to);
  
      //I save it in the table.
      addSwapToHistory({
        date: new Date().toLocaleString(),
        tokenIn: tokenA === THURISAZ ? "Thurisaz" : "Uruz",
        tokenOut: tokenB === THURISAZ ? "Thurisaz" : "Uruz",
        balanceInBefore: ethers.formatUnits(balanceA_Before, 18),
        balanceOutBefore: ethers.formatUnits(balanceB_Before, 18),
        balanceInAfter: ethers.formatUnits(balanceA_After, 18),
        balanceOutAfter: ethers.formatUnits(balanceB_After, 18),
      });
  
      alert("Successful swap.");
    } catch (err) {
      console.error("Swap error:", err);
      alert("Error performing the swap. Check quantities, permissions, or rejections.");
    }
  }
  
  //I listen when you click swapThurisazToUruz
  document.getElementById("swapThurisazToUruz").addEventListener("click", () => {
    executeSwap(THURISAZ, URUZ);
  });

  //Same thing but in reverse
  document.getElementById("swapUruzToThurisaz").addEventListener("click", () => {
    executeSwap(URUZ, THURISAZ);
  });


  async function fetchPrice(base, quote, label) {
    if (!contract) {
      alert("Connect the wallet first.");
      return;
    }

    try {
      const price = await contract.getPrice(base, quote);
      const formatted = ethers.formatUnits(price, 18);
      document.getElementById("priceResult").textContent = `1 ${label} = ${formatted} ${label === "Thurisaz" ? "Uruz" : "Thurisaz"}`;
    } catch (err) {
      console.error("Error getting price:", err);
      alert("Price could not be obtained.");
    }
  }

  document.getElementById("priceThurisazInUruz").addEventListener("click", () => {
    fetchPrice(THURISAZ, URUZ, "Thurisaz");
  });

  document.getElementById("priceUruzInThurisaz").addEventListener("click", () => {
    fetchPrice(URUZ, THURISAZ, "Uruz");
  });

});

//I'm saving the info in the table
function addSwapToHistory({ date, tokenIn, tokenOut, balanceInBefore, balanceOutBefore, balanceInAfter, balanceOutAfter }) {
    const table = document.getElementById("historyTable").querySelector("tbody");
    const row = document.createElement("tr");
  
    row.innerHTML = `
      <td>${date}</td>
      <td>${tokenIn}</td>
      <td>${tokenOut}</td>
      <td>${balanceInBefore}</td>
      <td>${balanceOutBefore}</td>
      <td>${balanceInAfter}</td>
      <td>${balanceOutAfter}</td>
    `;
  
    table.prepend(row); 
  }
  