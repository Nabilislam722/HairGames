const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { constructorArgs, decodeJsonUri, launchProblems, metadataPieces, readLaunchConfig } = require("../scripts/venom-lib");

const { ethers } = hre;
const IMAGE = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const loadGenerator = () => import(pathToFileURL(join(__dirname, "..", "venom", "generate-metadata.mjs")).href);

async function deployVenom() {
  const [owner, alice, bob, treasury] = await ethers.getSigners();
  const base = readLaunchConfig();
  const config = { ...base, image: IMAGE, royalty: { ...base.royalty, recipient: treasury.address } };
  const venom = await (await ethers.getContractFactory("Venom")).deploy(...(await constructorArgs(config, owner.address)));
  const market = await (await ethers.getContractFactory("MockMarketplace")).deploy();
  return { venom, market, config, owner, alice, bob, treasury };
}

describe("Venom", () => {
  it("deploys as a 50-token edition owned by the deployer, nothing minted", async () => {
    const { venom, owner } = await loadFixture(deployVenom);
    expect(await venom.name()).to.equal("Venom");
    expect(await venom.symbol()).to.equal("VENOM");
    expect(await venom.maxSupply()).to.equal(50n);
    expect(await venom.totalSupply()).to.equal(0n);
    expect(await venom.owner()).to.equal(owner.address);
  });

  it("lets only the owner mint, numbering from 1 and never past the supply", async () => {
    const { venom, owner, alice } = await loadFixture(deployVenom);
    await expect(venom.connect(alice).ownerMint(alice.address, 1)).to.be.revertedWithCustomError(venom, "OwnableUnauthorizedAccount");
    await venom.ownerMint(owner.address, 49);
    expect(await venom.ownerOf(1)).to.equal(owner.address);
    expect(await venom.ownerOf(49)).to.equal(owner.address);
    await expect(venom.ownerMint(owner.address, 2)).to.be.revertedWithCustomError(venom, "ExceedsSupply");
    await venom.ownerMint(alice.address, 1);
    expect(await venom.ownerOf(50)).to.equal(alice.address);
    await expect(venom.ownerMint(owner.address, 1)).to.be.revertedWithCustomError(venom, "ExceedsSupply");
    await expect(venom.ownerMint(owner.address, 0)).to.be.revertedWithCustomError(venom, "ZeroQuantity");
  });

  it("serves each token's metadata on-chain, exactly as the preview shows it", async () => {
    const { venom, owner, config } = await loadFixture(deployVenom);
    await venom.ownerMint(owner.address, 7);
    const uri = await venom.tokenURI(7);
    expect(uri.startsWith("data:application/json;base64,")).to.equal(true);

    const { buildMetadata, tokenJson } = await loadGenerator();
    const { token } = await buildMetadata(config);
    const json = decodeJsonUri(uri);
    expect(json).to.deep.equal(tokenJson(config, token, 7));
    expect(json.name).to.equal("Venom #7");
    expect(json.image).to.equal(IMAGE);
    expect(json.attributes).to.deep.include({ trait_type: "Moto Rush HP Bonus", value: "+0.2x" });
    expect(json.attributes.at(-1)).to.deep.equal({ trait_type: "Edition", display_type: "number", value: 7, max_value: 50 });
    await expect(venom.tokenURI(8)).to.be.revertedWithCustomError(venom, "ERC721NonexistentToken");
  });

  it("serves the collection metadata with the royalty receiver", async () => {
    const { venom, treasury } = await loadFixture(deployVenom);
    const collection = decodeJsonUri(await venom.contractURI());
    expect(collection).to.include({ name: "Venom", image: IMAGE, seller_fee_basis_points: 500, fee_recipient: treasury.address });
  });

  it("lets the owner correct the metadata, with refresh events, until it's frozen", async () => {
    const { venom, owner, alice, config } = await loadFixture(deployVenom);
    await venom.ownerMint(owner.address, 1);
    const fixed = "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
    const { tokenFields, attributes, contractJson } = await metadataPieces({ ...config, image: fixed }, owner.address);

    await expect(venom.connect(alice).setMetadata(tokenFields, attributes, contractJson)).to.be.revertedWithCustomError(venom, "OwnableUnauthorizedAccount");
    await expect(venom.setMetadata(tokenFields, attributes, contractJson))
      .to.emit(venom, "BatchMetadataUpdate").withArgs(1n, 50n)
      .and.to.emit(venom, "ContractURIUpdated");
    expect(decodeJsonUri(await venom.tokenURI(1)).image).to.equal(fixed);

    await venom.freezeMetadata();
    await expect(venom.setMetadata(tokenFields, attributes, contractJson)).to.be.revertedWithCustomError(venom, "MetadataIsFrozen");
  });

  it("sells on a Mintora-style marketplace, paying the 5% royalty", async () => {
    const { venom, market, owner, bob, treasury } = await loadFixture(deployVenom);
    const price = ethers.parseEther("0.01");
    await venom.ownerMint(owner.address, 3);
    await venom.setApprovalForAll(await market.getAddress(), true);
    await market.listItem(await venom.getAddress(), 2, price);

    const royalty = (price * 500n) / 10_000n;
    const fee = (price * 500n) / 10_000n;
    await expect(market.connect(bob).buyItem(await venom.getAddress(), 2, { value: price }))
      .to.changeEtherBalances([treasury, owner], [royalty, price - fee - royalty]);
    expect(await venom.ownerOf(2)).to.equal(bob.address);
    expect(await venom.balanceOf(bob.address)).to.equal(1n);
  });

  it("lists a wallet's tokens, as the HairGames indexer does when it repairs holdings", async () => {
    const { venom, alice, bob } = await loadFixture(deployVenom);
    await venom.ownerMint(alice.address, 1);
    await venom.ownerMint(bob.address, 1);
    await venom.ownerMint(alice.address, 1);
    expect(await venom.tokenOfOwnerByIndex(alice.address, 0)).to.equal(1n);
    expect(await venom.tokenOfOwnerByIndex(alice.address, 1)).to.equal(3n);
  });

  it("reports ERC-721, Enumerable, ERC-2981 and ERC-4906 support", async () => {
    const { venom } = await loadFixture(deployVenom);
    for (const id of ["0x80ac58cd", "0x780e9d63", "0x2a55205a", "0x49064906"]) expect(await venom.supportsInterface(id)).to.equal(true);
  });

  it("won't deploy with a placeholder or malformed image link", () => {
    const config = readLaunchConfig();
    const imageProblem = (image) => launchProblems({ ...config, image }).some((p) => p.startsWith("image"));
    expect(imageProblem("ipfs://PASTE_IMAGE_CID_HERE")).to.equal(true);
    expect(imageProblem("https://ipfs.io/ipfs/" + IMAGE.slice(7))).to.equal(false);
    expect(imageProblem(IMAGE)).to.equal(false);
    expect(imageProblem(`${IMAGE}/venom.png`)).to.equal(false);
    expect(imageProblem("bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")).to.equal(true);
  });
});
