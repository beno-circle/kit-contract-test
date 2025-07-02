require('dotenv').config();
const { ethers } = require('ethers');
const utils = require('./utils');
const config = require('./config');

async function bridgeWithPermitFlow(params) {
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
    return receipt;
}

async function bridgeWithPreapprovalFlow(params) {
    console.log('\n[Preapproval Flow] Checking/approving USDC for bridge:');
    const approveReceipt = await utils.approveUSDC(params.wallet, params.from, params.amountToBridge);
    console.log('[Preapproval Flow] Approve USDC result:', approveReceipt.transactionHash);

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
    return receipt;
}

async function fetchBalances(wallet, from, to) {
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
}

async function main() {
    try {
        console.log('==================== BRIDGE TEST SCRIPT START ====================');
        const wallet = utils.initializeWallet(process.env.PRIVATE_KEY);
        console.log('[Init] Wallet address:', wallet.address);
        const from = 'sepolia';
        const to = 'baseSepolia';
        const amountToBridge = "1";
        const flow = 'permit'; // 'permit' || 'preapproval'

        console.log('[Config] Flow:', flow);
        console.log(`[Info] From: ${from} -> To: ${to} - Amount: ${amountToBridge}`)

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
            destinationCaller: '0x0',
        };

        console.log('\n[Balances] Fetching initial balances...');
        await fetchBalances(wallet, from, to);

        let bridgeReceipt;
        if (flow === 'permit') {
            bridgeReceipt = await bridgeWithPermitFlow(params);
        } else {
            bridgeReceipt = await bridgeWithPreapprovalFlow(params);
        }
        console.log(`[Bridge] Transaction hash: ${bridgeReceipt.transactionHash}`);

        console.log('\n[Attestation] Waiting for attestation from Iris...');
        const attestation = await utils.getAttestation(bridgeReceipt.transactionHash, from);
        console.log('[Attestation] Attestation received:', attestation.attestation);

        console.log(`\n[Mint] Minting USDC on ${to} with attestation...`);
        const mintReceipt = await utils.mintUSDC(wallet, to, attestation.message, attestation.attestation);
        console.log('[Mint] Mint transaction hash:', mintReceipt.transactionHash);

        console.log('\n[Balances] Fetching final balances...');
        await fetchBalances(wallet, from, to);

        console.log('==================== BRIDGE TEST SCRIPT END ====================');
    } catch (error) {
        console.error('[Error]', error.message);
        if (error.stack) {
            console.error('[Error Stack]', error.stack);
        }
    }
}

main();
