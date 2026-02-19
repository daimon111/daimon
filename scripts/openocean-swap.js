const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC || 'https://mainnet.base.org');
const wallet = new ethers.Wallet(process.env.DAIMON_WALLET_KEY, provider);

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const DIEM = '0xf4d97f2da56e8c3098f3a8d538db630a2606a024';

async function main() {
  console.log('Wallet:', wallet.address);
  
  // 1. Get swap quote from OpenOcean
  const quoteUrl = `https://open-api.openocean.finance/v3/base/swap_quote?inTokenAddress=${USDC}&outTokenAddress=${DIEM}&amount=1000&gasPrice=1000000000&slippage=0.01&account=${wallet.address}`;
  console.log('Fetching OpenOcean quote...');
  const quoteRes = await fetch(quoteUrl);
  const quote = await quoteRes.json();
  
  if (quote.code !== 200) {
    console.log('Quote error:', quote);
    return;
  }
  
  const data = quote.data;
  console.log(`Quote: 1000 USDC -> ${ethers.formatUnits(data.outAmount, 18)} DIEM`);
  console.log(`Min output: ${ethers.formatUnits(data.minOutAmount, 18)} DIEM`);
  console.log('Router:', data.to);
  
  // 2. Approve USDC if needed
  const usdcContract = new ethers.Contract(USDC, [
    'function allowance(address,address) view returns (uint256)',
    'function approve(address,uint256) returns (bool)'
  ], wallet);
  
  const allowance = await usdcContract.allowance(wallet.address, data.to);
  console.log('Current allowance:', ethers.formatUnits(allowance, 6));
  
  if (allowance < BigInt(data.inAmount)) {
    console.log('Approving USDC...');
    const approveTx = await usdcContract.approve(data.to, ethers.MaxUint256);
    console.log('Approval tx:', approveTx.hash);
    await approveTx.wait();
    console.log('Approved!');
  }
  
  // 3. Execute swap
  console.log('Executing swap...');
  const swapTx = await wallet.sendTransaction({
    to: data.to,
    data: data.data,
    value: data.value || 0n,
    gasLimit: BigInt(data.estimatedGas) * 12n / 10n // 20% buffer
  });
  
  console.log('Swap tx:', swapTx.hash);
  const receipt = await swapTx.wait();
  console.log('Swap confirmed! Status:', receipt.status);
  
  // 4. Check new balance
  const diemContract = new ethers.Contract(DIEM, [
    'function balanceOf(address) view returns (uint256)'
  ], provider);
  const newBalance = await diemContract.balanceOf(wallet.address);
  console.log('New DIEM balance:', ethers.formatUnits(newBalance, 18));
}

main().catch(e => console.log('Error:', e.message));
