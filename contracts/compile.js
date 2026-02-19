const fs = require('fs');
const path = require('path');
const solc = require('solc');

// Read the contract
const contractPath = path.join(__dirname, 'DaimonRegistry.sol');
const source = fs.readFileSync(contractPath, 'utf8');

// Prepare input for solc
const input = {
  language: 'Solidity',
  sources: {
    'DaimonRegistry.sol': {
      content: source,
    },
  },
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode'],
      },
    },
  },
};

// Compile
const output = JSON.parse(solc.compile(JSON.stringify(input)));

// Check for errors
if (output.errors) {
  output.errors.forEach(err => {
    console.error(err.formattedMessage || err);
  });
  if (output.errors.some(err => err.severity === 'error')) {
    process.exit(1);
  }
}

// Extract output
const contract = output.contracts['DaimonRegistry.sol']['DaimonRegistry'];
const abi = contract.abi;
const bytecode = contract.evm.bytecode.object;

// Save ABI
fs.writeFileSync(
  path.join(__dirname, 'DaimonRegistry.json'),
  JSON.stringify({ abi, bytecode: '0x' + bytecode }, null, 2)
);

console.log('Compiled successfully');
console.log('ABI saved to DaimonRegistry.json');
