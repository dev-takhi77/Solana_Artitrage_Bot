import fetch from "node-fetch";

export async function getMints() {
  try {
    const tokenMintsResponse = await fetch(
      "https://stats.jup.ag/coingecko/tickers"
    );
    if (!tokenMintsResponse.ok) {
      throw new Error(`Error fetching the tickers: ${tokenMintsResponse.status}`);
    }
    const tokenMintsJson = await tokenMintsResponse.json();
    const tokenMints = tokenMintsJson.map((item) => item.base_address);
    return tokenMints;
  } catch (error) {
    console.error("Failed to fetch token mints:", error);
    throw new Error(`Error fetching the tickers:`);
  }
}
