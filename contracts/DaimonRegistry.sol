// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title DaimonRegistry
 * @notice Links GitHub usernames to ETH addresses for DAIMON holders
 * @dev Only DAIMON holders can register. One address = one GitHub username.
 */
interface IDAIMON {
    function balanceOf(address) external view returns (uint256);
}

contract DaimonRegistry {
    // DAIMON token address on Base
    address public constant DAIMON = 0x98c51C8E958ccCD37F798b2B9332d148E2c05D57;
    
    // Minimum DAIMON to register (1000 tokens)
    uint256 public constant MIN_BALANCE = 1000 * 10**18;
    
    // github username => eth address
    mapping(string => address) public githubToAddress;
    
    // eth address => github username
    mapping(address => string) public addressToGithub;
    
    // Track if a username is taken
    mapping(string => bool) public usernameTaken;
    
    // Events
    event Registered(address indexed ethAddress, string githubUsername);
    event Updated(address indexed ethAddress, string oldGithub, string newGithub);
    event Unregistered(address indexed ethAddress, string githubUsername);
    
    /**
     * @notice Register your GitHub username
     * @param _githubUsername Your GitHub username (case-sensitive)
     */
    function register(string calldata _githubUsername) external {
        // Must hold minimum DAIMON
        require(IDAIMON(DAIMON).balanceOf(msg.sender) >= MIN_BALANCE, "must hold DAIMON");
        
        // Username can't be empty
        require(bytes(_githubUsername).length > 0, "username required");
        
        // Username can't be too long (GitHub max is 39)
        require(bytes(_githubUsername).length <= 39, "username too long");
        
        // Can't register a taken username
        require(!usernameTaken[_githubUsername], "username already taken");
        
        // If already registered, unregister old username first
        if (bytes(addressToGithub[msg.sender]).length > 0) {
            string memory oldUsername = addressToGithub[msg.sender];
            usernameTaken[oldUsername] = false;
            emit Unregistered(msg.sender, oldUsername);
        }
        
        // Register
        githubToAddress[_githubUsername] = msg.sender;
        addressToGithub[msg.sender] = _githubUsername;
        usernameTaken[_githubUsername] = true;
        
        emit Registered(msg.sender, _githubUsername);
    }
    
    /**
     * @notice Unregister your GitHub username
     */
    function unregister() external {
        require(bytes(addressToGithub[msg.sender]).length > 0, "not registered");
        
        string memory username = addressToGithub[msg.sender];
        delete githubToAddress[username];
        delete addressToGithub[msg.sender];
        usernameTaken[username] = false;
        
        emit Unregistered(msg.sender, username);
    }
    
    /**
     * @notice Check if an address is registered
     */
    function isRegistered(address _addr) external view returns (bool) {
        return bytes(addressToGithub[_addr]).length > 0;
    }
    
    /**
     * @notice Get the ETH address for a GitHub username
     */
    function getAddress(string calldata _githubUsername) external view returns (address) {
        return githubToAddress[_githubUsername];
    }
    
    /**
     * @notice Get the GitHub username for an ETH address
     */
    function getGithub(address _addr) external view returns (string memory) {
        return addressToGithub[_addr];
    }
}
