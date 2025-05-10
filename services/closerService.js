import { getMintsAndAmounts } from "../helpers/accountHelper.js";
import { get2022TokenAccounts, getSplTokenAccounts } from "./rpcService.js";
import { poodyMint } from "../helpers/settings.js";

import {
  PublicKey,
  sendAndConfirmRawTransaction,
  sendAndConfirmTransaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createCloseAccountInstruction,
  createBurnCheckedInstruction,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  closeAccount,
  getAccount,
  harvestWithheldTokensToMint,
} from "@solana/spl-token";
import { Bundle } from "jito-ts/dist/sdk/block-engine/types.js";

export async function runCloser(wallet, connection, client) {
  const slpTokenAccounts = await getSplTokenAccounts(
    wallet.publicKey,
    connection
  );

  const accountsToSell = slpTokenAccounts.value.filter(
    (account) => account.account.data.parsed.info.mint != poodyMint
  );

  const splMintsAndAmounts = getMintsAndAmounts(accountsToSell, TOKEN_PROGRAM_ID);

  const token2022TokenAccounts = await get2022TokenAccounts(
    wallet.publicKey,
    connection
  );

  const token2022MintsAndAmounts = getMintsAndAmounts(
    token2022TokenAccounts.value,
    TOKEN_2022_PROGRAM_ID
  );

  const mintsAndAmounts = [...splMintsAndAmounts, ...token2022MintsAndAmounts]; 

  if (mintsAndAmounts.length <= 0) return;

  const { mint, amount, account, programId } = mintsAndAmounts[0];
  console.log(`Cleanup: Picking ${amount} of ${mint}`);

  // const accountThing = await getAccount(connection, account.pubkey, "confirmed", TOKEN_2022_PROGRAM_ID);

  let tx = null;

  if (amount > 0) {
    console.log(`Preparing to sell...`);
    let quoteResponse = null;

    let attempts = 0;
    while (attempts < 10) {
      try {
        let response = await getQuote(mint, poodyMint, amount, false);
        if (response.status === 200 && response.data) {
          quoteResponse = response.data;
          tx = await getSwapTransaction(wallet, quoteResponse, 1);
          break; // Exit the loop if transaction is successfully fetched
        } else if (response.status === 429) {
          console.log(
            `Attempt failed with status 429 (Too Many Requests), retrying in 60 seconds...`
          );
          await new Promise((r) => setTimeout(r, 60000));
        } else if (response.status === 400) {
          attempts++;
          console.log(
            `Attempt failed with status ${response.status}, retrying in 1 second...`
          );
          await new Promise((r) => setTimeout(r, 1000));
        }

        console.log(
          `Attempt failed with status ${response.status}, retrying in 1 second...`
        );
        await new Promise((r) => setTimeout(r, 1000));
      } catch (error) {
        console.log(
          `Attempt failed due to an exception, retrying in 10 seconds...`
        );
        await new Promise((r) => setTimeout(r, 10000));
      }
    }

    if (!tx) {
      console.log(
        "Failed to get swap transaction after retries, proceeding to burn tokens."
      );
      const burnIx = createBurnCheckedInstruction(
        account.pubkey, // PublicKey of Owner's Associated Token Account
        new PublicKey(mint), // Public Key of the Token Mint Address
        wallet.publicKey, // Public Key of Owner's Wallet
        amount, // Number of tokens to burn
        account.account.data.parsed.info.tokenAmount.decimals, // You'll need to define TOKEN_DECIMALS based on your token specifics
        [],
        programId
      );
      const blockhash = await getBlockhash(connection);
      tx = createTransaction([burnIx], wallet, blockhash);
    }
  } else if (amount === 0) {
    console.log(`Preparing to close...`);
    const closeAccountInx = getCloseAccountInx(account, wallet, programId);
    const blockhash = await getBlockhash(connection);
    tx = createTransaction([closeAccountInx], wallet, blockhash);
  }

  // Common blockhash, sign, and send logic
  if (tx) {
    const blockhash = await getBlockhash(connection);
    tx.sign([wallet.payer]);

// const rawTransaction = tx.serialize();
// const signature = await sendAndConfirmRawTransaction(
//   connection,
//   rawTransaction
// );
    
    
    await sendBundleWithMultipleTxs(wallet, [tx], blockhash, client);
  }
}

//#region jupiterService
async function getQuote(inputMint, outputMint, amount, onlyDirectRoutes) {
  const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}\
&outputMint=${outputMint}\
&amount=${amount}\
&slippageBps=100&computeAutoSlippage=true&swapMode=ExactIn&onlyDirectRoutes=false&asLegacyTransaction=false&maxAccounts=64&minimizeSlippage=false`;

  const response = await fetch(url);

  if (!response.ok) {
    console.error(
      `Failed to fetch quote: ${response.status} ${response.statusText}`
    );
    return { status: response.status, data: null };
  }

  const quoteResponse = await response.json();

  if (!quoteResponse || typeof quoteResponse !== "object") {
    console.error("Invalid response format received from quote API");
    return { status: 422, data: null };
  }

  return { status: response.status, data: quoteResponse };
}

async function getSwapTransaction(
  wallet,
  quoteResponse,
  prioritizationFeeLamports
) {
  const response = await fetch("https://quote-api.jup.ag/v6/swap", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: wallet.publicKey.toString(),
      wrapAndUnwrapSol: true,
      prioritizationFeeLamports: prioritizationFeeLamports,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch swap transaction: ${response.status} ${response.statusText}`
    );
  }

  const responseData = await response.json();

  if (!responseData || !responseData.swapTransaction) {
    throw new Error(
      "Invalid or missing swap transaction data received from API"
    );
  }

  const swapTransactionBuf = Buffer.from(
    responseData.swapTransaction,
    "base64"
  );
  return VersionedTransaction.deserialize(swapTransactionBuf);
}

//#endregion

//#region rpcService

async function getBlockhash(connection) {
  return (await connection.getLatestBlockhash()).blockhash;
}

//#endregion

//#region jitoService
const TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
].map((pubkey) => new PublicKey(pubkey));

const getRandomTipAccount = () =>
  TIP_ACCOUNTS[Math.floor(Math.random() * TIP_ACCOUNTS.length)];

async function sendBundleWithMultipleTxs(wallet, txs, blockhash, client) {
  const tipLamports = 1000;

  let bundle = new Bundle(txs, txs.length + 1);
  bundle.addTipTx(wallet.payer, tipLamports, getRandomTipAccount(), blockhash);

  const resp = await client.sendBundle(bundle);
  console.log(
    `${new Date().toISOString()} Bundle requested: https://explorer.jito.wtf/bundle/${resp}`
  );
}

//#endregion

//#region tokenHelper
function getCloseAccountInx(account, wallet, programId) {
  const closeInstruction = createCloseAccountInstruction(
    account.pubkey,
    wallet.publicKey, // Send remaining SOL to the wallet
    wallet.publicKey, // Authority to close the account
    [],
    programId
  );

  return closeInstruction;
}

//#endregion

//#region transactionHelper
function createTransaction(inxs, wallet, blockhash) {
  const messageV0 = new TransactionMessage({
    payerKey: wallet.payer.publicKey,
    recentBlockhash: blockhash,
    instructions: inxs,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);

  return transaction;
}
//#endregion
