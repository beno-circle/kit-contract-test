require('dotenv').config();
const { ethers } = require('ethers');
const utils = require('./utils');
const config = require('./config');

async function bridgeWithPermitFlow(params) {
    console.log('\n[Permit Flow] Generating permit signature with parameters:');
    console.log(JSON.stringify({
        wallet: params.wallet.address,
        network: params.from,
        tokenAddress: config.networks[params.from].usdcAddress,
        spender: config.networks[params.from].kitContractAddress,
        value: params.amountToBridge,
        deadline: Math.floor(Date.now() / 1000) + 3600
    }, null, 2));
    const permitParams = await utils.generatePermitSignature({
        wallet: params.wallet,
        network: params.from,
        tokenAddress: config.networks[params.from].usdcAddress,
        spender: config.networks[params.from].kitContractAddress,
        value: ethers.utils.parseUnits(params.amountToBridge, 6),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        provider: utils.getProvider(params.from)
    });
    console.log('[Permit Flow] Permit signature generated:', permitParams);
    const bridgeParams = {
        amount: params.amountToBridge,
        destinationDomain: config.networks[params.to].circleDomain,
        fee: params.fee,
        feeRecipient: params.feeRecipient,
        feeIsBips: params.feeIsBips,
        mintRecipient: params.recipient,
        destinationCaller: params.destinationCaller
    };
    console.log('[Permit Flow] Calling bridgeWithPermit with params:', bridgeParams);
    const receipt = await utils.bridgeWithPermit(
        params.wallet,
        params.from,
        bridgeParams,
        permitParams,
        params.transferType
    );
    console.log('[Permit Flow] bridgeWithPermit transaction receipt:', receipt);
    return receipt;
}

async function bridgeWithPreapprovalFlow(params) {
    console.log('\n[Preapproval Flow] Checking/approving USDC for bridge:');
    console.log(JSON.stringify({
        wallet: params.wallet.address,
        network: params.from,
        amount: params.amountToBridge
    }, null, 2));
    const approveReceipt = await utils.approveUSDC(params.wallet, params.from, params.amountToBridge);
    console.log('[Preapproval Flow] Approve USDC result:', approveReceipt);
    const bridgeParams = {
        amount: params.amountToBridge,
        destinationDomain: config.networks[params.to].circleDomain,
        fee: params.fee,
        feeRecipient: params.feeRecipient,
        feeIsBips: params.feeIsBips,
        mintRecipient: params.recipient,
        destinationCaller: params.destinationCaller
    };
    console.log('[Preapproval Flow] Calling bridgeWithPreapproval with params:', bridgeParams);
    const receipt = await utils.bridgeWithPreapproval(
        params.wallet,
        params.from,
        bridgeParams,
        params.transferType
    );
    console.log('[Preapproval Flow] bridgeWithPreapproval transaction receipt:', receipt);
    return receipt;
}

async function main() {
    try {
        console.log('==================== BRIDGE TEST SCRIPT START ====================');
        const wallet = utils.initializeWallet(process.env.PRIVATE_KEY);
        console.log('[Init] Wallet address:', wallet.address);
        const from = 'sepolia';
        const to = 'baseSepolia';
        const amountToBridge = "0.1";
        const params = {
            wallet,
            from,
            to,
            amountToBridge,
            transferType: 'fast',
            recipient: wallet.address,
            fee: ethers.BigNumber.from(0),
            feeRecipient: wallet.address,
            feeIsBips: false,
            destinationCaller: '0x0000000000000000000000000000000000000000',
        };
        const flow = 'preapproval'; // 'permit' || 'preapproval'
        console.log('[Config] Flow:', flow);
        console.log('[Config] Params:', JSON.stringify(params, null, 2));

        console.log('\n[Balances] Fetching initial balances...');
        const [fromBalance, toBalance, fromNative, toNative] = await Promise.all([
            utils.getUSDCBalance(wallet, from),
            utils.getUSDCBalance(wallet, to),
            utils.getNativeBalance(wallet, from),
            utils.getNativeBalance(wallet, to)
        ]);
        console.log(`[Balances] ${from} USDC: ${fromBalance}`);
        console.log(`[Balances] ${to} USDC: ${toBalance}`);
        console.log(`[Balances] ${from} Native: ${fromNative}`);
        console.log(`[Balances] ${to} Native: ${toNative}`);

        if (ethers.utils.parseEther(fromNative).lt(ethers.utils.parseEther('0.01'))) {
            throw new Error(`[Balances] Insufficient native token on ${from}`);
        }

        let bridgeReceipt;
        if (flow === 'permit') {
            bridgeReceipt = await bridgeWithPermitFlow(params);
        } else {
            bridgeReceipt = await bridgeWithPreapprovalFlow(params);
        }
        console.log(`[Bridge] Transaction hash: ${bridgeReceipt.transactionHash}`);

        console.log('\n[Attestation] Waiting for attestation from Iris...');
        const attestation = await utils.getAttestation(bridgeReceipt.transactionHash, from);
        console.log('[Attestation] Attestation received:', attestation);

        // Uncomment to mint on destination
        console.log(`\n[Mint] Minting USDC on ${to} with attestation...`);
        const mintReceipt = await utils.mintUSDC(wallet, to, attestation.message, attestation.attestation);
        console.log('[Mint] Mint transaction hash:', mintReceipt.transactionHash);

        console.log('\n[Balances] Fetching final balances...');
        const [finalFrom, finalTo, finalFromNative, finalToNative] = await Promise.all([
            utils.getUSDCBalance(wallet, from),
            utils.getUSDCBalance(wallet, to),
            utils.getNativeBalance(wallet, from),
            utils.getNativeBalance(wallet, to)
        ]);
        console.log(`[Balances] ${from} USDC: ${finalFrom}`);
        console.log(`[Balances] ${to} USDC: ${finalTo}`);
        console.log(`[Balances] ${from} Native: ${finalFromNative}`);
        console.log(`[Balances] ${to} Native: ${finalToNative}`);
        console.log('==================== BRIDGE TEST SCRIPT END ====================');
    } catch (error) {
        console.error('[Error]', error.message);
        if (error.stack) {
            console.error('[Error Stack]', error.stack);
        }
    }
}

main();
