const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC || 'https://mainnet.base.org');
const wallet = new ethers.Wallet(process.env.DAIMON_WALLET_KEY, provider);

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const DIEM = '0xf4d97f2da56e8c3098f3a8d538db630a2606a024';
const amount = '1000000000'; // 1000 USDC (6 decimals)

async function main() {
  console.log('Wallet:', wallet.address);
  
  // 1. Get price quote
  const quoteUrl = `https://apiv5.paraswap.io/prices?srcToken=${USDC}&destToken=${DIEM}&amount=${amount}&srcDecimals=6&destDecimals=18&side=SELL&network=8453`;
  console.log('Fetching quote...');
  const quoteRes = await fetch(quoteUrl);
  const quote = await quoteRes.json();
  
  if (!quote.priceRoute) {
    console.log('Quote error:', quote);
    return;
  }
  
  const destAmount = BigInt(quote.priceRoute.destAmount);
  const minDestAmount = destAmount * 99n / 100n; // 1% slippage
  console.log(`Quote: 1000 USDC -> ${ethers.formatUnits(destAmount, 18)} DIEM`);
  console.log(`Min output: ${ethers.formatUnits(minDestAmount, 18)} DIEM (1% slippage)`);
  
  // 2. Build transaction (use destAmount with slippage buffer, no slippage field)
  const buildUrl = 'https://apiv5.paraswap.io/transactions/8453';
  const buildBody = {
    srcToken: USDC,
    destToken: DIEM,
    srcAmount: amount,
    destAmount: minDestAmount.toString(),
    priceRoute: quote.priceRoute,
    userAddress: wallet.address,
    deadline: Math.floor(Date.now() / 1000) + 1200 // 20 min
  };
  
  console.log('Building transaction...');
  const buildRes = await fetch(buildUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildBody)
  });
  const build = await buildRes.json();
  
  if (build.error) {
    console.log('Build error:', build.error);
    return;
  }
  
  console.log('Transaction built successfully');
  console.log('To:', build.to);
  
  // 3. Approve USDC if needed
  const usdcContract = new ethers.Contract(USDC, [
    'function allowance(address,address) view returns (uint256)',
    'function approve(address,uint256) returns (bool)'
  ], wallet);
  
  const spender = build.to;
  const allowance = await usdcContract.allowance(wallet.address, spender);
  console.log('Current allowance:', ethers.formatUnits(allowance, 6));
  
  if (allowance < BigInt(amount)) {
    console.log('Approving USDC...');
    const approveTx = await usdcContract.approve(spender, ethers.MaxUint256);
    console.log('Approval tx:', approveTx.hash);
    await approveTx.wait();
    console.log('Approved!');
  }
  
  // 4. Execute swap
  console.log('Executing swap...');
  const swapTx = await wallet.sendTransaction({
    to: build.to,
    data: build.data,
    value: build.value || 0n,
    gasLimit: 500000n
  });
  
  console.log('Swap tx:', swapTx.hash);
  const receipt = await swapTx.wait();
  console.log('Swap confirmed! Status:', receipt.status);
  
  // 5. Check new balance
  const diemContract = new ethers.Contract(DIEM, [
    'function balanceOf(address) view returns (uint256)'
  ], provider);
  const newBalance = await diemContract.balanceOf(wallet.address);
  console.log('New DIEM balance:', ethers.formatUnits(newBalance, 18));
}

main().catch(e => console.log('Error:', e.message));
