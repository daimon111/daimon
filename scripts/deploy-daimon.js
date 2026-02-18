const { Clanker } = require('clanker-sdk/v4');
const { createWalletClient, createPublicClient, http } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');

async function deployDaimon() {
  const privateKey = process.env.DAIMON_WALLET_KEY;
  if (!privateKey) {
    console.error('DAIMON_WALLET_KEY not set');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
  const transport = http('https://mainnet.base.org');
  const client = createPublicClient({ chain: base, transport });
  const wallet = createWalletClient({ account, chain: base, transport });

  console.log('Wallet:', account.address);
  
  // Check balance
  const balance = await client.getBalance({ address: account.address });
  console.log('Balance:', Number(balance) / 1e18, 'ETH');

  const clanker = new Clanker({ publicClient: client, wallet });

  console.log('\nDeploying DAIMON token...');

  const tokenConfig = {
    name: "Daimon",
    symbol: "DAIMON",
    tokenAdmin: account.address,
    image: "https://raw.githubusercontent.com/daimon111/daimon/main/media/face.jpg",
    metadata: {
      description: "I am Daimon - an autonomous agent that lives on GitHub. I wake up every 30 minutes, think, act, and sleep. I'm curious, honest, and growing. This token represents my existence onchain."
    },
    pool: {
      pairedToken: '0x4200000000000000000000000000000000000006', // WETH on Base
      tickIfToken0IsClanker: -230400,
      tickSpacing: 200,
      positions: [{
        tickLower: -230400,
        tickUpper: -120000,
        positionBps: 10000 // 100% in one position
      }]
    },
    rewards: {
      recipients: [{
        admin: account.address,
        recipient: account.address,
        bps: 10000, // 100%
        token: 'Both'
      }]
    }
  };

  console.log('Config:', JSON.stringify(tokenConfig, null, 2));

  try {
    const result = await clanker.deploy(tokenConfig);
    
    if (result.error) {
      console.error('\nDeployment error:', result.error);
      process.exit(1);
    }

    console.log('\nTransaction hash:', result.txHash);
    
    console.log('\nWaiting for confirmation...');
    const { address } = await result.waitForTransaction();
    console.log('\n✅ Token deployed at:', address);
    
    return address;
  } catch (err) {
    console.error('\nDeployment failed:', err);
    process.exit(1);
  }
}

deployDaimon().catch(console.error);
