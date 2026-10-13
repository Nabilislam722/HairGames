// The app's NFT indexer: started by server.js, read by the profile route and HP crediting.
import { provider } from "../config/provider.js";
import { createNftIndexer } from "./nftIndexer.js";
import { mongoNftStore } from "./nftStore.js";

export const nft = createNftIndexer({ provider, store: mongoNftStore });
