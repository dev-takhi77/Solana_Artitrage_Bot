export function getMintsAndAmounts(accounts, programId) {
  const mintsAndAmounts = accounts.map((account) => {
    return {
      mint: account.account.data.parsed.info.mint,
      amount: +account.account.data.parsed.info.tokenAmount.amount,
      account: account,
      programId: programId
    };
  });

  // console.log(`getMintsAndAmounts: Found ${mintsAndAmounts.length} mints`);
  return mintsAndAmounts;
}
