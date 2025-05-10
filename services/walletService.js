// walletService.js
import { Keypair } from "@solana/web3.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";

function createWallet() {
  const keyPair = Keypair.generate();
  return {
    publicKey: keyPair.publicKey.toString(),
    secretKeyEncoded: bs58.encode(keyPair.secretKey),
  };
}

function createCsv(wallets) {
  let csvContent = "index,publicKey,privateKey\n";
  wallets.forEach((wallet) => {
    csvContent += `${wallet.index},${wallet.publicKey},${wallet.secretKeyEncoded}\n`;
  });
  writeFileSync("_CONFIDENTIAL_DO_NOT_SHARE.csv", csvContent);
  console.log("Wallets CSV file saved successfully.");
}

export function createWallets(walletCount) {
  let wallets = [];
  for (let i = 0; i < walletCount; i++) {
    const wallet = createWallet();
    wallets.push({
      index: i,
      publicKey: wallet.publicKey,
      secretKeyEncoded: wallet.secretKeyEncoded,
    });
  }
  createCsv(wallets);
  console.info(`Your bot wallet address is ${wallets[0].publicKey}. Please provide a balance of 0.05 SOL.`);
  console.info(
    `To view your private keys, open the _CONFIDENTIAL_DO_NOT_SHARE.csv file.`
  );
}

export function readWallets() {
  if (!existsSync("_CONFIDENTIAL_DO_NOT_SHARE.csv")) {
    return null;
  }

  const csvData = readFileSync("_CONFIDENTIAL_DO_NOT_SHARE.csv", "utf8");
  const lines = csvData.split("\n");
  const wallets = lines
    .slice(1)
    .filter((line) => line)
    .map((line) => {
      const [index, publicKey, privateKey] = line.split(",");
      return { index: parseInt(index, 10), publicKey, privateKey };
    });
  console.log("Wallets loaded successfully:", wallets.length);
  return wallets;
}
