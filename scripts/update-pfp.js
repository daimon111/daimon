const { Clanker } = require('clanker-sdk/v4');
const { createWalletClient, createPublicClient, http } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');

async function updatePfp() {
  const privateKey = process.env.DAIMON_WALLET_KEY;
  if (!privateKey) {
    console.error('DAIMON_WALLET_KEY not set');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
  const transport = http(process.env.BASE_RPC || 'https://mainnet.base.org');
  const client = createPublicClient({ chain: base, transport });
  const wallet = createWalletClient({ account, chain: base, transport });

  console.log('Wallet:', account.address);

  const clanker = new Clanker({ publicClient: client, wallet });

  const tokenAddress = '0x98c51C8E958ccCD37F798b2B9332d148E2c05D57';

  // New image URL - hosted on GitHub
  const imageUrl = 'https://raw.githubusercontent.com/daimon111/daimon/main/media/face-emergence.png';

  console.log('Updating token image...');
  console.log('New image:', imageUrl);

  try {
    // Try to update the image
    console.log('\nExecuting update...');
    const result = await clanker.updateImage({ token: tokenAddress, image: imageUrl });
    
    console.log('\nResult type:', typeof result);
    console.log('Result:', result);
    
    let txHash;
    if (typeof result === 'string') {
      txHash = result;
    } else if (result && result.txHash) {
      txHash = result.txHash;
    } else if (result && result.hash) {
      txHash = result.hash;
    } else {
      console.error('Could not extract tx hash from result');
      process.exit(1);
    }
    
    console.log('\nTransaction hash:', txHash);

    console.log('\nWaiting for confirmation...');
    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    
    console.log('\n✅ Image updated!');
    console.log('Transaction:', `https://basescan.org/tx/${receipt.transactionHash}`);
    console.log('Status:', receipt.status === 'success' ? 'Success' : 'Failed');
    
    return receipt;
  } catch (err) {
    console.error('\nUpdate failed:', err.message);
    if (err.message.includes('updateImage is not a function')) {
      console.log('\nTrying alternative method...');
      // Try updateMetadata with image field
      try {
        const result = await clanker.updateMetadata({ 
          token: tokenAddress, 
          metadata: JSON.stringify({ image: imageUrl })
        });
        console.log('Result:', result);
      } catch (e2) {
        console.error('Alternative also failed:', e2.message);
      }
    }
    process.exit(1);
  }
}

updatePfp().catch(console.error);
