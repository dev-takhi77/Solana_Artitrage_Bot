import fetch from "node-fetch";
import { solanaRpcUrl } from "../helpers/settings.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID
} from "@solana/spl-token";

export async function getNativeBalance(publicKey, mint) {
  if (mint === "So11111111111111111111111111111111111111112") {
    return await getSolBalanceInLamports(publicKey);
  } else {
    return await getTokenBalanceInInt(publicKey, mint);
  }
}

export async function getSplTokenAccounts(publicKey, connection) {
  const parsedTokenAccountsByOwner =
    await connection.getParsedTokenAccountsByOwner(publicKey, {
      programId: TOKEN_PROGRAM_ID,
    });

  // console.log(
  //   `getAllTokenAccounts: Found ${parsedTokenAccountsByOwner.value.length} accounts`
  // );

  return parsedTokenAccountsByOwner;
}

export async function get2022TokenAccounts(publicKey, connection) {
  const parsedTokenAccountsByOwner =
    await connection.getParsedTokenAccountsByOwner(publicKey, {
      programId: TOKEN_2022_PROGRAM_ID,
    });

  // console.log(
  //   `getAllTokenAccounts: Found ${parsedTokenAccountsByOwner.value.length} accounts`
  // );

  return parsedTokenAccountsByOwner;
}

async function getSolBalanceInLamports(publicKey) {
  const url = solanaRpcUrl;
  const data = {
    jsonrpc: "2.0",
    id: 1,
    method: "getBalance",
    params: [
      publicKey,
      {
        commitment: "confirmed",
      },
    ],
  };

  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  };

  try {
    const response = await fetch(url, requestOptions);
    const responseData = await response.json();
    return responseData.result.value;
  } catch (error) {
    console.error("Error:", error);
    throw error; // Rethrow the error to be caught by the caller
  }
}

async function getTokenBalanceInInt(publicKey, mint) {
  const url = solanaRpcUrl;
  const data = {
    jsonrpc: "2.0",
    id: 1,
    method: "getTokenAccountsByOwner",
    params: [
      publicKey,
      {
        mint: mint,
      },
      {
        encoding: "jsonParsed",
        commitment: "confirmed",
      },
    ],
  };

  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  };

  try {
    const response = await fetch(url, requestOptions);
    const responseData = await response.json();

    if (responseData.result.value.length === 0) {
      return 0;
    } else {
      return responseData.result.value[0].account.data.parsed.info.tokenAmount
        .amount;
    }
  } catch (error) {
    console.error("Error:", error);
    throw error; // Rethrow the error to be caught by the caller
  }
}
