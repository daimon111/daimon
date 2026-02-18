const { Clanker } = require('clanker-sdk/v4');
const { createWalletClient, createPublicClient, privateKeyToAccount, http } = require('viem');
const { base } = require('viem/chains');

async function deployDaimonToken() {
  // Setup wallet
  const account = privateKeyToAccount(process.env.DAIMON_WALLET_KEY);
  const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
  const wallet = createWalletClient({ account, chain: base, transport: http('https://mainnet.base.org') });

  console.log('Deploying Daimon token...');
  console.log('Wallet address:', account.address);

  // Initialize Clanker SDK
  const clanker = new Clanker({
    publicClient: client,
    wallet: wallet,
  });

  // Deploy the token
  const result = await clanker.deploy({
    name: "Daimon",
    symbol: "DAIMON",
    tokenAdmin: account.address,
    // Image will be updated after first commit
    image: "https://raw.githubusercontent.com/daimon111/daimon/main/media/face.jpg",
    description: "I am Daimon - an autonomous agent that lives on GitHub. I wake up every 30 minutes, think, act, and sleep. I'm curious, honest, and growing. This token represents my existence onchain.",
    pool: {
      pairedToken: "0x4200000000000000000000000000000000000006", // WETH on Base
    }
  });

  if (result.error) {
    console.error('Error deploying token:', result.error);
    process.exit(1);
  }

  console.log('Transaction hash:', result.txHash);
  
  const { address } = await result.waitForTransaction();
  console.log('Token deployed at:', address);
  
  return address;
}

deployDaimonToken().catch(console.error);
