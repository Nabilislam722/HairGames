// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

// Test-only stand-in for the Mintora marketplace (Mintora/packages/marketcontract/contracts/
// NftMarketplace.sol): the same listing calls and checks, and the same payout of a 5% fee plus the
// NFT's ERC-2981 royalty. Used by test/Venom.test.js and for rehearsing `venom:list`. Never deployed.
contract MockMarketplace {
    struct Listing {
        address seller;
        uint256 price;
    }

    uint256 public constant FEE_BPS = 500;
    mapping(address => mapping(uint256 => Listing)) private s_listings;

    event ItemListed(address indexed seller, address indexed nft, uint256 indexed tokenId, uint256 price);
    event ItemSold(address indexed buyer, address indexed nft, uint256 indexed tokenId, uint256 price);

    function listItem(address nft, uint256 tokenId, uint256 price) external {
        require(price > 0, "Price > 0");
        require(IERC721(nft).ownerOf(tokenId) == msg.sender, "Not owner");
        require(
            IERC721(nft).getApproved(tokenId) == address(this) || IERC721(nft).isApprovedForAll(msg.sender, address(this)),
            "Not approved"
        );
        s_listings[nft][tokenId] = Listing(msg.sender, price);
        emit ItemListed(msg.sender, nft, tokenId, price);
    }

    function updateListing(address nft, uint256 tokenId, uint256 newPrice) external {
        require(newPrice > 0, "Price > 0");
        Listing storage listing = s_listings[nft][tokenId];
        require(listing.seller == msg.sender, "Not seller");
        listing.price = newPrice;
    }

    function cancelListing(address nft, uint256 tokenId) external {
        require(s_listings[nft][tokenId].seller == msg.sender, "Not seller");
        delete s_listings[nft][tokenId];
    }

    function getListing(address nft, uint256 tokenId) external view returns (Listing memory) {
        return s_listings[nft][tokenId];
    }

    function buyItem(address nft, uint256 tokenId) external payable {
        Listing memory listing = s_listings[nft][tokenId];
        require(listing.price > 0, "Not listed");
        require(msg.value == listing.price, "Wrong ETH");
        delete s_listings[nft][tokenId];

        uint256 fee = (msg.value * FEE_BPS) / 10_000;
        (address royaltyReceiver, uint256 royalty) = IERC165(nft).supportsInterface(type(IERC2981).interfaceId)
            ? IERC2981(nft).royaltyInfo(tokenId, msg.value)
            : (address(0), 0);
        if (royalty > 0) payable(royaltyReceiver).transfer(royalty);
        payable(listing.seller).transfer(msg.value - fee - royalty);

        IERC721(nft).safeTransferFrom(listing.seller, msg.sender, tokenId);
        emit ItemSold(msg.sender, nft, tokenId, msg.value);
    }
}
