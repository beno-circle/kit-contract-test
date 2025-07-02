const config = {
    networks: {
        sepolia: {
            chainId: 11155111,
            rpcUrl: process.env.SEPOLIA_RPC_URL,
            usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Sepolia USDC
            messageTransmitterAddress: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
            tokenMessengerAddress: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
            kitContractAddress: "0xa4b3f907eD312C7d96Ed776c5993a4bE7C5022b3",
            circleDomain: 0
        },
        baseSepolia: {
            chainId: 84532,
            rpcUrl: process.env.BASE_SEPOLIA_RPC_URL,
            usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
            messageTransmitterAddress: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
            tokenMessengerAddress: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
            kitContractAddress: "0x63B8E61b90d4c4E3059f65BAC7da21DA96094Fa0",
            circleDomain: 6
        },
        avalanche: {
            chainId: 43113,
            rpcUrl: process.env.AVALANCHE_RPC_URL,
            usdcAddress: "0x5425890298aed601595a70AB815c96711a31Bc65", // Fuji USDC
            messageTransmitterAddress: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
            tokenMessengerAddress: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
            kitContractAddress: "0x0000000000000000000000000000000000000000",
            circleDomain: 1
        }
    },
    irisApiUrl: "https://iris-api-sandbox.circle.com",
};

module.exports = config; 