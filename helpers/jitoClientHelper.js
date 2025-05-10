// helpers/jitoLocationHelper.js
import readline from 'readline';
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { searcherClient as jitoSearcherClient } from "jito-ts/dist/sdk/block-engine/searcher.js";
import { jitoAuthSecretKey } from './settings.js';

const locations = {
  1: "amsterdam.mainnet.block-engine.jito.wtf",
  2: "frankfurt.mainnet.block-engine.jito.wtf",
  3: "ny.mainnet.block-engine.jito.wtf",
  4: "tokyo.mainnet.block-engine.jito.wtf",
};

export function chooseLocation() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log("Choose the closest location to you:");
        console.log("1: Amsterdam");
        console.log("2: Frankfurt");
        console.log("3: New York");
        console.log("4: Tokyo");

        rl.question('Enter the number of your choice: ', (answer) => {
            const choice = parseInt(answer.trim(), 10);
            const location = locations[choice];
            if (location) {
                console.log(`You selected: ${location}`);
                resolve(location);
            } else {
                console.log("Invalid selection. Please select a valid number.");
                rl.close();
                resolve(chooseLocation());
            }
            rl.close();
        });
    });
}

export function getClient(relayerUrl) {
  const authKeyPair = Keypair.fromSecretKey(bs58.decode(jitoAuthSecretKey));
  const client = jitoSearcherClient(relayerUrl, authKeyPair, {
    "grpc.keepalive_timeout_ms": 4000,
  });
  return client;
}