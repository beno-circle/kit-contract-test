const { ethers } = require('ethers');
const config = require('./config');
const fetch = require('node-fetch');

const KIT_CONTRACT_ABI = require('./abis/BridgingKitContract.json').abi;
const IERC20_ABI = require('./abis/IERC20.json').abi;

// Initialize wallet and providers
const initializeWallet = (privateKey) => {
    const wallet = new ethers.Wallet(privateKey);
    return wallet;
};

// Initialize provider for a specific network
const getProvider = (network) => {
    return new ethers.providers.JsonRpcProvider(config.networks[network].rpcUrl);
};

// Get USDC balance
const getUSDCBalance = async (wallet, network) => {
    const provider = getProvider(network);
    const connectedWallet = wallet.connect(provider);

    const usdcContract = new ethers.Contract(
        config.networks[network].usdcAddress,
        IERC20_ABI,
        connectedWallet
    );

    const balance = await usdcContract.balanceOf(wallet.address);
    return ethers.utils.formatUnits(balance, 6); // USDC has 6 decimals
};

// Get native token balance
const getNativeBalance = async (wallet, network) => {
    const provider = getProvider(network);
    const balance = await provider.getBalance(wallet.address);
    return ethers.utils.formatEther(balance);
};

// Check USDC allowance
const checkAllowance = async (wallet, network, spender) => {
    const provider = getProvider(network);
    const connectedWallet = wallet.connect(provider);

    const usdcContract = new ethers.Contract(
        config.networks[network].usdcAddress,
        IERC20_ABI,
        connectedWallet
    );

    const allowance = await usdcContract.allowance(wallet.address, spender);
    return allowance;
};

// Approve USDC for TokenMessenger only if needed
const approveUSDC = async (wallet, network, amount) => {
    const provider = getProvider(network);
    const connectedWallet = wallet.connect(provider);

    const usdcContract = new ethers.Contract(
        config.networks[network].usdcAddress,
        IERC20_ABI,
        connectedWallet
    );

    const amountWei = ethers.utils.parseUnits(amount, 6);
    const kitContractAddress = config.networks[network].kitContractAddress;

    // Check existing allowance
    const currentAllowance = await usdcContract.allowance(wallet.address, kitContractAddress);

    if (currentAllowance.lt(amountWei)) {
        console.log('Approval needed. Current allowance:', ethers.utils.formatUnits(currentAllowance, 6));
        const tx = await usdcContract.approve(kitContractAddress, amountWei);
        return await tx.wait();
    } else {
        console.log('Sufficient allowance already present:', ethers.utils.formatUnits(currentAllowance, 6));
        return { transactionHash: 'No approval needed' };
    }
};

// Estimate gas for a contract function call
const estimateGasForFunction = async (contract, functionName, args, network) => {
    try {
        // Get current gas price
        const provider = getProvider(network);
        const feeData = await provider.getFeeData();

        // Estimate gas for the function call
        const gasEstimate = await contract.estimateGas[functionName](...args);

        // Add 20% buffer to gas estimate
        const gasWithBuffer = gasEstimate.mul(120).div(100);

        // Use higher priority fee for faster processing
        const baseFee = feeData.maxFeePerGas || feeData.gasPrice;
        const priorityFee = ethers.BigNumber.from(2000000000); // 2 Gwei priority fee

        return {
            gasLimit: gasWithBuffer,
            maxFeePerGas: baseFee.add(priorityFee),
            maxPriorityFeePerGas: priorityFee
        };
    } catch (error) {
        console.error('Gas estimation failed:', error.message);
        // Return reasonable defaults with higher priority fee
        return {
            gasLimit: ethers.BigNumber.from(500000),
            maxFeePerGas: ethers.BigNumber.from(30000000000), // 30 gwei
            maxPriorityFeePerGas: ethers.BigNumber.from(2000000000) // 2 gwei
        };
    }
};

// Check gas requirements with dynamic estimation
const checkGasRequirements = async (wallet, network, contract, functionName, args) => {
    const provider = getProvider(network);
    const balance = await provider.getBalance(wallet.address);

    // Get gas parameters
    const gasParams = await estimateGasForFunction(contract, functionName, args, network);

    // Calculate required gas cost
    const gasCost = gasParams.maxFeePerGas.mul(gasParams.gasLimit);

    // Add 10% buffer
    const requiredBalance = gasCost.mul(110).div(100);

    if (balance.lt(requiredBalance)) {
        throw new Error(`Insufficient gas funds. Required: ${ethers.utils.formatEther(requiredBalance)} ${network === 'sepolia' ? 'ETH' : 'AVAX'}, Have: ${ethers.utils.formatEther(balance)} ${network === 'sepolia' ? 'ETH' : 'AVAX'}`);
    }

    return gasParams;
};

// Bridge with Preapproval
const bridgeWithPreapproval = async (wallet, network, bridgeParams, transferType = 'standard') => {
    const provider = getProvider(network);
    const connectedWallet = wallet.connect(provider);

    // First check USDC balance
    const usdcBalance = await getUSDCBalance(wallet, network);
    const amountWei = ethers.utils.parseUnits(bridgeParams.amount, 6);
    const balanceWei = ethers.utils.parseUnits(usdcBalance, 6);

    if (balanceWei.lt(amountWei)) {
        throw new Error(`Insufficient USDC balance. Required: ${bridgeParams.amount} USDC, Have: ${usdcBalance} USDC`);
    }

    const kitContractAddress = config.networks[network].kitContractAddress;
    const usdcAddress = config.networks[network].usdcAddress;

    const kitContract = new ethers.Contract(
        kitContractAddress,
        KIT_CONTRACT_ABI,
        connectedWallet
    );

    const finalityThreshold = transferType === 'fast' ? 1000 : 2000;
    const maxFee = amountWei.sub(1);

    // Construct ordered bridgeParams object
    const orderedBridgeParams = {
        amount: amountWei, // uint256
        destinationDomain: bridgeParams.destinationDomain, // uint32
        minFinalityThreshold: finalityThreshold, // uint32
        maxFee: maxFee, // uint256
        fee: bridgeParams.fee, // uint256
        burnToken: usdcAddress, // address
        feeRecipient: bridgeParams.feeRecipient, // address
        mintRecipient: ethers.utils.hexZeroPad(bridgeParams.mintRecipient, 32), // bytes32
        destinationCaller: ethers.utils.hexZeroPad(bridgeParams.destinationCaller, 32), // bytes32
        feeIsBips: bridgeParams.feeIsBips // bool
    };

    console.log('orderedBridgeParams:', orderedBridgeParams);
    Object.entries(orderedBridgeParams).forEach(([k, v]) => {
        console.log(`${k}:`, v);
    });

    // Check gas requirements
    console.log('Checking gas requirements...');
    const checkedGasParams = await checkGasRequirements(
        wallet,
        network,
        kitContract,
        'bridgeWithPreapproval',
        [orderedBridgeParams]
    );
    console.log('Gas check passed for bridgeWithPreapproval operation');

    try {
        // Get current gas price
        const currentGasPrice = await provider.getFeeData();
        const baseGasPrice = currentGasPrice.maxFeePerGas || currentGasPrice.gasPrice;

        // Use higher gas prices based on checked parameters
        const gasParams = {
            gasLimit: checkedGasParams.gasLimit.mul(150).div(100), // 50% higher gas limit
            maxFeePerGas: baseGasPrice.mul(3), // 3x base price
            maxPriorityFeePerGas: ethers.BigNumber.from(3000000000) // 3 Gwei priority fee
        };

        console.log('Using high gas parameters:', {
            gasLimit: gasParams.gasLimit.toString(),
            maxFeePerGas: gasParams.maxFeePerGas.toString(),
            maxPriorityFeePerGas: gasParams.maxPriorityFeePerGas.toString()
        });

        const tx = await kitContract.bridgeWithPreapproval(orderedBridgeParams, gasParams);

        console.log('BridgeWithPreapproval transaction sent. Transaction hash:', tx.hash);
        console.log('Waiting for transaction confirmation...');

        // Simple wait with timeout
        const receipt = await Promise.race([
            tx.wait(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Transaction confirmation timeout after 2 minutes')), 2 * 60 * 1000)
            )
        ]);

        console.log('Transaction confirmed!');
        console.log('Block number:', receipt.blockNumber);
        console.log('Gas used:', receipt.gasUsed.toString());
        return receipt;
    } catch (error) {
        if (error.code === 'CALL_EXCEPTION') {
            throw new Error(`Contract call failed. Please check: 1) USDC balance, 2) Contract addresses, 3) Destination domain`);
        }
        console.error('Transaction error:', error);
        throw error;
    }
};

const generatePermitSignature = async ({
    wallet,
    network,
    tokenAddress,
    spender,
    value,
    deadline,
    provider
}) => {
    // Minimal ABI for permit and required fields
    const ERC20_ABI = [
        'function name() view returns (string)',
        'function nonces(address) view returns (uint256)',
        'function DOMAIN_SEPARATOR() view returns (bytes32)',
        'function version() view returns (string)', // optional
        'function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)'
    ];

    const token = new ethers.Contract(config.networks[network].usdcAddress, ERC20_ABI, provider);

    // Get chainId, name, version, nonce
    const {chainId} = await provider.getNetwork();
    const [ name, nonce] = await Promise.all([
        token.name(),
        token.nonces(wallet.address)
    ]);

    // Try to get version, fallback to '1'
    let version = '1';
    try {
        version = await token.version();
    } catch (e) { }

    // EIP-712 domain
    const domain = {
        name,
        version,
        chainId,
        verifyingContract: tokenAddress
    };

    // EIP-712 types
    const types = {
        Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' }
        ]
    };

    // EIP-712 message
    const message = {
        owner: wallet.address,
        spender,
        value: ethers.BigNumber.from(value).toString(),
        nonce: nonce.toString(),
        deadline: deadline.toString()
    };

    // Sign the typed data
    const signature = await wallet._signTypedData(domain, types, message);
    const { v, r, s } = ethers.utils.splitSignature(signature);

    return {deadline, v, r, s };
}


// Bridge with Permit
const bridgeWithPermit = async (wallet, network, bridgeParams, permitParams, transferType = 'standard') => {
    const provider = getProvider(network);
    const connectedWallet = wallet.connect(provider);

    // First check USDC balance
    const usdcBalance = await getUSDCBalance(wallet, network);
    const amountWei = ethers.utils.parseUnits(bridgeParams.amount, 6);
    const balanceWei = ethers.utils.parseUnits(usdcBalance, 6);

    if (balanceWei.lt(amountWei)) {
        throw new Error(`Insufficient USDC balance. Required: ${bridgeParams.amount} USDC, Have: ${usdcBalance} USDC`);
    }

    const kitContractAddress = config.networks[network].kitContractAddress;
    const usdcAddress = config.networks[network].usdcAddress;

    const kitContract = new ethers.Contract(
        kitContractAddress,
        KIT_CONTRACT_ABI,
        connectedWallet
    );

    const finalityThreshold = transferType === 'fast' ? 1000 : 2000;
    const maxFee = amountWei.sub(1);

    // Construct ordered bridgeParams object
    const orderedBridgeParams = {
        amount: amountWei, // uint256
        destinationDomain: bridgeParams.destinationDomain, // uint32
        minFinalityThreshold: finalityThreshold, // uint32
        maxFee: maxFee, // uint256
        fee: bridgeParams.fee, // uint256
        burnToken: usdcAddress, // address
        feeRecipient: bridgeParams.feeRecipient, // address
        mintRecipient: ethers.utils.hexZeroPad(bridgeParams.mintRecipient, 32), // bytes32
        destinationCaller: ethers.utils.hexZeroPad(bridgeParams.destinationCaller, 32), // bytes32
        feeIsBips: bridgeParams.feeIsBips // bool
    };

    console.log('orderedBridgeParams:', orderedBridgeParams);
    Object.entries(orderedBridgeParams).forEach(([k, v]) => {
        console.log(`${k}:`, v);
    });

    // Check gas requirements
    console.log('Checking gas requirements...');
    const checkedGasParams = await checkGasRequirements(
        wallet,
        network,
        kitContract,
        'bridgeWithPermit',
        [orderedBridgeParams,permitParams]
    );
    console.log('Gas check passed for bridgeWithPermit operation');

    try {
        // Get current gas price
        const currentGasPrice = await provider.getFeeData();
        const baseGasPrice = currentGasPrice.maxFeePerGas || currentGasPrice.gasPrice;

        // Use higher gas prices based on checked parameters
        const gasParams = {
            gasLimit: checkedGasParams.gasLimit.mul(150).div(100), // 50% higher gas limit
            maxFeePerGas: baseGasPrice.mul(3), // 3x base price
            maxPriorityFeePerGas: ethers.BigNumber.from(3000000000) // 3 Gwei priority fee
        };

        console.log('Using high gas parameters:', {
            gasLimit: gasParams.gasLimit.toString(),
            maxFeePerGas: gasParams.maxFeePerGas.toString(),
            maxPriorityFeePerGas: gasParams.maxPriorityFeePerGas.toString()
        });

        const tx = await kitContract.bridgeWithPermit(orderedBridgeParams, permitParams, gasParams);

        console.log('BridgeWithPermit transaction sent. Transaction hash:', tx.hash);
        console.log('Waiting for transaction confirmation...');

        // Simple wait with timeout
        const receipt = await Promise.race([
            tx.wait(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Transaction confirmation timeout after 2 minutes')), 2 * 60 * 1000)
            )
        ]);

        console.log('Transaction confirmed!');
        console.log('Block number:', receipt.blockNumber);
        console.log('Gas used:', receipt.gasUsed.toString());
        return receipt;
    } catch (error) {
        if (error.code === 'CALL_EXCEPTION') {
            throw new Error(`Contract call failed. Please check: 1) USDC balance, 2) Contract addresses, 3) Destination domain`);
        }
        console.error('Transaction error:', error);
        throw error;
    }
};
// Get attestation from Iris with improved error handling
const getAttestation = async (transactionHash, network) => {

    const url = `${config.irisApiUrl}/v2/messages/${config.networks[network].circleDomain}?transactionHash=${transactionHash}`;
    const options = { method: 'GET', headers: { 'Content-Type': 'application/json' } };

    while (true) {
        try {
            const response = await fetch(url, options);

            if (response.status === 404) {
                console.log('Waiting for attestation...');
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }

            if (!response.ok) {
                throw new Error('Failed to get attestation');
            }

            const data = await response.json();
            console.log('Attestation data:', data);
            if (data?.messages?.[0]?.status === 'complete') {
                console.log('Attestation retrieved!');
                return data.messages[0];
            }

            console.log('Waiting for attestation...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error) {
            if (error.message === 'Failed to get attestation') {
                console.error('Attestation retrieval failed');
                throw error;
            }
            console.log('Waiting for attestation...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
};

// Mint USDC with dynamic gas estimation
const mintUSDC = async (wallet, network, message, attestation) => {
    const provider = getProvider(network);
    const connectedWallet = wallet.connect(provider);

    const messageTransmitter = new ethers.Contract(
        config.networks[network].messageTransmitterAddress,
        [
            'function receiveMessage(bytes calldata message, bytes calldata attestation)'
        ],
        connectedWallet
    );

    // Get gas parameters
    const gasParams = await estimateGasForFunction(
        messageTransmitter,
        'receiveMessage',
        [message, attestation],
        network
    );

    const tx = await messageTransmitter.receiveMessage(
        message,
        attestation,
        gasParams
    );

    return await tx.wait();
};

module.exports = {
    initializeWallet,
    getProvider,
    getUSDCBalance,
    getNativeBalance,
    checkAllowance,
    approveUSDC,
    bridgeWithPreapproval,
    bridgeWithPermit,
    generatePermitSignature,
    getAttestation,
    mintUSDC,
    checkGasRequirements,
    estimateGasForFunction
}; 