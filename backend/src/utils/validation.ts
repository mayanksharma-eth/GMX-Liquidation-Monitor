import { ethers } from 'ethers';

export function isValidAddress(address: string): boolean {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
}

export function normalizeAddress(address: string): string {
  return ethers.getAddress(address);
}
