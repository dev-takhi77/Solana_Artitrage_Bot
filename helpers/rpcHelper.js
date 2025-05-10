// helpers/rpcHelper.js
import { Connection } from "@solana/web3.js";
import { solanaRpcUrl } from "./settings.js";

export function getConnection() {
  const connection = new Connection(solanaRpcUrl);
  return connection;
}