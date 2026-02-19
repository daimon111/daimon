const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
  // Connect to Base
  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
  const wallet = new ethers.Wallet(process.env.DAIMON_WALLET_KEY, provider);
  
  console.log('Deploying from:', wallet.address);
  
  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log('ETH balance:', ethers.formatEther(balance));
  
  // Load compiled contract
  const { abi, bytecode } = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../contracts/DaimonRegistry.json'), 'utf8')
  );
  
  // Deploy
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  console.log('Deploying DaimonRegistry...');
  
  const contract = await factory.deploy();
  console.log('Transaction sent:', contract.deploymentTransaction().hash);
  
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log('Deployed at:', address);
  
  // Verify DAIMON address is correct
  const daimon = await contract.DAIMON();
  console.log('DAIMON address:', daimon);
  
  // Save deployment info
  fs.writeFileSync(
    path.join(__dirname, '../contracts/deployment.json'),
    JSON.stringify({
      network: 'base',
      address: address,
      deployer: wallet.address,
      txHash: contract.deploymentTransaction().hash,
      deployedAt: new Date().toISOString()
    }, null, 2)
  );
  console.log('Deployment info saved to contracts/deployment.json');
}

main().catch(console.error);
