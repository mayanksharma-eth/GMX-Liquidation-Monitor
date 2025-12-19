// GMX v1 Contract ABIs (minimal required methods)

export const VAULT_ABI = [
  "function getPosition(address _account, address _collateralToken, address _indexToken, bool _isLong) view returns (uint256 size, uint256 collateral, uint256 averagePrice, uint256 entryFundingRate, uint256 reserveAmount, int256 realisedPnl, uint256 lastIncreasedTime)",
  "function getMaxPrice(address _token) view returns (uint256)",
  "function getMinPrice(address _token) view returns (uint256)",
  "function tokenDecimals(address _token) view returns (uint256)",
  "function liquidationFeeUsd() view returns (uint256)",
  "function marginFeeBasisPoints() view returns (uint256)",
  "function taxBasisPoints() view returns (uint256)"
];

export const READER_ABI = [
  "function getPositions(address _vault, address _account, address[] memory _collateralTokens, address[] memory _indexTokens, bool[] memory _isLong) view returns (uint256[] memory)"
];

// GMX v1 Arbitrum Addresses
export const CONTRACTS = {
  VAULT: "0x489ee077994B6658eAfA855C308275EAd8097C4A",
  READER: "0x22199a49A999c351eF7927602CFB187ec3cae489"
};

// Common tokens on GMX v1
export const TOKENS = {
  ETH: {
    address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    symbol: "ETH",
    decimals: 18
  },
  BTC: {
    address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
    symbol: "BTC",
    decimals: 8
  },
  USDC: {
    address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
    symbol: "USDC",
    decimals: 6
  }
};

export const MARKET_TOKENS = [
  TOKENS.ETH,
  TOKENS.BTC
];
