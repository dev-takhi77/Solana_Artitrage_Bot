import { Connection, VersionedTransaction, PublicKey } from "@solana/web3.js";
import fetch from "cross-fetch";
import dotenv from "dotenv";
import { Bundle } from "jito-ts/dist/sdk/block-engine/types.js";

dotenv.config();
let arbInSolLamports;
const prioritizationFeeLamports = 1;
let arbRequestSent = false;

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

export async function runArb(
  lamportsUsedForSwaps,
  mint,
  wallet,
  connection,
  client
) {
  if (mint === `So11111111111111111111111111111111111111112`) return false;

  try {
    const { swapInResponse, swapOutResponse } = await getArbQuotes(
      mint,
      lamportsUsedForSwaps
    );

    if (!swapInResponse) {
      console.log(`No arb found, continuing...`);
      return false;
    }

    let [swapInTx, swapOutTx, blockhashResponse] = await Promise.all([
      getSwapTx(wallet, swapInResponse),
      getSwapTx(wallet, swapOutResponse),
      connection.getLatestBlockhash(),
    ]);

    const blockhash = blockhashResponse.blockhash;

    await sendBundle(wallet, client, swapInTx, swapOutTx, blockhash);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function getArbQuotes(mint, amountLamports) {
  //      `http://127.0.0.1:8080/quote?inputMint=So11111111111111111111111111111111111111112\

  const swapInResponse = await fetch(
    `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112\
&outputMint=${mint}\
&amount=${amountLamports}\
&autoSlippage=true`
  );

  if (!swapInResponse.ok)
    console.log(`Swap-in Status Code: ${swapInResponse.status}`);

  const swapIn = await swapInResponse.json();

  // rateLimiter.recordCall(swapInResponse.status);

  const minInAmountAfterSlippage = Math.floor(
    +swapIn.outAmount * (1 - +swapIn.slippageBps / 100 / 100)
  );

  const swapOutResponse = await fetch(
    `https://quote-api.jup.ag/v6/quote?inputMint=${mint}\
&outputMint=So11111111111111111111111111111111111111112\
&amount=${minInAmountAfterSlippage}\
&autoSlippage=true`
  );

  // Log the HTTP status code from the response
  if (!swapOutResponse.ok)
    console.log(`Swap-out Status Code: ${swapOutResponse.status}`);

  // Now that the status is logged, proceed to extract the JSON
  const swapOut = await swapOutResponse.json();

  // rateLimiter.recordCall(swapOutResponse.status);

  const minOutAmountAfterSlippage = Math.floor(
    +swapOut.outAmount * (1 - +swapOut.slippageBps / 100 / 100)
  );

  const arbedAmountInLamports = minOutAmountAfterSlippage - amountLamports;

  const arbPercentageAfterFees =
    (arbedAmountInLamports -
      5000 - //swapIn
      5000 - //swapOut
      6000 - // swap in & out jito tip
      5000 - // swap to Poody
      6000 - // swap to Poody jitp tip
      5000 - // close account
      6000 - // close account jitp tip
      5000 - // possible burn
      6000 - // possible burn jito tip
      5 * prioritizationFeeLamports) /
    amountLamports;

  if (arbPercentageAfterFees > 0) {
    //if (true) {

    arbInSolLamports = arbedAmountInLamports;
    console.log(
      `${new Date().toISOString()} arbPercentageAfterFees = [${
        arbPercentageAfterFees * 100
      }%], arbInSolLamports = [${arbInSolLamports}]`
    );

    return { swapInResponse: swapIn, swapOutResponse: swapOut };
  }

  return { swapInResponse: null, swapOutResponse: null };
}

async function sendBundle(wallet, client, swapInTx, swapOutTx, blockhash) {
  let bundle = new Bundle([swapInTx, swapOutTx], 3);
  bundle.addTipTx(wallet.payer, 1000, getRandomTipAccount(), blockhash);

  const resp = await client.sendBundle(bundle);
  console.log(`${new Date().toISOString()} ${resp}`);
}

async function getSwapTx(wallet, quoteResponse) {
  const swapTransactionRequest = await fetch(
    "https://quote-api.jup.ag/v6/swap",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // quoteResponse from /quote api
        quoteResponse,
        // user public key to be used for the swap
        userPublicKey: wallet.publicKey.toString(),
        // auto wrap and unwrap SOL. default is true
        wrapAndUnwrapSol: true,
        // feeAccount is optional. Use if you want to charge a fee.  feeBps must have been passed in /quote API.
        // feeAccount: "fee_account_public_key"
        //dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: prioritizationFeeLamports,
      }),
    }
  );

  console.log(`Swap-tx Status Code: ${swapTransactionRequest.status}`);

  const { swapTransaction } = await swapTransactionRequest.json();

  const swapTransactionBuf = Buffer.from(swapTransaction, "base64");
  var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

  // sign the transaction
  transaction.sign([wallet.payer]);

  return transaction;
}
