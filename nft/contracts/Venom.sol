// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title Venom
 * @notice The #27 Venom, the OP bike of Moto Rush on HairGames. A fixed edition of `maxSupply`
 * identical tokens numbered from 1, built from nft/venom/launch.config.json by scripts/deploy-venom.js.
 *
 *  - Minting: only the owner mints, for the gas alone, and sells the tokens on a marketplace.
 *  - Metadata lives in the contract: tokenURI() and contractURI() return the JSON itself, so wallets
 *    and marketplaces never wait on a metadata server or gateway. Only the image is fetched (IPFS).
 *  - The owner can correct the metadata until freezing it for good.
 *  - Royalties: ERC-2981, which marketplaces such as Mintora pay out on every sale.
 *  - Enumerable, so the HairGames NFT indexer can list a wallet's tokens when it repairs holdings.
 */
contract Venom is ERC721Enumerable, ERC2981, Ownable {
    using Strings for uint256;

    uint256 public immutable maxSupply;
    bool public metadataFrozen;

    // JSON pieces from the deploy script, already escaped: the fields every token shares
    // ("description":…,"image":…), its attributes as comma-separated objects, and the whole
    // collection-level document.
    string private _tokenFields;
    string private _attributes;
    string private _contractJson;

    event MetadataFrozen();
    /// ERC-4906: marketplaces refresh the metadata of tokens `fromTokenId` to `toTokenId`.
    event BatchMetadataUpdate(uint256 fromTokenId, uint256 toTokenId);
    /// ERC-7572: the collection metadata at contractURI() changed.
    event ContractURIUpdated();

    error ZeroSupply();
    error ZeroQuantity();
    error ExceedsSupply();
    error MetadataIsFrozen();

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 maxSupply_,
        string memory tokenFields_,
        string memory attributes_,
        string memory contractJson_,
        address royaltyReceiver,
        uint96 royaltyBps
    ) ERC721(name_, symbol_) Ownable(msg.sender) {
        if (maxSupply_ == 0) revert ZeroSupply();
        maxSupply = maxSupply_;
        _tokenFields = tokenFields_;
        _attributes = attributes_;
        _contractJson = contractJson_;
        _setDefaultRoyalty(royaltyReceiver, royaltyBps);
    }

    /// Mints the next `quantity` tokens to `to`.
    function ownerMint(address to, uint256 quantity) external onlyOwner {
        if (quantity == 0) revert ZeroQuantity();
        uint256 first = totalSupply() + 1;
        if (first + quantity - 1 > maxSupply) revert ExceedsSupply();
        for (uint256 i = 0; i < quantity; i++) _safeMint(to, first + i);
    }

    // ── Metadata ───────────────────────────────────────────────────────────

    /// The token's JSON, inline: {"name":"Venom #7", …shared fields, "attributes":[…, Edition 7]}.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory id = tokenId.toString();
        string memory separator = bytes(_attributes).length > 0 ? string(",") : string("");
        string memory head = string.concat('{"name":"', name(), " #", id, '",', _tokenFields, ',"attributes":[', _attributes, separator);
        string memory edition = string.concat(
            '{"trait_type":"Edition","display_type":"number","value":', id, ',"max_value":', maxSupply.toString(), "}]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(string.concat(head, edition))));
    }

    /// The collection's JSON for marketplaces, inline.
    function contractURI() external view returns (string memory) {
        return string.concat("data:application/json;base64,", Base64.encode(bytes(_contractJson)));
    }

    /// Replaces the metadata, for a better image link, say. Wallets and marketplaces are told to refresh.
    function setMetadata(string calldata tokenFields_, string calldata attributes_, string calldata contractJson_) external onlyOwner {
        if (metadataFrozen) revert MetadataIsFrozen();
        _tokenFields = tokenFields_;
        _attributes = attributes_;
        _contractJson = contractJson_;
        emit BatchMetadataUpdate(1, maxSupply);
        emit ContractURIUpdated();
    }

    /// Locks the metadata for good.
    function freezeMetadata() external onlyOwner {
        metadataFrozen = true;
        emit MetadataFrozen();
    }

    function setRoyalty(address receiver, uint96 bps) external onlyOwner {
        _setDefaultRoyalty(receiver, bps);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721Enumerable, ERC2981) returns (bool) {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId); // + ERC-4906
    }
}
