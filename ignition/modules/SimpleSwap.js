const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const SimpleSwapModule = buildModule("SimpleSwapModule", (m) => {
  const simpleswap = m.contract("SimpleSwap");

  return { simpleswap };
});

module.exports = SimpleSwapModule;