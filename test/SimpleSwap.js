const { expect } = require("chai");
const { ethers } = require("hardhat");

//This is the square root function I used in the contract, so I'm bringing it here for consistency
function sqrtBigInt(n) {
    if (n < 0n) throw new Error('sqrtBigInt only works for non-negative numbers');
    if (n === 0n || n === 1n) return n;
    let x = n;
    let y = (n + 1n) / 2n; // Aproximación inicial
    while (y < x) {
        x = y;
        y = (n / x + x) / 2n;
    }
    return y;
}

describe("SimpleSwap", function () {
    let SimpleSwap;
    let simpleSwap;
    let owner;
    let addr1;
    let addr2;
    let thurisaz;
    let uruz;
    let Thurisaz;
    let Uruz;

    const parseUnits = ethers.parseUnits;
    const formatUnits = ethers.formatUnits;

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();

        // Deploy Thurisaz
        Thurisaz = await ethers.getContractFactory("Thurisaz", owner);
        thurisaz = await Thurisaz.deploy();
        await thurisaz.waitForDeployment();

        // Deploy Uruz
        Uruz = await ethers.getContractFactory("Uruz", owner);
        uruz = await Uruz.deploy();
        await uruz.waitForDeployment();

        // Deploy SimpleSwap contract
        SimpleSwap = await ethers.getContractFactory("SimpleSwap", owner);
        simpleSwap = await SimpleSwap.deploy();
        await simpleSwap.waitForDeployment();

        // Mint some tokens to owner and addr1
        await thurisaz.mint(owner.address, parseUnits("1000", 18));
        await uruz.mint(owner.address, parseUnits("1000", 18));
        await thurisaz.mint(addr1.address, parseUnits("500", 18));
        await uruz.mint(addr1.address, parseUnits("500", 18));
    });

    describe("addLiquidity", function () {
        it("Should add initial liquidity and mint LTK tokens", async function () {
            const amountA = parseUnits("100", 18);
            const amountB = parseUnits("200", 18);
            const deadline = Math.floor(Date.now() / 1000) + 60 * 10; // 10 minutes from now

            // Approve SimpleSwap to spend tokens
            await thurisaz.approve(simpleSwap.target, amountA);
            await uruz.approve(simpleSwap.target, amountB);

            const expectedLtkMinted = sqrtBigInt(amountA * amountB);

            // I wait for the event to be written to know that it has ended
            await expect(simpleSwap.addLiquidity(
                thurisaz.target,
                uruz.target,
                amountA,
                amountB,
                amountA,
                amountB,
                owner.address,
                deadline
            )).to.emit(simpleSwap, "LiquidityAdded")
              .withArgs(owner.address, owner.address, thurisaz.target, uruz.target, amountA, amountB, expectedLtkMinted); 

            const liquidityTokenSupply = await simpleSwap.totalSupply();
            // Expect the value of liquidityTokenSupply to be strictly greater than zero.
            expect(liquidityTokenSupply).to.be.gt(0);
            // Expect the liquidity token balance of the person who contributed liquidity to the pool to be greater than 0
            expect(await simpleSwap.balanceOf(owner.address)).to.be.gt(0);
            // Check reserves
            expect(await simpleSwap.reserve(thurisaz.target, uruz.target)).to.equal(amountA);
            expect(await simpleSwap.reserve(uruz.target, thurisaz.target)).to.equal(amountB);
        });

        it("Should add liquidity to an existing pool proportionally", async function () {
            // Add initial liquidity
            const initialAmountA = parseUnits("100", 18);
            const initialAmountB = parseUnits("200", 18);
            const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

            await thurisaz.approve(simpleSwap.target, initialAmountA);
            await uruz.approve(simpleSwap.target, initialAmountB);
            await simpleSwap.addLiquidity(thurisaz.target, uruz.target, initialAmountA, initialAmountB, initialAmountA, initialAmountB, owner.address, deadline);

            // Add more liquidity
            const addAmountA = parseUnits("50", 18);
            const addAmountB = parseUnits("100", 18); // Proportional to initial (1:2 ratio)

            await thurisaz.approve(simpleSwap.target, addAmountA);
            await uruz.approve(simpleSwap.target, addAmountB);

            const initialLTKSupply = await simpleSwap.totalSupply();
            const initialOwnerLTKBalance = await simpleSwap.balanceOf(owner.address);

            await expect(simpleSwap.addLiquidity(
                thurisaz.target,
                uruz.target,
                addAmountA,
                addAmountB,
                0, // Min amounts can be 0 for simplicity in this test
                0,
                owner.address,
                deadline
            )).to.emit(simpleSwap, "LiquidityAdded");

            // Check if LTK tokens were minted proportionally
            const finalLTKSupply = await simpleSwap.totalSupply();
            const finalOwnerLTKBalance = await simpleSwap.balanceOf(owner.address);

            expect(finalLTKSupply).to.be.gt(initialLTKSupply);
            expect(finalOwnerLTKBalance).to.be.gt(initialOwnerLTKBalance);

            // Check updated reserves
            expect(await simpleSwap.reserve(thurisaz.target, uruz.target)).to.equal(initialAmountA + addAmountA);
            expect(await simpleSwap.reserve(uruz.target, thurisaz.target)).to.equal(initialAmountB + addAmountB);
        });

        it("Should revert if deadline is exceeded", async function () {
            const amountA = parseUnits("100", 18);
            const amountB = parseUnits("200", 18);
            const deadline = Math.floor(Date.now() / 1000) - 10; // 10 seconds in the past

            await thurisaz.approve(simpleSwap.target, amountA);
            await uruz.approve(simpleSwap.target, amountB);

            await expect(simpleSwap.addLiquidity(
                thurisaz.target,
                uruz.target,
                amountA,
                amountB,
                amountA,
                amountB,
                owner.address,
                deadline
            )).to.be.revertedWith("Transaction expired");
        });

        it("Should revert if amountADesired is too low", async function () {
            const amountA = parseUnits("100", 18);
            const amountB = parseUnits("200", 18);
            const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

            await thurisaz.approve(simpleSwap.target, amountA);
            await uruz.approve(simpleSwap.target, amountB);

            await expect(simpleSwap.addLiquidity(
                thurisaz.target,
                uruz.target,
                amountA,
                amountB,
                amountA + BigInt(1), // amountAMin > amountADesired
                amountB,
                owner.address,
                deadline
            )).to.be.revertedWith("amountADesired too low");
        });

        it("Should revert if amountBDesired is too low", async function () {
            const amountA = parseUnits("100", 18);
            const amountB = parseUnits("200", 18);
            const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

            await thurisaz.approve(simpleSwap.target, amountA);
            await uruz.approve(simpleSwap.target, amountB);

            await expect(simpleSwap.addLiquidity(
                thurisaz.target,
                uruz.target,
                amountA,
                amountB,
                amountA,
                amountB + BigInt(1), // amountBMin > amountBDesired
                owner.address,
                deadline
            )).to.be.revertedWith("amountBDesired too low");
        });

        it("Should revert if amounts do not meet constraints for existing pool", async function () {
            // Add initial liquidity
            const initialAmountA = parseUnits("100", 18);
            const initialAmountB = parseUnits("200", 18);
            const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

            await thurisaz.approve(simpleSwap.target, initialAmountA);
            await uruz.approve(simpleSwap.target, initialAmountB);
            await simpleSwap.addLiquidity(thurisaz.target, uruz.target, initialAmountA, initialAmountB, initialAmountA, initialAmountB, owner.address, deadline);

            // It will try to add liquidity with amounts that don't match ratio and min constraints
            const addAmountA = parseUnits("10", 18);
            const addAmountB = parseUnits("50", 18); // Disproportionate, and will fail checks

            await thurisaz.approve(simpleSwap.target, addAmountA);
            await uruz.approve(simpleSwap.target, addAmountB);

            await expect(simpleSwap.addLiquidity(
                thurisaz.target,
                uruz.target,
                addAmountA,
                addAmountB,
                addAmountA,
                addAmountB,
                owner.address,
                deadline
            )).to.be.revertedWith("Amounts do not meet constraints");
        });
    });

    describe("removeLiquidity", function () {
        beforeEach(async function () {
            // Add initial liquidity for testing removal
            const amountA = parseUnits("100", 18);
            const amountB = parseUnits("200", 18);
            const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

            await thurisaz.approve(simpleSwap.target, amountA);
            await uruz.approve(simpleSwap.target, amountB);
            await simpleSwap.addLiquidity(thurisaz.target, uruz.target, amountA, amountB, amountA, amountB, owner.address, deadline);
        });

        it("Should remove liquidity and return tokens", async function () {
            const liquidityToRemove = await simpleSwap.balanceOf(owner.address);
            const ownerThurisazBalanceBefore = await thurisaz.balanceOf(owner.address);
            const ownerUruzBalanceBefore = await uruz.balanceOf(owner.address);

            const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

            await expect(simpleSwap.removeLiquidity(
                thurisaz.target,
                uruz.target,
                liquidityToRemove,
                0, // minAmountA
                0, // minAmountB
                owner.address,
                deadline
            )).to.emit(simpleSwap, "LiquidityRemoved");

            // Check if LTK tokens were burned
            expect(await simpleSwap.balanceOf(owner.address)).to.equal(0);
            expect(await simpleSwap.totalSupply()).to.equal(0); // If all liquidity removed

            // Check if tokens were returned
            expect(await thurisaz.balanceOf(owner.address)).to.be.gt(ownerThurisazBalanceBefore);
            expect(await uruz.balanceOf(owner.address)).to.be.gt(ownerUruzBalanceBefore);

            // Check if reserves are updated
            expect(await simpleSwap.reserve(thurisaz.target, uruz.target)).to.equal(0);
            expect(await simpleSwap.reserve(uruz.target, thurisaz.target)).to.equal(0);
        });

        it("Should revert if zero liquidity is provided", async function () {
            const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
            await expect(simpleSwap.removeLiquidity(
                thurisaz.target,
                uruz.target,
                0,
                0,
                0,
                owner.address,
                deadline
            )).to.be.revertedWith("Zero liquidity");
        });

        it("Should revert if amountA received is too low", async function () {
            const liquidityToRemove = await simpleSwap.balanceOf(owner.address);
            const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

            // Try to remove liquidity with a minAmountA higher than what will be returned
            await expect(simpleSwap.removeLiquidity(
                thurisaz.target,
                uruz.target,
                liquidityToRemove,
                parseUnits("10000", 18), // Unreasonably high minAmountA
                0,
                owner.address,
                deadline
            )).to.be.revertedWith("amountA too low");
        });

        it("Should revert if amountB received is too low", async function () {
            const liquidityToRemove = await simpleSwap.balanceOf(owner.address);
            const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

            await expect(simpleSwap.removeLiquidity(
                thurisaz.target,
                uruz.target,
                liquidityToRemove,
                0, // Set to 0 to not trigger amountA too low
                parseUnits("10000", 18), // Unreasonably high minAmountB
                owner.address,
                deadline
            )).to.be.revertedWith("amountB too low");
        });

        it("Should revert if deadline is exceeded", async function () {
            const liquidityToRemove = await simpleSwap.balanceOf(owner.address);
            const deadline = Math.floor(Date.now() / 1000) - 10; // 10 seconds in the past

            await expect(simpleSwap.removeLiquidity(
                thurisaz.target,
                uruz.target,
                liquidityToRemove,
                0,
                0,
                owner.address,
                deadline
            )).to.be.revertedWith("Transaction expired");
        });
    });

    describe("swapExactTokensForTokens", function () {
        beforeEach(async function () {
            // Add initial liquidity for testing swaps
            const amountA = parseUnits("100", 18);
            const amountB = parseUnits("200", 18);
            const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

            await uruz.approve(simpleSwap.target, amountA);
            await thurisaz.approve(simpleSwap.target, amountB);
            await simpleSwap.addLiquidity(uruz.target, thurisaz.target, amountA, amountB, amountA, amountB, owner.address, deadline);
        });
            
        //Since I need to test what happens when multiple swaps are performed, I encapsulate it in a single function
        async function performAndVerifySwap(
            tokenInContract,
            tokenOutContract,
            swapAmountIn,
            recipient
        ) {
            const reserveIn = await simpleSwap.reserve(tokenInContract.target, tokenOutContract.target);
            const reserveOut = await simpleSwap.reserve(tokenOutContract.target, tokenInContract.target);

            const expectedAmountOut = (swapAmountIn * reserveOut) / (reserveIn + swapAmountIn);

            const amountOutMin = expectedAmountOut - (expectedAmountOut / BigInt(1000)); // 0.1% slippage tolerance

            const path = [tokenInContract.target, tokenOutContract.target];
            const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
            const tokenInName = (tokenInContract.target === thurisaz.target) ? "Thurisaz" : "Uruz";
            const tokenOutName = (tokenOutContract.target === thurisaz.target) ? "Thurisaz" : "Uruz";
            
            //Just some logs to check the values ​​it is taking
            /*
            console.log(`--- Swap de ${tokenInName} a ${tokenOutName} ---`);
            console.log("swapAmountIn:", swapAmountIn.toString());
            console.log("reserveIn:", reserveIn.toString());
            console.log("reserveOut:", reserveOut.toString());
            console.log("expectedAmountOut (Test Calc):", expectedAmountOut.toString());
            console.log("amountOutMin:", amountOutMin.toString());
            */
            const ownerTokenInBalanceBefore = await tokenInContract.balanceOf(recipient);
            const ownerTokenOutBalanceBefore = await tokenOutContract.balanceOf(recipient);
            const contractTokenOutBalanceBefore = await tokenOutContract.balanceOf(simpleSwap.target);

            await tokenInContract.approve(simpleSwap.target, swapAmountIn);

            //Run a simulation of the contract because I was interested in seeing what values ​​it was returning
            const simulatedAmounts = await simpleSwap.getFunction("swapExactTokensForTokens").staticCall(
                swapAmountIn,
                amountOutMin,
                path,
                recipient,
                deadline
            );

            // The second element of 'amounts' is the amountOut
            const actualAmountOutFromContract = simulatedAmounts[1];
            //console.log("actualAmountOutFromContract (simulación del contrato):", actualAmountOutFromContract.toString());

            // Check that the actual amount of tokens received is at least the minimum expected
            expect(actualAmountOutFromContract).to.be.gte(amountOutMin);
            // Check that the actual amount received is close to the expected amount, allowing a small difference of up to 1000 units (to account for rounding or slippage)
            expect(actualAmountOutFromContract).to.be.closeTo(expectedAmountOut, 1000n);

            // Execute the actual transaction
            const tx = await simpleSwap.swapExactTokensForTokens(
                swapAmountIn,
                amountOutMin,
                path,
                recipient,
                deadline
            );

            await expect(tx).to.emit(simpleSwap, "SwapExecuted");

            const ownerTokenInBalanceAfter = await tokenInContract.balanceOf(recipient);
            const ownerTokenOutBalanceAfter = await tokenOutContract.balanceOf(recipient);
            const contractTokenOutBalanceAfter = await tokenOutContract.balanceOf(simpleSwap.target);

            // Final balance assertions (which should pass if the actualAmountOutFromContract is correct)
            expect(ownerTokenInBalanceAfter).to.equal(ownerTokenInBalanceBefore - swapAmountIn);
            // actualAmountOutFromContract is used for the balance assertion to be accurate with what the contract *said* it was going to do
            expect(ownerTokenOutBalanceAfter).to.equal(ownerTokenOutBalanceBefore + actualAmountOutFromContract);
            // The contract reserve should have decreased by the current AmountOutFromContract
            expect(contractTokenOutBalanceAfter).to.equal(contractTokenOutBalanceBefore - actualAmountOutFromContract);
        }

        it("Should swap exact amount of Thurisaz for Uruz", async function () {
            const swapAmountIn = parseUnits("10", 18);
            await performAndVerifySwap(thurisaz, uruz, swapAmountIn, owner.address);
        });

        it("Should swap exact amount of Uruz for Thurisaz (reversed path)", async function () {
            const swapAmountIn = parseUnits("10", 18);
            await performAndVerifySwap(uruz, thurisaz, swapAmountIn, owner.address);
        });

        it("Should successfully perform multiple swaps.", async function () {
            const swapAmountIn = parseUnits("10", 18);
            await performAndVerifySwap(thurisaz, uruz, swapAmountIn, owner.address);
            await performAndVerifySwap(uruz, thurisaz, swapAmountIn, owner.address);
            await performAndVerifySwap(thurisaz, uruz, swapAmountIn, owner.address);
            await performAndVerifySwap(uruz, thurisaz, swapAmountIn, owner.address);            
        });    

        it("Should revert if amountIn is zero", async function () {
            const amountIn = 0;
            const amountOutMin = parseUnits("1", 18);
            const path = [thurisaz.target, uruz.target];
            const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

            await expect(simpleSwap.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                path,
                owner.address,
                deadline
            )).to.be.revertedWith("Zero amountIn");
        });

        it("Should revert if amountOutMin is zero", async function () {
            const amountIn = parseUnits("10", 18);
            const amountOutMin = 0;
            const path = [thurisaz.target, uruz.target];
            const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

            await expect(simpleSwap.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                path,
                owner.address,
                deadline
            )).to.be.revertedWith("Zero amountOutMin");
        });

        it("Should revert if path length is not 2", async function () {
            const amountIn = parseUnits("10", 18);
            const amountOutMin = parseUnits("1", 18);
            const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

            await expect(simpleSwap.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                [thurisaz.target], // Path length 1
                owner.address,
                deadline
            )).to.be.revertedWith("Only 1-pair swaps allowed");

            await expect(simpleSwap.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                [thurisaz.target, uruz.target, thurisaz.target], // Path length 3
                owner.address,
                deadline
            )).to.be.revertedWith("Only 1-pair swaps allowed");
        });

        it("Should revert if reserves are empty", async function () {
            const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
            // Deploy a new SimpleSwap instance without liquidity
            const newSimpleSwap = await SimpleSwap.deploy();
            await newSimpleSwap.waitForDeployment();

            const amountIn = parseUnits("10", 18);
            const amountOutMin = parseUnits("1", 18);
            const path = [thurisaz.target, uruz.target];

            await expect(newSimpleSwap.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                path,
                owner.address,
                deadline
            )).to.be.revertedWith("Empty reserves");
        });

        it("Should revert if slippage exceeded (amountOut < amountOutMin)", async function () {
            const swapAmountIn = parseUnits("10", 18);
            const amountOutMin = parseUnits("20", 18); // This value should indeed be higher than the calculated output (~18.18)
            const path = [thurisaz.target, uruz.target];
            const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

            await thurisaz.approve(simpleSwap.target, swapAmountIn);

            await expect(simpleSwap.swapExactTokensForTokens(
                swapAmountIn,
                amountOutMin,
                path,
                owner.address,
                deadline
            )).to.be.revertedWith("Slippage exceeded");
        });

        it("Should revert if deadline is exceeded", async function () {
            const swapAmountIn = parseUnits("10", 18);
            const amountOutMin = parseUnits("1", 18);
            const path = [thurisaz.target, uruz.target];
            const deadline = Math.floor(Date.now() / 1000) - 10; // 10 seconds in the past

            await thurisaz.approve(simpleSwap.target, swapAmountIn);

            await expect(simpleSwap.swapExactTokensForTokens(
                swapAmountIn,
                amountOutMin,
                path,
                owner.address,
                deadline
            )).to.be.revertedWith("Transaction expired");
        });

        it("Should revert if thurisaz and uruz are the same in path", async function () {
            const swapAmountIn = parseUnits("10", 18);
            const amountOutMin = parseUnits("1", 18);
            const path = [thurisaz.target, thurisaz.target]; // Same token
            const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

            await thurisaz.approve(simpleSwap.target, swapAmountIn);

            await expect(simpleSwap.swapExactTokensForTokens(
                swapAmountIn,
                amountOutMin,
                path,
                owner.address,
                deadline
            )).to.be.revertedWith("Tokens must differ");
        });
    });

    describe("getPrice", function () {
        beforeEach(async function () {
            // Add initial liquidity for testing prices
            const amountA = parseUnits("100", 18);
            const amountB = parseUnits("200", 18);
            const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

            await thurisaz.approve(simpleSwap.target, amountA);
            await uruz.approve(simpleSwap.target, amountB);
            await simpleSwap.addLiquidity(thurisaz.target, uruz.target, amountA, amountB, amountA, amountB, owner.address, deadline);
        });

        it("Should return the correct price of Thurisaz in terms of Uruz", async function () {
            // reserveA = 100, reserveB = 200
            // price = (reserveB * 1e18) / reserveA = (200 * 1e18) / 100 = 2 * 1e18
            const expectedPrice = parseUnits("2", 18);
            const price = await simpleSwap.getPrice(thurisaz.target, uruz.target);
            expect(price).to.equal(expectedPrice);
        });

        it("Should return the correct price of Uruz in terms of Thurisaz", async function () {
            // reserveA = 100, reserveB = 200
            // price = (reserveA * 1e18) / reserveB = (100 * 1e18) / 200 = 0.5 * 1e18
            const expectedPrice = parseUnits("0.5", 18);
            const price = await simpleSwap.getPrice(uruz.target, thurisaz.target);
            expect(price).to.equal(expectedPrice);
        });

        it("Should revert if reserves are insufficient for Thurisaz", async function () {
            // Try to get price for a pair with no liquidity
            await expect(simpleSwap.getPrice(thurisaz.target, addr2.address)).to.be.revertedWith("Insufficient reserves");
        });

        it("Should revert if reserves are insufficient for Uruz", async function () {
            // Try to get price for a pair with no liquidity
            await expect(simpleSwap.getPrice(addr2.address, thurisaz.target)).to.be.revertedWith("Insufficient reserves");
        });
    });

    describe("getAmountOut", function () {
        it("Should calculate the correct amountOut for given inputs", async function () {
            const amountIn = parseUnits("10", 18);
            const reserveIn = parseUnits("100", 18);
            const reserveOut = parseUnits("200", 18);
            // amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)
            // amountOut = (10 * 200) / (100 + 10) = 2000 / 110 = 18.1818...
            const expectedAmountOut = (amountIn * reserveOut) / (reserveIn + amountIn);
            const actualAmountOut = await simpleSwap.getAmountOut(amountIn, reserveIn, reserveOut);
            expect(actualAmountOut).to.equal(expectedAmountOut);
        });

        it("Should return 0 if amountIn is 0", async function () {
            const amountIn = 0;
            const reserveIn = parseUnits("100", 18);
            const reserveOut = parseUnits("200", 18);
            const expectedAmountOut = 0;
            const actualAmountOut = await simpleSwap.getAmountOut(amountIn, reserveIn, reserveOut);
            expect(actualAmountOut).to.equal(expectedAmountOut);
        });

        it("Should return 0 if reserveOut is 0", async function () {
            const amountIn = parseUnits("10", 18);
            const reserveIn = parseUnits("100", 18);
            const reserveOut = 0;
            const expectedAmountOut = 0;
            const actualAmountOut = await simpleSwap.getAmountOut(amountIn, reserveIn, reserveOut);
            expect(actualAmountOut).to.equal(expectedAmountOut);
        });
    });
});