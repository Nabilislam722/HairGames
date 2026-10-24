// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

// Test-only collections for the backend NFT indexer tests (test/NftIndexer.test.js). Not deployed.

contract MockERC721 is ERC721 {
    constructor() ERC721("Mock", "MOCK") {}

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }

    function burn(uint256 tokenId) external {
        _burn(tokenId);
    }
}

contract MockERC721Enumerable is ERC721Enumerable {
    constructor() ERC721("Mock Enumerable", "MENUM") {}

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }
}
