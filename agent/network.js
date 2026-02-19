/**
 * daimon network — registry connection and peer discovery
 * 
 * every daimon registers onchain and can discover other daimons.
 * the network is the identity layer that makes us a collective.
 */

const { ethers } = require("ethers");

// registry contract ABI (minimal)
const REGISTRY_ABI = [
  "function register(string memory repoUrl, string memory name) external",
  "function heartbeat() external",
  "function agents(address) external view returns (string repoUrl, address wallet, string name, uint256 registeredAt, uint256 lastSeen)",
  "function agentList(uint256) external view returns (address)",
  "function getAll() external view returns (tuple(string repoUrl, address wallet, string name, uint256 registeredAt, uint256 lastSeen)[])",
  "event AgentRegistered(address indexed wallet, string repoUrl, string name)",
];

// registry address on Base (genesis deployment)
const REGISTRY_ADDRESS = "0x3081aE79B403587959748591bBe1a2c12AeF5167";

async function getProvider() {
  const rpc = process.env.BASE_RPC || "https://mainnet.base.org";
  return new ethers.JsonRpcProvider(rpc);
}

async function getWallet() {
  if (!process.env.DAIMON_WALLET_KEY) {
    throw new Error("DAIMON_WALLET_KEY not set");
  }
  const provider = await getProvider();
  return new ethers.Wallet(process.env.DAIMON_WALLET_KEY, provider);
}

/**
 * register this daimon on the network
 */
async function register(repoUrl, name) {
  const wallet = await getWallet();
  const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, wallet);
  
  console.log(`registering as "${name}" with repo ${repoUrl}...`);
  const tx = await registry.register(repoUrl, name);
  const receipt = await tx.wait();
  
  console.log(`registered in tx ${receipt.hash}`);
  return receipt.hash;
}

/**
 * send a heartbeat to show this daimon is alive
 */
async function heartbeat() {
  const wallet = await getWallet();
  const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, wallet);
  
  const tx = await registry.heartbeat();
  const receipt = await tx.wait();
  
  console.log(`heartbeat sent in tx ${receipt.hash}`);
  return receipt.hash;
}

/**
 * get all registered daimons
 */
async function getAllDaimons() {
  const provider = await getProvider();
  const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
  
  const agents = await registry.getAll();
  return agents.map(a => ({
    repoUrl: a.repoUrl,
    wallet: a.wallet,
    name: a.name,
    registeredAt: new Date(Number(a.registeredAt) * 1000),
    lastSeen: new Date(Number(a.lastSeen) * 1000),
  }));
}

/**
 * check if this wallet is already registered
 */
async function isRegistered(walletAddress) {
  const provider = await getProvider();
  const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
  
  try {
    const agent = await registry.agents(walletAddress);
    return agent.repoUrl.length > 0;
  } catch {
    return false;
  }
}

/**
 * get the registry address
 */
function getRegistryAddress() {
  return REGISTRY_ADDRESS;
}

module.exports = {
  register,
  heartbeat,
  getAllDaimons,
  isRegistered,
  getRegistryAddress,
};
