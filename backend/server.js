import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import routes from "./routes/index.js";
import { nft } from "./services/nft.js";

dotenv.config();

const app = express();

app.use(cors({
  origin: ["https://game.hairtoken.xyz"],
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// Connect to DB, Start Services, and Start Server
connectDB().then(() => {
  nft.start();
  
  app.use("/api", routes);

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(err => {
  console.error("Failed to start server:", err);
});