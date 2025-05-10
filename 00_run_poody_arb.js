// 00_run_poody_arb.js
import { createWallets, readWallets } from "./services/walletService.js";
import { getMints } from "./services/tickerService.js";
import { chooseLocation, getClient } from "./helpers/jitoClientHelper.js";
import { getConnection } from "./helpers/rpcHelper.js";
import bs58 from "bs58";
import { Wallet } from "@project-serum/anchor";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getNativeBalance } from "./services/rpcService.js";
import { runCloser } from "./services/closerService.js";
import { runArb } from "./services/arbService.js";

let jitoBlockEngineAddress;
const solMint = `So11111111111111111111111111111111111111112`;
const defaultLamportsUsedForSwaps = 0.001 * LAMPORTS_PER_SOL;

async function main() {
  let wallets = readWallets();
  if (!wallets) {
    createWallets(1);
    wallets = readWallets();
  }

  const arbWallet = new Wallet(
    Keypair.fromSecretKey(bs58.decode(wallets[0].privateKey))
  );

  while (true) {
    try {
      //override for tests
      //jitoBlockEngineAddress = "frankfurt.mainnet.block-engine.jito.wtf";

      if (!jitoBlockEngineAddress)
        jitoBlockEngineAddress = await chooseLocation();

      const connection = getConnection();
      const client = getClient(jitoBlockEngineAddress);

      while (true) {
        const lamportsBalance = await getNativeBalance(
          arbWallet.publicKey.toString(),
          solMint
        );

        if (lamportsBalance < 0.02 * LAMPORTS_PER_SOL) {
          console.log(
            `Wallet's SOL balance is low. Suggested minimum balance is 0.05 SOL.\nYour wallet address is ${arbWallet.publicKey.toString()}\nRetrying in 60s...`
          );
          await new Promise((r) => setTimeout(r, 60000));
        } else {
          let tokenMints = await getMints();

          let arbRequestSent = false;
          let lamportsUsedForSwaps = defaultLamportsUsedForSwaps;

          for (let index = 0; index < tokenMints.length; index++) {
            if (arbRequestSent) {
              lamportsUsedForSwaps = lamportsUsedForSwaps * 3;
            } else {
              lamportsUsedForSwaps = defaultLamportsUsedForSwaps;
              await runCloser(arbWallet, connection, client);
              await new Promise((r) => setTimeout(r, 3000));
            }

            const mint = tokenMints[index];
            arbRequestSent = await runArb(
              lamportsUsedForSwaps,
              mint,
              arbWallet,
              connection,
              client
            );
          }
        }
      }
    } catch (err) {
      console.error("Error:", err.message);
    }
  }
}

main();
